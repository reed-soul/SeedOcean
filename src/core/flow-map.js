// FlowMap — CPU-authored RGBA field that drives spatially-varying surface flow
// and wet-shore foam. Consumed by the FFT surface shader the same way WakeField
// is: a DataTexture sampled in world XZ.
//
// Channel contract (seedocean-flowmap/1):
//   R  flow X   — signed direction, encoded as (v * 0.5 + 0.5) * 255, v ∈ [-1, 1]
//   G  flow Z   — same encoding
//   B  speed    — [0, 1] multiplier on the preset's base flow.speed (255 = 1×)
//   A  shore    — wet-shore / breaking foam coverage [0, 1]
//
// Baking is pure CPU. The GPU only sees the uploaded texture. A 1×1 neutral
// map (R=G=128, B=A=0) is a no-op: uniform flow (preset.flow) still works, and
// shore foam stays off.

import {
  DataTexture,
  RGBAFormat,
  UnsignedByteType,
  LinearFilter,
  ClampToEdgeWrapping,
} from 'three/webgpu';

/** Schema tag for serialized flowmap payloads (future editor export). */
export const FLOWMAP_FORMAT = 'seedocean-flowmap/1';

const encSigned = (v) => Math.max(0, Math.min(255, Math.round((v * 0.5 + 0.5) * 255)));
const encUnit = (v) => Math.max(0, Math.min(255, Math.round(v * 255)));
const decSigned = (b) => (b / 255) * 2 - 1;
const decUnit = (b) => b / 255;

/**
 * Normalize a preset.flowmap block into a concrete bake config.
 * Missing / falsy → null (caller should skip FlowMap construction).
 * @param {object|null|undefined} raw
 * @param {{ waterType?: string, patch?: object, river?: object, terrain?: object }} [preset]
 * @returns {null | {
 *   format: string,
 *   size: number,
 *   worldExtent: number,
 *   shore: { enabled: boolean, waterLevel: number, bandWidth: number, foamStrength: number } | null,
 *   flowStrength: number,
 * }}
 */
export function normalizeFlowMapConfig(raw, preset = {}) {
  const waterType = preset.waterType ?? 'ocean';
  // Auto-enable for lake/river so shoreline foam works without every preset
  // declaring an empty flowmap block. Ocean/pool stay off unless explicit.
  const auto = waterType === 'lake' || waterType === 'river';
  if (!raw && !auto) return null;
  if (raw === false) return null;

  const cfg = raw && typeof raw === 'object' ? raw : {};
  const patchSpan = Math.max(preset.patch?.width ?? 0, preset.patch?.length ?? 0);
  const riverLen = preset.river?.length ?? 0;
  const terrainSize = preset.terrain?.size ?? 0;
  const defaultExtent = waterType === 'river'
    ? Math.max(riverLen, terrainSize * 0.4, 160)
    : Math.max(patchSpan * 1.5, terrainSize * 0.25, 100);

  const shoreRaw = cfg.shore;
  const shoreEnabled = shoreRaw === false ? false : (auto || Boolean(shoreRaw) || shoreRaw === undefined);
  const shore = shoreEnabled
    ? {
        enabled: true,
        waterLevel: shoreRaw?.waterLevel ?? 0,
        bandWidth: shoreRaw?.bandWidth ?? (waterType === 'river' ? 3.5 : 5),
        foamStrength: shoreRaw?.foamStrength ?? (waterType === 'river' ? 0.7 : 0.9),
      }
    : null;

  return {
    format: FLOWMAP_FORMAT,
    size: cfg.size ?? 256,
    worldExtent: cfg.worldExtent ?? defaultExtent,
    shore,
    flowStrength: cfg.flowStrength ?? 1,
  };
}

/**
 * @param {number} [size]
 * @param {number} [worldExtent] — meters covered, centered on world origin
 */
export class FlowMap {
  constructor(size = 256, worldExtent = 100) {
    this.size = size;
    this.worldExtent = worldExtent;
    this.data = new Uint8Array(size * size * 4);
    this.texture = new DataTexture(this.data, size, size, RGBAFormat, UnsignedByteType);
    this.texture.minFilter = LinearFilter;
    this.texture.magFilter = LinearFilter;
    // Clamp: shoreline maps are finite basins, not tiling oceans. Repeating
    // would paint fake foam rings outside the enclosure.
    this.texture.wrapS = ClampToEdgeWrapping;
    this.texture.wrapT = ClampToEdgeWrapping;
    this.texture.needsUpdate = true;
    this.dirty = false;
    this.clear();
  }

