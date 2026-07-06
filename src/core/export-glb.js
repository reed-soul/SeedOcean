// Export FFT ocean surface — readbacks spatial IFFT buffers and bakes a .glb.

import { Group, Mesh, MeshStandardMaterial, Vector3 } from 'three/webgpu';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';

function wrapUV(x, scale) {
  const u = x / scale;
  return u - Math.floor(u);
}

/**
 * @param {import('./fft/ocean-simulator.js').OceanSimulator} simulator
 * @param {Float32Array[]} cascadeBuffers — per-cascade { dxdz, dydxz, lengthScale }
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

export async function readCascadeBuffers(renderer, simulator) {
  const buffers = [];
  for (const c of simulator.cascades) {
    const dxdz = new Float32Array(await renderer.getArrayBufferAsync(c.DxDz.value));
    const dydxz = new Float32Array(await renderer.getArrayBufferAsync(c.DyDxz.value));
    buffers.push({ dxdz, dydxz, lengthScale: c.lengthScale });
  }
  return buffers;
}

export function bakeFFTGeometry(oceanMesh, simulator, cascadeBuffers) {
  const src = oceanMesh.geometry;
  const baked = src.clone();
  const pos = baked.attributes.position;
  const tmp = new Vector3();

  for (let i = 0; i < pos.count; i++) {
    tmp.fromBufferAttribute(pos, i);
    const disp = sampleFFTDisplacement(tmp.x, tmp.z, simulator, cascadeBuffers);
    pos.setXYZ(i, tmp.x + disp.x, tmp.y + disp.y, tmp.z + disp.z);
  }

  baked.computeVertexNormals();
  return baked;
}

export async function exportFFTOceanGLB(renderer, oceanMesh, simulator, filename = 'seedocean.glb') {
  const cascadeBuffers = await readCascadeBuffers(renderer, simulator);
  const geometry = bakeFFTGeometry(oceanMesh, simulator, cascadeBuffers);
  const exportMat = new MeshStandardMaterial({ color: 0x0a5f7a, roughness: 0.1, metalness: 0.1 });
  const exportMesh = new Mesh(geometry, exportMat);
  exportMesh.name = 'SeedOcean_Baked';

  const root = new Group();
  root.name = 'SeedOcean';
  root.add(exportMesh);

  const exporter = new GLTFExporter();
  const buffer = await exporter.parseAsync(root, { binary: true });
  const blob = new Blob([buffer], { type: 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
