// CPU-baked detail noise for sub-grid surface breakup (ported from poseidon).
import {
  DataTexture, RGBAFormat, UnsignedByteType, RepeatWrapping, LinearFilter, LinearMipmapLinearFilter,
} from 'three/webgpu';

export function makeDetailTexture(size = 256, octaves = 3) {
  const rand = new Float32Array(size * size);
  let seed = 1234567;
  const rng = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
  for (let i = 0; i < size * size; i++) rand[i] = rng();

  const smooth = (t) => t * t * (3 - 2 * t);
  const octave = (u, v, f) => {
    const x = u * f;
    const y = v * f;
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const uu = smooth(x - xi);
    const vv = smooth(y - yi);
    const A = (X, Y) => rand[((((Y % f) + f) % f) * size) + (((X % f) + f) % f)];
    const a = A(xi, yi);
    const b = A(xi + 1, yi);
    const c = A(xi, yi + 1);
    const d = A(xi + 1, yi + 1);
    return a * (1 - uu) * (1 - vv) + b * uu * (1 - vv) + c * (1 - uu) * vv + d * uu * vv;
  };
  const fbm = (u, v) => {
    let s = 0;
    let amp = 0.5;
    let f = 4;
    for (let o = 0; o < octaves; o++) {
      s += octave(u, v, f) * amp;
      amp *= 0.5;
      f *= 2;
    }
    return s;
  };

  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const v = y / size;
      const e = 1 / size;
      const n = fbm(u, v);
      const nx = fbm(u + e, v) - fbm(u - e, v);
      const ny = fbm(u, v + e) - fbm(u, v - e);
      const i = (y * size + x) * 4;
      data[i] = Math.round((nx * 0.5 + 0.5) * 255);
      data[i + 1] = Math.round((ny * 0.5 + 0.5) * 255);
      data[i + 2] = Math.round(n * 255);
      data[i + 3] = Math.round(fbm(u * 2.3 + 0.17, v * 2.3 + 0.31) * 255);
    }
  }

  const tex = new DataTexture(data, size, size, RGBAFormat, UnsignedByteType);
  tex.wrapS = tex.wrapT = RepeatWrapping;
  tex.minFilter = LinearMipmapLinearFilter;
  tex.magFilter = LinearFilter;
  tex.generateMipmaps = true;
  tex.needsUpdate = true;
  return tex;
}