  /** Reset to neutral (no flow modulation, no shore foam). */
  clear() {
    const { data } = this;
    for (let i = 0; i < data.length; i += 4) {
      data[i] = 128;     // flow X = 0
      data[i + 1] = 128; // flow Z = 0
      data[i + 2] = 0;   // speed scale = 0
      data[i + 3] = 0;   // shore foam = 0
    }
    this.dirty = true;
  }

  /** World XZ → texel indices (clamped). */
  _xzToTexel(x, z) {
    const { size, worldExtent } = this;
    const half = worldExtent * 0.5;
    const u = (x + half) / worldExtent;
    const v = (z + half) / worldExtent;
    const tx = Math.max(0, Math.min(size - 1, Math.floor(u * size)));
    const tz = Math.max(0, Math.min(size - 1, Math.floor(v * size)));
    return { tx, tz, u, v };
  }

  /**
   * Write one texel. dir is a unit (or near-unit) XZ vector; speed ∈ [0,1];
   * shore ∈ [0,1]. Existing channels are overwritten (not blended) — bakers
   * compose in a defined order.
   */
  setTexel(tx, tz, dirX, dirZ, speed, shore) {
    const i = (tz * this.size + tx) * 4;
    const { data } = this;
    data[i] = encSigned(dirX);
    data[i + 1] = encSigned(dirZ);
    data[i + 2] = encUnit(speed);
    data[i + 3] = encUnit(shore);
    this.dirty = true;
  }

  /** Max-blend shore foam into an existing texel (keeps flow channels). */
  addShore(tx, tz, amount) {
    const i = (tz * this.size + tx) * 4;
    const next = Math.max(this.data[i + 3], encUnit(amount));
    if (next !== this.data[i + 3]) {
      this.data[i + 3] = next;
      this.dirty = true;
    }
  }

  /**
   * Fill the map with a uniform flow field. Used as the base layer before
   * river-tangent or shore bakers refine it. speedScale ∈ [0,1] multiplies
   * the shader's base flowSpeed uniform.
   */
  bakeUniformFlow(dirX, dirZ, speedScale = 1) {
    const len = Math.hypot(dirX, dirZ) || 1;
    const nx = dirX / len;
    const nz = dirZ / len;
    const s = Math.max(0, Math.min(1, speedScale));
    const { size } = this;
    for (let tz = 0; tz < size; tz++) {
      for (let tx = 0; tx < size; tx++) {
        this.setTexel(tx, tz, nx, nz, s, 0);
      }
    }
  }

  /**
   * Bake flow along a Catmull-Rom centerline (river). Each texel finds the
   * nearest polyline segment, takes its tangent as flow direction, and fades
   * speed by distance from the channel center (zero outside width/2 + margin).
   *
   * @param {number[][]} points — [[x,z], ...] centerline samples
   * @param {{ width?: number, speedScale?: number, margin?: number }} [opts]
   */
  bakeRiverFlow(points, { width = 14, speedScale = 1, margin = 2 } = {}) {
    if (!points || points.length < 2) return;
    const { size, worldExtent } = this;
    const half = worldExtent * 0.5;
    const cell = worldExtent / size;
    const halfW = width * 0.5 + margin;

    // Precompute segment tangents.
    const segs = [];
    for (let i = 0; i < points.length - 1; i++) {
      const [ax, az] = points[i];
      const [bx, bz] = points[i + 1];
      const dx = bx - ax;
      const dz = bz - az;
      const len = Math.hypot(dx, dz) || 1;
      segs.push({ ax, az, bx, bz, tx: dx / len, tz: dz / len, len });
    }

    for (let tz = 0; tz < size; tz++) {
      for (let tx = 0; tx < size; tx++) {
        const x = -half + (tx + 0.5) * cell;
        const z = -half + (tz + 0.5) * cell;
        let bestDist = Infinity;
        let bestTx = 1;
        let bestTz = 0;
        for (const s of segs) {
          // Project point onto segment.
          const apx = x - s.ax;
          const apz = z - s.az;
          const t = Math.max(0, Math.min(1, (apx * (s.bx - s.ax) + apz * (s.bz - s.az)) / (s.len * s.len)));
          const cx = s.ax + (s.bx - s.ax) * t;
          const cz = s.az + (s.bz - s.az) * t;
          const d = Math.hypot(x - cx, z - cz);
          if (d < bestDist) {
            bestDist = d;
            bestTx = s.tx;
            bestTz = s.tz;
          }
        }
        if (bestDist > halfW) {
          // Outside channel — keep neutral (no flow modulation).
          this.setTexel(tx, tz, 0, 0, 0, 0);
          continue;
        }
        const falloff = 1 - bestDist / halfW;
        this.setTexel(tx, tz, bestTx, bestTz, speedScale * falloff, 0);
      }
    }
  }

