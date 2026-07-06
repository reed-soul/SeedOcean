// Bake the live Gerstner surface to a static .glb at the current time.

import { Group, Mesh, MeshStandardMaterial, Vector3 } from 'three/webgpu';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { sampleGerstner } from './gerstner.js';

/**
 * @param {import('three').Mesh} oceanMesh
 * @param {ReturnType<import('./gerstner.js').wavesFromPreset>} waves
 * @param {number} t — seconds, usually performance.now() * 0.001
 * @param {number} globalSpeed
 */
export function bakeOceanGeometry(oceanMesh, waves, t, globalSpeed = 1) {
  const src = oceanMesh.geometry;
  const baked = src.clone();
  const pos = baked.attributes.position;
  const tmp = new Vector3();

  for (let i = 0; i < pos.count; i++) {
    tmp.fromBufferAttribute(pos, i);
    const disp = sampleGerstner(tmp.x, tmp.z, t, waves, globalSpeed);
    pos.setXYZ(i, tmp.x + disp.x, tmp.y + disp.y, tmp.z + disp.z);
  }

  baked.computeVertexNormals();
  return baked;
}

export async function exportOceanGLB(oceanMesh, waves, t, globalSpeed = 1, filename = 'seedocean.glb') {
  const geometry = bakeOceanGeometry(oceanMesh, waves, t, globalSpeed);
  const exportMat = new MeshStandardMaterial({
    color: 0x0a5f7a,
    roughness: 0.1,
    metalness: 0.1,
  });
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
