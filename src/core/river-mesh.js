// River ribbon mesh — a width-straight strip extruded along a Catmull-Rom
// centerline. Returns the same { root, mesh, snap, extent, update } shape as
// buildPatchMesh / buildClipmapMesh so fft-ocean.js can swap it in for rivers
// without touching the surface shader (which still samples positionLocal.xz +
// clipOrigin, and now also scrolls the cascade UVs by flowDir*flowSpeed*time).
//
// The centerline is a list of waypoints in world XZ; the ribbon is built by
// sampling the spline at uniform arc-length intervals and offsetting each
// sample by ±width/2 along the spline's normal (in the XZ plane). Cross-segs
// per arc segment controls lateral tessellation for FFT displacement detail.

import { BufferGeometry, Float32BufferAttribute, Group, Mesh, Vector2, CatmullRomCurve3, Vector3 } from 'three/webgpu';

/**
 * @param {import('three/webgpu').Material} material
 * @param {object} opts
 * @param {number[][]} opts.points          centerline waypoints [[x,z], ...]
 * @param {number} [opts.width=12]           ribbon width in meters
 * @param {number} [opts.lengthSegs=128]     segments along the spline
 * @param {number} [opts.crossSegs=16]       segments across the ribbon
 * @param {boolean} [opts.closed=false]
 */
export function buildRiverMesh(material, {
  points = [[-80, 0], [-30, 12], [20, -8], [80, 6]],
  width = 12,
  lengthSegs = 128,
  crossSegs = 16,
  closed = false,
} = {}) {
  // Build a 3D Catmull-Rom curve (Y=0; the surface shader displaces Y per-vertex).
  const curvePts = points.map(([x, z]) => new Vector3(x, 0, z));
  const curve = new CatmullRomCurve3(curvePts, closed, 'catmullrom', 0.5);

  const positions = [];
  const indices = [];
  const nx = crossSegs;
  const nz = lengthSegs;

  // Sample the spline. CatmullRomCurve3.getPoint(t) is uniform in *parameter*,
  // not arc length — good enough for a gently meandering river. We also capture
  // the tangent so we can offset along the in-plane normal.
  const tmp = new Vector3();
  const tan = new Vector3();
  const nor = new Vector2(); // XZ normal (rotated tangent)
  for (let j = 0; j <= nz; j++) {
    const t = j / nz;
    curve.getPointAt(t, tmp);
    curve.getTangentAt(t, tan);
    // In-plane normal = perpendicular to (tan.x, tan.z), normalized.
    const tx = tan.x, tz = tan.z;
    const tlen = Math.hypot(tx, tz) || 1;
    nor.set(-tz / tlen, tx / tlen);
    for (let i = 0; i <= nx; i++) {
      const s = (i / nx - 0.5) * width; // −width/2 .. +width/2
      const x = tmp.x + nor.x * s;
      const z = tmp.z + nor.y * s;
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
  mesh.name = 'SeedOcean_River';
  mesh.frustumCulled = false;
  root.add(mesh);

  return {
    root,
    mesh,
    snap: 1,
    extent: curve.getLength() + width,
    update() { /* bounded water doesn't follow the camera */ },
    curve,
  };
}

/**
 * Default gently-meandering centerline, parameterized by length. The river
 * preset uses this when no explicit `points` are given.
 */
export function defaultRiverCenterline(length = 160, meander = 12) {
  const pts = [];
  const n = 8;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const x = (t - 0.5) * length;
    const z = Math.sin(t * Math.PI * 2.2) * meander;
    pts.push([x, z]);
  }
  return pts;
}