  /**
   * Bake wet-shore foam as a band around a circular water edge (lake disc).
   * Distance is radial: |hypot(x,z) − radius|. Peaks at the rim.
   *
   * Why not height-based? Lake terrain sits at basinFloor (~−6 m) under the
   * water disc and only climbs to y≈0 well outside the patch — so a
   * waterline-crossing test paints foam across the whole basin floor.
   * The water *mesh* edge is the real shoreline.
   */
  bakeShoreRing(radius, {
    bandWidth = 5,
    foamStrength = 0.9,
  } = {}) {
    if (!(radius > 0) || bandWidth <= 0) return;
    const { size, worldExtent } = this;
    const half = worldExtent * 0.5;
    const cell = worldExtent / size;

    for (let tz = 0; tz < size; tz++) {
      for (let tx = 0; tx < size; tx++) {
        const x = -half + (tx + 0.5) * cell;
        const z = -half + (tz + 0.5) * cell;
        const dist = Math.abs(Math.hypot(x, z) - radius);
        if (dist >= bandWidth) continue;
        this.addShore(tx, tz, foamStrength * (1 - dist / bandWidth));
      }
    }
  }

  /**
   * Bake wet-shore foam along a river channel edge. Distance is to the
   * centerline polyline; foam peaks where |d − width/2| is smallest.
   *
   * @param {number[][]} points — [[x,z], ...] centerline samples
   * @param {{ width?: number, bandWidth?: number, foamStrength?: number }} [opts]
   */
  bakeShoreChannel(points, {
    width = 14,
    bandWidth = 3.5,
    foamStrength = 0.7,
  } = {}) {
    if (!points || points.length < 2 || bandWidth <= 0) return;
    const { size, worldExtent } = this;
    const half = worldExtent * 0.5;
    const cell = worldExtent / size;
    const edge = width * 0.5;

    const segs = [];
    for (let i = 0; i < points.length - 1; i++) {
      const [ax, az] = points[i];
      const [bx, bz] = points[i + 1];
      const dx = bx - ax;
      const dz = bz - az;
      const len = Math.hypot(dx, dz) || 1;
      segs.push({ ax, az, bx, bz, len });
    }

    for (let tz = 0; tz < size; tz++) {
      for (let tx = 0; tx < size; tx++) {
        const x = -half + (tx + 0.5) * cell;
        const z = -half + (tz + 0.5) * cell;
        let bestDist = Infinity;
        for (const s of segs) {
          const apx = x - s.ax;
          const apz = z - s.az;
          const t = Math.max(0, Math.min(1, (apx * (s.bx - s.ax) + apz * (s.bz - s.az)) / (s.len * s.len)));
          const cx = s.ax + (s.bx - s.ax) * t;
          const cz = s.az + (s.bz - s.az) * t;
          const d = Math.hypot(x - cx, z - cz);
          if (d < bestDist) bestDist = d;
        }
        const dist = Math.abs(bestDist - edge);
        if (dist >= bandWidth) continue;
        this.addShore(tx, tz, foamStrength * (1 - dist / bandWidth));
      }
    }
  }

  /**
   * Bake wet-shore foam from a terrain height query — for future coastal
   * surf where the seafloor actually crosses the waterline. Lake/river use
   * bakeShoreRing / bakeShoreChannel instead (see those docs).
   *
   * @param {(x: number, z: number) => number} getHeight
   * @param {{ waterLevel?: number, bandWidth?: number, foamStrength?: number }} [opts]
   */
  bakeShoreFromHeight(getHeight, {
    waterLevel = 0,
    bandWidth = 5,
    foamStrength = 0.9,
  } = {}) {
    if (typeof getHeight !== 'function' || bandWidth <= 0) return;
    const { size, worldExtent } = this;
    const half = worldExtent * 0.5;
    const cell = worldExtent / size;

    for (let tz = 0; tz < size; tz++) {
      for (let tx = 0; tx < size; tx++) {
        const x = -half + (tx + 0.5) * cell;
        const z = -half + (tz + 0.5) * cell;
        const h = getHeight(x, z);
        const dist = Math.abs(h - waterLevel);
        if (dist >= bandWidth) continue;
        this.addShore(tx, tz, foamStrength * (1 - dist / bandWidth));
      }
    }
  }

  /** @deprecated Use bakeShoreRing / bakeShoreChannel / bakeShoreFromHeight. */
  bakeShore(getHeight, opts) {
    return this.bakeShoreFromHeight(getHeight, opts);
  }

