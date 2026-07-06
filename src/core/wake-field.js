// CPU wake texture — boat / object interaction stamps height + foam into a tiling field.

import { DataTexture, RGBAFormat, UnsignedByteType, LinearFilter, RepeatWrapping } from 'three/webgpu';

const MAX_WAKE = 255;

export class WakeField {
  /**
   * @param {number} [size] — texture resolution
   * @param {number} [worldExtent] — world meters per tile repeat
   */
  constructor(size = 512, worldExtent = 220) {
    this.size = size;
    this.worldExtent = worldExtent;
    this.data = new Uint8Array(size * size * 4);
    this.texture = new DataTexture(this.data, size, size, RGBAFormat, UnsignedByteType);
    this.texture.minFilter = LinearFilter;
    this.texture.magFilter = LinearFilter;
    this.texture.wrapS = RepeatWrapping;
    this.texture.wrapT = RepeatWrapping;
    this.texture.needsUpdate = true;
  }

  /** Stamp a wake kernel at world XZ from object velocity. */
  stamp(x, z, vx, vz, radius = 4, strength = 1) {
    const { size, data, worldExtent } = this;
    const scale = size / worldExtent;
    const cx = (((x / worldExtent) % 1) + 1) % 1 * size;
    const cz = (((z / worldExtent) % 1) + 1) % 1 * size;
    const r = Math.ceil(radius * scale);
    const r2 = r * r;
    const speed = Math.sqrt(vx * vx + vz * vz);
    if (speed < 0.05) return;

    const impulse = strength * Math.min(speed * 0.12, 1.8);

    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        const dist2 = dx * dx + dy * dy;
        if (dist2 > r2) continue;
        const px = (Math.floor(cx + dx) % size + size) % size;
        const py = (Math.floor(cz + dy) % size + size) % size;
        const i = (py * size + px) * 4;
        const falloff = 1 - Math.sqrt(dist2) / r;
        const h = impulse * falloff * 90;
        const f = impulse * falloff * 110;
        data[i] = Math.min(MAX_WAKE, data[i] + h);
        data[i + 1] = Math.min(MAX_WAKE, data[i + 1] + f);
      }
    }
  }

  decay(dt) {
    const d = this.data;
    const hDecay = Math.pow(0.25, dt);
    const fDecay = Math.pow(0.45, dt);
    for (let i = 0; i < d.length; i += 4) {
      d[i] = Math.floor(d[i] * hDecay);
      d[i + 1] = Math.floor(d[i + 1] * fDecay);
    }
  }

  upload() {
    this.texture.needsUpdate = true;
  }
}
