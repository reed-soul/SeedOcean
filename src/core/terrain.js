// Procedural terrain — displaced PlaneGeometry used as the lake basin / river
// banks for bounded water. Same caustic shading as seafloor.js (the material is
// water-type-agnostic — it just reads positionWorld.xz), but with real relief so
// the water surface can intersect a shoreline instead of a flat plane.
//
// heightFn is sampled identically on the GPU (per-vertex displacement) and on
// the CPU (getHeight), so surface-waterline queries stay in sync with the mesh
// without a GPU readback.

import * as THREE from 'three/webgpu';
import { Fn, positionWorld, mix, uniform, time, float } from 'three/tsl';
import { causticsPattern, causticsSunLit } from './caustics.js';
import { Rng } from './rng.js';

/**
 * Value-noise gradient field seeded for determinism. Reused by the fBm sum so
 * every octave pulls from a stable lattice — getHeight(x,z) on the CPU matches
 * the GPU displacement bit-for-bit (modulo float precision).
 *
 * @param {number} seed
 * @param {number} size lattice is sampled in cellsPerUnit units; one grid per world unit region
 */
function makeValueNoise(seed, latticeSize = 256) {
  const rng = new Rng(seed);
  const n = latticeSize;
  const grid = new Float32Array(n * n);
  for (let i = 0; i < n * n; i++) grid[i] = rng.float();
  const at = (ix, iz) => grid[((iz % n + n) % n) * n + ((ix % n + n) % n)];
  const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
  const lerp = (a, b, t) => a + (b - a) * t;
  /** @param {number} x @param {number} z */
  return function sample(x, z) {
    const fx = x - Math.floor(x);
    const fz = z - Math.floor(z);
    const ix = Math.floor(x);
    const iz = Math.floor(z);
    const u = fade(fx);
    const v = fade(fz);
    const x0 = lerp(at(ix, iz), at(ix + 1, iz), u);
    const x1 = lerp(at(ix, iz + 1), at(ix + 1, iz + 1), u);
    return lerp(x0, x1, v) * 2 - 1; // remap [0,1] → [-1,1]
  };
}

/**
 * Build a fractal-Brownian-motion height function centered on the origin.
 * Returns a closure (x, z) => height in world meters.
 *
 * @param {object} opts
 * @param {number} [opts.seed=1]
 * @param {number} [opts.amplitude=8]      peak-to-trough half-range, meters
 * @param {number} [opts.frequency=0.04]   base spatial frequency (cycles / meter)
 * @param {number} [opts.octaves=4]
 * @param {number} [opts.persistence=0.5]  per-octave amplitude falloff
 * @param {number} [opts.lacunarity=2.0]   per-octave frequency growth
 */
export function makeFbmHeight({
  seed = 1,
  amplitude = 8,
  frequency = 0.04,
  octaves = 4,
  persistence = 0.5,
  lacunarity = 2.0,
} = {}) {
  const noise = makeValueNoise(seed);
  /** @param {number} x @param {number} z */
  return function heightAt(x, z) {
    let amp = 1;
    let freq = frequency;
    let sum = 0;
    let norm = 0;
    for (let o = 0; o < octaves; o++) {
      sum += noise(x * freq, z * freq) * amp;
      norm += amp;
      amp *= persistence;
      freq *= lacunarity;
    }
    return (sum / norm) * amplitude;
  };
}

/**
 * Wrap a height function into a basin profile: inside `basinRadius` the floor
 * is roughly `basinFloor` (with low-amplitude relief so the lake bed isn't a
 * perfect disc), and outside it rises smoothly to `rimHeight` over `rimFalloff`
 * meters. This is what gives the lake its shoreline — the water patch (radius
 * ≈ basinRadius) meets terrain that climbs out of the basin.
 */