  /**
   * Paint a soft brush stroke — the primitive a future shoreline editor (11d)
   * will call. Blends flow toward (dirX, dirZ, speed) and max-blends shore.
   */
  paint(x, z, dirX, dirZ, speed = 1, shore = 0, radius = 4) {
    const { size, data, worldExtent } = this;
    const half = worldExtent * 0.5;
    const scale = size / worldExtent;
    const cx = (x + half) * scale;
    const cz = (z + half) * scale;
    const r = Math.ceil(radius * scale);
    const r2 = r * r;
    const len = Math.hypot(dirX, dirZ) || 1;
    const nx = dirX / len;
    const nz = dirZ / len;

    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        const dist2 = dx * dx + dy * dy;
        if (dist2 > r2) continue;
        const px = Math.max(0, Math.min(size - 1, Math.floor(cx + dx)));
        const py = Math.max(0, Math.min(size - 1, Math.floor(cz + dy)));
        const falloff = 1 - Math.sqrt(dist2) / (r || 1);
        const i = (py * size + px) * 4;
        const k = falloff * 0.65;
        const curX = decSigned(data[i]);
        const curZ = decSigned(data[i + 1]);
        const curS = decUnit(data[i + 2]);
        data[i] = encSigned(curX + (nx - curX) * k);
        data[i + 1] = encSigned(curZ + (nz - curZ) * k);
        data[i + 2] = encUnit(curS + (speed - curS) * k);
        data[i + 3] = Math.max(data[i + 3], encUnit(shore * falloff));
        this.dirty = true;
      }
    }
  }

  /** CPU sample at world XZ — for buoyancy / Design API introspection. */
  sample(x, z) {
    const { tx, tz } = this._xzToTexel(x, z);
    const i = (tz * this.size + tx) * 4;
    const { data } = this;
    return {
      dirX: decSigned(data[i]),
      dirZ: decSigned(data[i + 1]),
      speed: decUnit(data[i + 2]),
      shore: decUnit(data[i + 3]),
    };
  }

  /** Coverage stats after a bake — useful for headless design() reporting. */
  stats() {
    const { data, size } = this;
    let shoreCells = 0;
    let flowCells = 0;
    let shoreSum = 0;
    for (let i = 0; i < data.length; i += 4) {
      const shore = data[i + 3];
      const speed = data[i + 2];
      if (shore > 8) {
        shoreCells++;
        shoreSum += shore / 255;
      }
      if (speed > 8) flowCells++;
    }
    const total = size * size;
    return {
      size,
      worldExtent: this.worldExtent,
      shoreCoverage: +(shoreCells / total).toFixed(4),
      flowCoverage: +(flowCells / total).toFixed(4),
      meanShore: shoreCells ? +(shoreSum / shoreCells).toFixed(3) : 0,
    };
  }

  upload() {
    if (!this.dirty) return;
    this.texture.needsUpdate = true;
    this.dirty = false;
  }

  dispose() {
    this.texture.dispose();
  }
}

/**
 * Run the standard bake pipeline for a preset. Pure CPU — safe in Node.
 * Returns a FlowMap, or null when the preset has no flowmap config.
 *
 * Shore foam is baked from the *water mesh edge* (lake disc radius / river
 * channel width), not from terrain height — lake basins sit well below y=0
 * under the disc, so a waterline-crossing test would flood the whole floor.
 *
 * @param {object} preset
 * @returns {FlowMap | null}
 */
export function bakeFlowMapForPreset(preset) {
  const cfg = normalizeFlowMapConfig(preset.flowmap, preset);
  if (!cfg) return null;

  const map = new FlowMap(cfg.size, cfg.worldExtent);
  const waterType = preset.waterType ?? 'ocean';

  if (waterType === 'river' && preset.river?.points?.length >= 2) {
    map.bakeRiverFlow(preset.river.points, {
      width: preset.river.width ?? 14,
      speedScale: cfg.flowStrength,
    });
  } else if (preset.flow) {
    const [fx, fz] = preset.flow.dir;
    map.bakeUniformFlow(fx, fz, cfg.flowStrength);
  }

  if (cfg.shore?.enabled) {
    if (waterType === 'lake') {
      const radius = (preset.patch?.width ?? 80) * 0.5;
      map.bakeShoreRing(radius, cfg.shore);
    } else if (waterType === 'river' && preset.river?.points?.length >= 2) {
      map.bakeShoreChannel(preset.river.points, {
        width: preset.river.width ?? 14,
        bandWidth: cfg.shore.bandWidth,
        foamStrength: cfg.shore.foamStrength,
      });
    }
  }

  map.upload();
  return map;
}
