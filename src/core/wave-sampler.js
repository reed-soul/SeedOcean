// Shared CPU sampling of FFT spatial buffers — buoyancy, export, diagnostics.

function wrapUV(x, scale) {
  const u = x / scale;
  return u - Math.floor(u);
}

function samplePixel(buf, N, u, v) {
  const px = Math.min(N - 1, Math.max(0, Math.floor(u * N)));
  const py = Math.min(N - 1, Math.max(0, Math.floor(v * N)));
  return (py * N + px) * 2;
}

/**
 * @param {import('./fft/ocean-simulator.js').OceanSimulator} simulator
 * @param {{ dxdz: Float32Array, dydxz: Float32Array, lengthScale: number }[]} cascadeBuffers
 */
export function sampleFFTDisplacement(x, z, simulator, cascadeBuffers) {
  let dx = 0;
  let dy = 0;
  let dz = 0;
  const lambda = simulator.lambda.value;
  const N = simulator.N;

  cascadeBuffers.forEach(({ dxdz, dydxz, lengthScale: L }) => {
    const u = wrapUV(x, L);
    const v = wrapUV(z, L);
    const idx = samplePixel(null, N, u, v);
    dx += dxdz[idx] * lambda;
    dy += dydxz[idx];
    dz += dxdz[idx + 1] * lambda;
  });

  return { x: dx, y: dy, z: dz };
}

export function sampleOceanHeight(x, z, simulator, cascadeBuffers) {
  return sampleFFTDisplacement(x, z, simulator, cascadeBuffers).y;
}

/** Fast height from a single coarse cascade buffer (runtime buoyancy). */
export function sampleHeightFromBuffer(x, z, buffer) {
  const { dydxz, lengthScale: L, N } = buffer;
  const u = wrapUV(x, L);
  const v = wrapUV(z, L);
  return dydxz[samplePixel(null, N, u, v)];
}

/** Horizontal displacement gradient for slope-aware physics. */
export function sampleSlopeFromBuffer(x, z, buffer) {
  const { dxdz, lengthScale: L, N, lambda } = buffer;
  const u = wrapUV(x, L);
  const v = wrapUV(z, L);
  const idx = samplePixel(null, N, u, v);
  return {
    dx: dxdz[idx] * lambda,
    dz: dxdz[idx + 1] * lambda,
  };
}

/** Read only cascade 0 — ~3× less GPU readback than all cascades. */
export async function readBuoyancyBuffer(renderer, simulator, cascadeIndex = 0, reuse = null) {
  const c = simulator.cascades[cascadeIndex];
  const dxdzRaw = await renderer.getArrayBufferAsync(c.DxDz.value);
  const dydxzRaw = await renderer.getArrayBufferAsync(c.DyDxz.value);
  const len = dxdzRaw.byteLength / 4;
  const pool = reuse ?? {};
  if (!pool.dxdz || pool.dxdz.length !== len) pool.dxdz = new Float32Array(len);
  if (!pool.dydxz || pool.dydxz.length !== len) pool.dydxz = new Float32Array(len);
  pool.dxdz.set(new Float32Array(dxdzRaw));
  pool.dydxz.set(new Float32Array(dydxzRaw));
  return {
    dxdz: pool.dxdz,
    dydxz: pool.dydxz,
    lengthScale: c.lengthScale,
    N: simulator.N,
    lambda: simulator.lambda.value,
  };
}

/** Full multi-cascade readback — export and baking only. */
export async function readCascadeBuffers(renderer, simulator) {
  const buffers = [];
  for (const c of simulator.cascades) {
    const dxdz = new Float32Array(await renderer.getArrayBufferAsync(c.DxDz.value));
    const dydxz = new Float32Array(await renderer.getArrayBufferAsync(c.DyDxz.value));
    buffers.push({ dxdz, dydxz, lengthScale: c.lengthScale });
  }
  return buffers;
}