export function makeBasinFn(inner, {
  size,
  basinRadius = 30,
  basinFloor = -6,
  rimHeight = 8,
  rimFalloff = 1.5,
} = {}) {
  const half = size / 2;
  /** @param {number} x @param {number} z */
  return function basinAt(x, z) {
    const r = Math.sqrt(x * x + z * z);
    // Soft bowl: 0 inside basinRadius, ramps to 1 at the rim.
    // We use a smoothstep from basinRadius to basinRadius + rimFalloff... but
    // for a lake we actually want the rim to keep climbing beyond the patch
    // so the surrounding hills read as a valley. So we extend the ramp to the
    // terrain edge.
    const edge = Math.max(basinRadius + rimFalloff, half * 0.6);
    const t = THREE.MathUtils.smoothstep(r, basinRadius, edge);
    // fBm contributes natural relief; we dampen it inside the basin so the
    // underwater floor stays near basinFloor (visible through clear lake water).
    const relief = inner(x, z);
    const floor = basinFloor + relief * 0.15;
    const rim = rimHeight + relief * 0.6;
    return floor * (1 - t) + rim * t;
  };
}

/**
 * River channel height: a bed (bedDepth) within `width/2` of the centerline,
 * banks rising to bankHeight over bankFalloff meters on each side, with fBm
 * relief so the banks read as natural terrain. Used for the `river` waterType
 * so the ribbon mesh sits in a real valley instead of a circular basin (which
 * only matched the river near its midpoint).
 *
 * The centerline is sampled from a Catmull-Rom curve built from `points`
 * (same waypoints the river ribbon mesh uses). Distance-to-centerline is
 * computed by sampling the curve at fixed steps — coarse but adequate for
 * displacement; the mesh resolution carries visual detail.
 */
export function makeRiverChannelHeight(points, {
  width = 14,
  bankHeight = 14,
  bankFalloff = 40,
  bedDepth = -4,
  seed = 1,
  amplitude = 9,
  frequency = 0.03,
  octaves = 4,
} = {}) {
  const curvePts = points.map(([x, z]) => new THREE.Vector3(x, 0, z));
  const curve = new THREE.CatmullRomCurve3(curvePts, false, 'catmullrom', 0.5);
  // Pre-sample the centerline for fast nearest-point distance queries.
  const N = 400;
  /** @type {number[][]} [x,z] */
  const samples = [];
  const tmp = new THREE.Vector3();
  for (let i = 0; i <= N; i++) {
    curve.getPoint(i / N, tmp);
    samples.push([tmp.x, tmp.z]);
  }
  const halfW = width / 2;
  const relief = makeFbmHeight({ seed, amplitude, frequency, octaves });

  /** @param {number} x @param {number} z */
  return function channelAt(x, z) {
    // nearest point on the sampled centerline (linear scan; N=400 is fine on CPU)
    let best = Infinity;
    for (let i = 0; i < samples.length; i++) {
      const dx = samples[i][0] - x;
      const dz = samples[i][1] - z;
      const d = dx * dx + dz * dz;
      if (d < best) best = d;
    }
    const d = Math.sqrt(best);
    const r = relief(x, z);
    if (d < halfW) {
      // river bed: near bedDepth, gentle relief so the underwater floor is calm
      return bedDepth + r * 0.12;
    }
    // banks: smoothstep from waterline (d=halfW) up to bankHeight (d=halfW+falloff)
    const t = THREE.MathUtils.smoothstep(d, halfW, halfW + bankFalloff);
    return bedDepth * (1 - t) + (bankHeight + r * 0.7) * t;
  };
}

/**
 * @param {object} opts
 * @param {number} [opts.size=400]                 square world extent, meters
 * @param {number} [opts.resolution=128]           subdivisions per side
 * @param {(x:number,z:number)=>number} [opts.heightFn]  CPU/GPU height sampler; defaults to fBm
 * @param {object} [opts.preset]                   for caustic/seafloor colors (mirrors buildSeafloor)
 * @param {import('three/tsl').UniformNode<THREE.Vector3>} [opts.sunDir]
 * @param {number} [opts.seed]
 */
