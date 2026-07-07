// Finite rectangular water patch — the bounded-water counterpart to the
// infinite clipmap. Used for pool/lake/river surfaces that don't follow the
// camera. Returns the same { root, mesh, snap, extent, update } shape as
// buildClipmapMesh so fft-ocean.js / seedocean.js can swap them transparently.

import { BufferGeometry, Float32BufferAttribute, Group, Mesh } from 'three/webgpu';

/**
 * @param {import('three/webgpu').Material} material
 * @param {object} [opts]
 * @param {number} [opts.width=40]   — world meters across X
 * @param {number} [opts.length=40]  — world meters across Z
 * @param {number} [opts.cells=64]   — grid subdivisions per side (for displacement detail)
 */
export function buildPatchMesh(material, {
  width = 40,
  length = 40,
  cells = 64,
} = {}) {
  // Vertices are local (centered at origin). The mesh root stays at a fixed
  // world position (set by the caller), so positionLocal.xz + clipOrigin(0,0)
  // gives the world XZ the surface shader samples — identical convention to
  // the clipmap, just without the camera-snapping.
  const positions = [];
  const indices = [];
  const nx = cells;
  const nz = cells;
  for (let j = 0; j <= nz; j++) {
    for (let i = 0; i <= nx; i++) {
      const x = (i / nx - 0.5) * width;
      const z = (j / nz - 0.5) * length;
      positions.push(x, 0, z);
    }
  }
  const stride = nx + 1;
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) {
      const a = j * stride + i;
      const b = a + 1;
      const c = a + stride;
      const d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();

  const root = new Group();
  const mesh = new Mesh(geometry, material);
  mesh.name = 'SeedOcean_Patch';
  mesh.frustumCulled = false;
  root.add(mesh);

  return {
    root,
    mesh,
    snap: 1,          // unused for bounded water; kept for interface parity
    extent: Math.max(width, length),
    update() { /* bounded water doesn't follow the camera */ },
  };
}
