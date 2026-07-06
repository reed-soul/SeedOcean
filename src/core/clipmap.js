// Nested-ring clipmap — camera-snapped infinite ocean surface.
// Level 0 is a dense center patch; each outer level doubles extent with coarser cells.

import { BufferGeometry, Float32BufferAttribute, Group, Mesh } from 'three/webgpu';

/**
 * @param {object} [opts]
 * @param {number} [opts.patchHalf] — half-size of the innermost patch (m)
 * @param {number} [opts.levels] — nested ring count (incl. center)
 * @param {number} [opts.cells] — grid cells per side at finest level
 */
export function buildClipmapGeometry({
  patchHalf = 48,
  levels = 4,
  cells = 32,
} = {}) {
  const positions = [];
  const indices = [];

  function gridRect(x0, z0, x1, z1, nx, nz) {
    const nxClamped = Math.max(1, nx);
    const nzClamped = Math.max(1, nz);
    const base = positions.length / 3;

    for (let j = 0; j <= nzClamped; j++) {
      for (let i = 0; i <= nxClamped; i++) {
        const x = x0 + ((x1 - x0) * i) / nxClamped;
        const z = z0 + ((z1 - z0) * j) / nzClamped;
        positions.push(x, 0, z);
      }
    }

    const stride = nxClamped + 1;
    for (let j = 0; j < nzClamped; j++) {
      for (let i = 0; i < nxClamped; i++) {
        const a = base + j * stride + i;
        const b = a + 1;
        const c = a + stride;
        const d = c + 1;
        indices.push(a, c, b, b, c, d);
      }
    }
  }

  gridRect(-patchHalf, -patchHalf, patchHalf, patchHalf, cells, cells);

  let inner = patchHalf;
  for (let level = 1; level < levels; level++) {
    const outer = inner * 2;
    const ringCells = Math.max(4, cells >> level);
    const halfRing = Math.max(2, ringCells >> 1);

    gridRect(-outer, inner, outer, outer, ringCells, halfRing);
    gridRect(-outer, -outer, outer, -inner, ringCells, halfRing);
    gridRect(-outer, -inner, -inner, inner, halfRing, ringCells);
    gridRect(inner, -inner, outer, inner, halfRing, ringCells);

    inner = outer;
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();

  const snap = (patchHalf * 2) / cells;
  return { geometry, snap, extent: inner * 2 };
}

/** Snap clipmap origin to the finest-cell grid so tiling stays seamless. */
export function updateClipmapOrigin(root, camera, snap) {
  root.position.x = Math.floor(camera.position.x / snap) * snap;
  root.position.z = Math.floor(camera.position.z / snap) * snap;
}

export function buildClipmapMesh(material, options) {
  const { geometry, snap, extent } = buildClipmapGeometry(options);
  const root = new Group();
  const mesh = new Mesh(geometry, material);
  mesh.name = 'SeedOcean_Clipmap';
  mesh.frustumCulled = false;
  root.add(mesh);

  return {
    root,
    mesh,
    snap,
    extent,
    update(camera) {
      updateClipmapOrigin(root, camera, snap);
    },
  };
}
