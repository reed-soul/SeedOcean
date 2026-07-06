// Export FFT ocean surface — readbacks spatial IFFT buffers and bakes a .glb.

import { Group, Mesh, MeshStandardMaterial, Vector3 } from 'three/webgpu';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { readCascadeBuffers, sampleFFTDisplacement } from './wave-sampler.js';

export function bakeFFTGeometry(oceanMesh, simulator, cascadeBuffers, oceanRoot = null) {
  const src = oceanMesh.geometry;
  const baked = src.clone();
  const pos = baked.attributes.position;
  const tmp = new Vector3();
  if (oceanRoot) oceanRoot.updateWorldMatrix(true, false);

  for (let i = 0; i < pos.count; i++) {
    tmp.fromBufferAttribute(pos, i);
    if (oceanRoot) tmp.applyMatrix4(oceanRoot.matrixWorld);
    const disp = sampleFFTDisplacement(tmp.x, tmp.z, simulator, cascadeBuffers);
    pos.setXYZ(i, tmp.x + disp.x, tmp.y + disp.y, tmp.z + disp.z);
  }

  baked.computeVertexNormals();
  return baked;
}

export async function exportFFTOceanGLB(renderer, oceanRoot, oceanMesh, simulator, filename = 'seedocean.glb') {
  const cascadeBuffers = await readCascadeBuffers(renderer, simulator);
  const geometry = bakeFFTGeometry(oceanMesh, simulator, cascadeBuffers, oceanRoot);
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