export function buildTerrain({
  size = 400,
  resolution = 128,
  heightFn,
  preset = {},
  sunDir,
  seed,
} = {}) {
  const terrainCfg = preset.terrain ?? {};
  // Default to fBm; heightFn is shared between mesh displacement and getHeight,
  // so callers can also pass a custom sampler (e.g. a basin-shaped function).
  // When terrain.basin is set we wrap the fBm in a bowl profile so the patch
  // sits in a lake basin: flat-ish at the center, rising toward the rim.
  // When terrain.channel is set we wrap it in a river-channel profile instead
  // (bed along a Catmull-Rom centerline, banks rising on each side).
  const baseFn = heightFn ?? makeFbmHeight({
    seed: seed ?? preset.seed ?? 1,
    amplitude: terrainCfg.amplitude ?? 8,
    frequency: terrainCfg.frequency ?? 0.04,
    octaves: terrainCfg.octaves ?? 4,
  });
  let hFn;
  if (terrainCfg.channel) {
    const river = preset.river ?? {};
    const points = terrainCfg.points ?? river.points ?? [[-80, 0], [0, 0], [80, 0]];
    hFn = makeRiverChannelHeight(points, {
      width: terrainCfg.width ?? river.width ?? 14,
      bankHeight: terrainCfg.bankHeight ?? terrainCfg.rimHeight ?? 16,
      bankFalloff: terrainCfg.bankFalloff ?? 50,
      bedDepth: terrainCfg.basinFloor ?? preset.seafloorDepth ?? -4,
      seed: seed ?? preset.seed ?? 1,
      amplitude: terrainCfg.amplitude ?? 9,
      frequency: terrainCfg.frequency ?? 0.03,
      octaves: terrainCfg.octaves ?? 4,
    });
  } else if (terrainCfg.basin) {
    hFn = makeBasinFn(baseFn, {
      size,
      basinRadius: terrainCfg.basinRadius ?? Math.min(preset.patch?.width ?? 60, preset.patch?.length ?? 60) / 2,
      basinFloor: terrainCfg.basinFloor ?? (preset.seafloorDepth ?? -6),
      rimHeight: terrainCfg.rimHeight ?? (terrainCfg.amplitude ?? 8),
      rimFalloff: terrainCfg.rimFalloff ?? 1.5,
    });
  } else {
    hFn = baseFn;
  }

  // ---- Mesh: PlaneGeometry rotated to XZ, vertices displaced by hFn ----
  const geometry = new THREE.PlaneGeometry(size, size, resolution, resolution);
  geometry.rotateX(-Math.PI / 2);
  const pos = geometry.attributes.position;
  const half = size / 2;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    pos.setY(i, hFn(x, z));
  }
  pos.needsUpdate = true;
  geometry.computeVertexNormals();

  // ---- Material: reuses seafloor's caustic shading (water-type-agnostic) ----
  const seafloorColor = uniform(new THREE.Color(preset.seafloorColor ?? 0x4a3a28));
  const causticColor = uniform(new THREE.Color(preset.causticColor ?? 0x3a8a9a));
  const causticStrength = uniform(preset.causticStrength ?? 0.55);
  const underwaterMix = uniform(0);

  const material = new THREE.MeshStandardNodeMaterial({ roughness: 0.95, metalness: 0 });
  material.colorNode = Fn(() => {
    const caustics = causticsPattern(positionWorld.xz, time);
    const sunLit = sunDir ? causticsSunLit(sunDir) : float(1);
    const lit = caustics.mul(causticStrength).mul(sunLit).mul(underwaterMix);
    return mix(seafloorColor, causticColor, lit);
  })();

  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'SeedOcean_Terrain';
  mesh.frustumCulled = false;

  // Clamped CPU query — bounded water callers (lake shoreline, river bank) ask
  // for terrain height inside the [−half, half] square. Outside the patch the
  // sampler is still valid (fBm is infinite), but we clamp so lake/river don't
  // accidentally read nonsense at the demo's edges.
  function getHeight(x, z) {
    const cx = THREE.MathUtils.clamp(x, -half, half);
    const cz = THREE.MathUtils.clamp(z, -half, half);
    return hFn(cx, cz);
  }

  return {
    mesh,
    uniforms: { underwaterMix, causticStrength },
    getHeight,
    /** @param {number} mix */
    updateUnderwater(mix) { underwaterMix.value = mix; },
  };
}
