// Nested-ring clipmap — camera-snapped infinite ocean surface.
// Level 0 is a dense center patch; each outer level doubles extent.
//
// SEAM STITCHING (the whole point of this geometry):
//
// FFT displacement is sampled in world space, so two verts at the same world
// XZ get the same displacement and stay welded after the vertex shader moves
// them. Conversely, a T-junction — where a coarse ring's inner edge has verts
// at x={0, 14, 28...} but the fine inner layer's edge has verts at
// x={0, 3.5, 7, 10.5, 14...} — means the coarse ring's triangle spans
// 0→14 as a single flat edge while the fine layer's verts at 3.5/7/10.5
// displace independently. After displacement the two surfaces separate and
// you see a crack exactly along the LOD boundary.
//
// Fix: build each ring so its inner edge verts are EXACTLY the inner layer's
// outer edge verts (same world XZ). We do this by passing the inner layer's
// four edge vertex-index arrays forward and reusing them as the ring's inner
// edge. The ring then fans outward to a coarser outer edge — the LOD savings
// live in the radial direction only, never on the tangential seam.

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

  function v(x, z) {
    const i = positions.length / 3;
    positions.push(x, 0, z);
    return i;
  }
  function tri(a, b, c) { indices.push(a, b, c); }

  // Build a ring side as a triangle strip between an inner edge (array of
  // vertex indices, fine resolution) and an outer edge (newly created verts
  // at coarser resolution). The inner edge is reused verbatim — those verts
  // already exist (from the inner layer's outer edge or the previous side).
  // `outerPos` is a function(tIdx) => [x,z] for the outer edge, sampled at
  // outerN+1 points. We build a fan that connects each inner segment to the
  // matching outer span, introducing no T-junctions on the inner side.
  function ringSide(innerEdgeIdx, outerPos, outerN) {
    // outerEdge verts (newly created).
    const outer = [];
    for (let i = 0; i <= outerN; i++) {
      const [ox, oz] = outerPos(i, outerN);
      outer.push(v(ox, oz));
    }
    const innerN = innerEdgeIdx.length - 1;
    // Walk inner and outer edges together, mapping the fine inner segments to
    // the coarser outer segments. For each outer segment we may span several
    // inner segments — fan them to the outer edge vert.
    // Simple robust mapping: parameterize both by t in [0,1]; for each inner
    // segment [i, i+1] find the outer vert it maps to (by closest t) and emit
    // a quad/triangle. We use a merge by t-fraction.
    let oi = 0;
    for (let i = 0; i < innerN; i++) {
      const t0 = i / innerN;
      const t1 = (i + 1) / innerN;
      // outer vert index for t0 (clamped to outer grid)
      const o0 = Math.min(outerN, Math.round(t0 * outerN));
      const o1 = Math.min(outerN, Math.round(t1 * outerN));
      const a = innerEdgeIdx[i];
      const b = innerEdgeIdx[i + 1];
      if (o0 === o1) {
        // inner segment collapses to one outer vert → triangle
        tri(a, outer[o0], b);
      } else {
        // span outer verts o0..o1
        tri(a, outer[o0], b);
        for (let k = o0; k < o1; k++) {
          tri(b, outer[k], outer[k + 1]);
        }
      }
    }
    return outer;
  }

  // Level 0 — dense center patch. Build it as a grid and capture its four
  // edge vertex-index arrays (ordered consistently: left→right for top/bottom,
  // bottom→top for left/right) so level 1 can weld to them.
  function buildCenterGrid(half, n) {
    const g = [];
    for (let j = 0; j <= n; j++) {
      const row = [];
      for (let i = 0; i <= n; i++) row.push(v(-half + (2 * half * i) / n, -half + (2 * half * j) / n));
      g.push(row);
    }
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const a = g[j][i], b = g[j][i + 1], c = g[j + 1][i], d = g[j + 1][i + 1];
      tri(a, c, b); tri(b, c, d);
    }
    // edges: top = g[n][0..n] (z=+half, left→right), bottom = g[0][0..n],
    // left = g[0..n][0] (x=-half, bottom→top), right = g[0..n][n].
    return {
      top: g[n], bottom: g[0], left: g.map(r => r[0]), right: g.map(r => r[n]),
    };
  }

  let edges = buildCenterGrid(patchHalf, cells);
  let inner = patchHalf;
  for (let level = 1; level < levels; level++) {
    const outer = inner * 2;
    // Coarsen the OUTER edge of this ring (radial LOD). Keep enough verts to
    // avoid extreme sliver triangles.
    const outerN = Math.max(4, cells >> level);

    // Four sides. Each side's inner edge = the matching inner-layer outer edge
    // (already-built vertex indices, fine resolution). The outer edge is newly
    // created at outerN+1 verts along the ring's outer boundary.
    //
    // Corner handling: the outer edges of adjacent sides share corner verts.
    // We build top, right, bottom, left in order and let each side create its
    // own outer verts including both corners; the next side's outer-start
    // vert reuses... actually simplest: each side creates its full outer edge
    // independently (corners are duplicated, which is fine — they're at equal
    // world XZ so displacement welds them).

    // Top side: inner edge = edges.top (z=+inner, x from -inner..+inner).
    //          outer edge at z=+outer, x from -outer..+outer.
    const topOuter = ringSide(edges.top, (i, n) => [-outer + (2 * outer * i) / n, outer], outerN);
    // Right side: inner edge = edges.right (x=+inner, z from -inner..+inner).
    //             outer edge at x=+outer, z from -outer..+outer. Note z runs
    //             -inner..+inner on inner, but outer spans -outer..+outer —
    //             the mapping is by t, which ringSide handles.
    const rightOuter = ringSide(edges.right, (i, n) => [outer, -outer + (2 * outer * i) / n], outerN);
    // Bottom side: inner edge = edges.bottom (z=-inner, x from -inner..+inner).
    const botOuter = ringSide(edges.bottom, (i, n) => [-outer + (2 * outer * i) / n, -outer], outerN);
    // Left side: inner edge = edges.left (x=-inner, z from -inner..+inner).
    const leftOuter = ringSide(edges.left, (i, n) => [-outer, -outer + (2 * outer * i) / n], outerN);

    // The four outer edges (topOuter etc.) become the inner edges of the next
    // level. They run left→right (top/bottom) or bottom→top (left/right) by
    // construction of outerPos above. Save them.
    edges = { top: topOuter, bottom: botOuter, left: leftOuter, right: rightOuter };
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
