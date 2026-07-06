// Gaussian white noise — seeds the initial spectrum h0(k).
// Box-Muller transform; deterministic when given a seed.

import { Rng } from '../rng.js';

export function gaussianNoise(N, seed = 1) {
  const rng = new Rng(seed);
  const data = new Float32Array(N * N * 2);
  for (let i = 0; i < N * N; i++) {
    const u1 = Math.max(rng.float(), 1e-7);
    const u2 = rng.float();
    const r = Math.sqrt(-2.0 * Math.log(u1));
    data[i * 2] = r * Math.cos(2.0 * Math.PI * u2);
    data[i * 2 + 1] = r * Math.sin(2.0 * Math.PI * u2);
  }
  return data;
}
