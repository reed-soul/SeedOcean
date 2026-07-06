// Shared CPU sampling of FFT spatial buffers — buoyancy, export, diagnostics.

function wrapUV(x, scale) {
  const u = x / scale;
  return u - Math.floor(u);
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
    const px = Math.min(N - 1, Math.max(0, Math.floor(u * N)));
    const py = Math.min(N - 1, Math.max(0, Math.floor(v * N)));
    const idx = (py * N + px) * 2;
    dx += dxdz[idx] * lambda;
    dy += dydxz[idx];
    dz += dxdz[idx + 1] * lambda;
  });

  return { x: dx, y: dy, z: dz };
}

export function sampleOceanHeight(x, z, simulator, cascadeBuffers) {
  return sampleFFTDisplacement(x, z, simulator, cascadeBuffers).y;
}

export async function readCascadeBuffers(renderer, simulator) {
  const buffers = [];
  for (const c of simulator.cascades) {
    const dxdz = new Float32Array(await renderer.getArrayBufferAsync(c.DxDz.value));
    const dydxz = new Float32Array(await renderer.getArrayBufferAsync(c.DyDxz.value));
    buffers.push({ dxdz, dydxz, lengthScale: c.lengthScale });
  }
  return buffers;
}
