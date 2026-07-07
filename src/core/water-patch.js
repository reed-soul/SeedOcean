// Finite bounded water patch — the counterpart to the infinite clipmap. Used
// for pool/lake/river surfaces that don't follow the camera. Returns the same
// { root, mesh, snap, extent, update } shape as buildClipmapMesh so fft-ocean.js
// / seedocean.js can swap them transparently.
//
// `shape: 'rect'` builds a regular grid; `shape: 'circle'` builds an
// origin-centered disc so the lake can meet an irregular shoreline instead of
// looking like a swimming pool.

import { BufferGeometry, Float32BufferAttribute, Group, Mesh } from 'three/webgpu';

/**
 * @param {import('three/webgpu').Material} material
 * @param {object} [opts]
 * @param {number} [opts.width=40]    — world meters across X (rect) / disc diameter (circle)
 * @param {number} [opts.length=40]   — world meters across Z (rect only)
 * @param {number} [opts.cells=64]    — grid subdivisions per side (rect) or rings (circle)
 * @param {'rect'|'circle'} [opts.shape='rect']
 * @param {number} [opts.segments=96] — angular segments for circle shape
 */
export function buildPatchMesh(material, {
  width = 40,
  length = 40,
  cells = 64,
  shape = 'rect',
  segments = 96,
} = {}) {
  let geometry;
  if (shape === 'circle') {
    geometry = buildCircleGeometry(width, cells, segments);
  } else {
    geometry = buildRectGeometry(width, length, cells);
  }

  const root = new Group();
  const mesh = new Mesh(geometry, material);
  mesh.name = 'SeedOcean_Patch';
  mesh.frustumCulled = false;
  root.add(mesh);

  return {
    root,
    mesh,
    snap: 1,          // unused for bounded water; kept for interface parity
    extent: shape === 'circle' ? width : Math.max(width, length),
    update() { /* bounded water doesn't follow the camera */ },
  };
}

function buildRectGeometry(width, length, cells) {
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
  return geometry;
}

// Concentric-ring disc with a center fan + radial quads. The vertex density
// grows with radius so the rim has the same sub-meter resolution as a rect
// patch of the same diameter — the surface shader needs that to resolve FFT
// displacement cleanly near the shoreline.
function buildCircleGeometry(diameter, rings, segments) {
  const positions = [0, 0, 0]; // center vertex (index 0)
  const indices = [];
  const radius = diameter / 2;
  const seg = Math.max(8, segments | 0);
  const ringCount = Math.max(2, rings | 0);
  let firstPrev = 1; // first vertex of previous ring
  // ring 0: center fan
  for (let s = 0; s < seg; s++) {
    const a0 = (s / seg) * Math.PI * 2;
    const a1 = ((s + 1) / seg) * Math.PI * 2;
    positions.push(Math.cos(a0) * radius, 0, Math.sin(a0) * radius);
  }
  for (let s = 0; s < seg; s++) {
    const cur = firstPrev + s;
    const nxt = firstPrev + (s + 1) % seg;
    indices.push(0, cur, nxt);
  }
  // outer rings: keep the rim on the circle, subdivide radially inward
  // (we keep the same seg count per ring — uniform trapezoid quads)
  let prevStart = firstPrev;
  for (let r = 1; r < ringCount; r++) {
    const f = r / ringCount; // 0..1, where 1 = rim
    const start = positions.length / 3;
    for (let s = 0; s < seg; s++) {
      const a = (s / seg) * Math.PI * 2;
      // Insert rings BETWEEN center and rim (so the rim ring is the last one)
      const rad = radius * f;
      positions.push(Math.cos(a) * rad, 0, Math.sin(a) * rad);
    }
    for (let s = 0; s < seg; s++) {
      const a = start + s;
      const b = start + (s + 1) % seg;
      const c = prevStart + s;
      const d = prevStart + (s + 1) % seg;
      // Quad (c, d, a, b) — wound CCW viewed from +Y.
      indices.push(c, a, d, d, a, b);
    }
    prevStart = start;
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}
