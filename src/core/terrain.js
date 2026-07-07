// Procedural terrain — displaced PlaneGeometry used as the lake basin / river
// banks for bounded water. Same caustic shading as seafloor.js (the material is
// water-type-agnostic — it just reads positionWorld.xz), but with real relief so
// the water surface can intersect a shoreline instead of a flat plane.
//
// heightFn is sampled identically on the GPU (per-vertex displacement) and on
// the CPU (getHeight), so surface-waterline queries stay in sync with the mesh
// without a GPU readback.

import * as THREE from 'three/webgpu';
import { Fn, positionWorld, mix, uniform, time, float } from 'three/tsl';
import { causticsPattern, causticsSunLit } from './caustics.js';
import { Rng } from './rng.js';

/**
 * Value-noise gradient field seeded for determinism. Reused by the fBm sum so
 * every octave pulls from a stable lattice — getHeight(x,z) on the CPU matches
 * the GPU displacement bit-for-bit (modulo float precision).
 *
 * @param {number} seed
 * @param {number} size lattice is sampled in cellsPerUnit units; one grid per world unit region
 */
function makeValueNoise(seed, latticeSize = 256) {
  const rng = new Rng(seed);
  const n = latticeSize;
  const grid = new Float32Array(n * n);
  for (let i = 0; i < n * n; i++) grid[i] = rng.float();
  const at = (ix, iz) => grid[((iz % n + n) % n) * n + ((ix % n + n) % n)];
  const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
  const lerp = (a, b, t) => a + (b - a) * t;
  /** @param {number} x @param {number} z */
  return function sample(x, z) {
    const fx = x - Math.floor(x);
    const fz = z - Math.floor(z);
    const ix = Math.floor(x);
    const iz = Math.floor(z);
    const u = fade(fx);
    const v = fade(fz);
    const x0 = lerp(at(ix, iz), at(ix + 1, iz), u);
    const x1 = lerp(at(ix, iz + 1), at(ix + 1, iz + 1), u);
    return lerp(x0, x1, v) * 2 - 1; // remap [0,1] → [-1,1]
  };
}

/**
 * Build a fractal-Brownian-motion height function centered on the origin.
 * Returns a closure (x, z) => height in world meters.
 *
 * @param {object} opts
 * @param {number} [opts.seed=1]
 * @param {number} [opts.amplitude=8]      peak-to-trough half-range, meters
 * @param {number} [opts.frequency=0.04]   base spatial frequency (cycles / meter)
 * @param {number} [opts.octaves=4]
 * @param {number} [opts.persistence=0.5]  per-octave amplitude falloff
 * @param {number} [opts.lacunarity=2.0]   per-octave frequency growth
 */
export function makeFbmHeight({
  seed = 1,
  amplitude = 8,
  frequency = 0.04,
  octaves = 4,
  persistence = 0.5,
  lacunarity = 2.0,
} = {}) {
  const noise = makeValueNoise(seed);
  /** @param {number} x @param {number} z */
  return function heightAt(x, z) {
    let amp = 1;
    let freq = frequency;
    let sum = 0;
    let norm = 0;
    for (let o = 0; o < octaves; o++) {
      sum += noise(x * freq, z * freq) * amp;
      norm += amp;
      amp *= persistence;
      freq *= lacunarity;
    }
    return (sum / norm) * amplitude;
  };
}

/**
 * @param {object} opts
 * @param {number} [opts.size=400]                 square world extent, meters
 * @param {number} [opts.resolution=128]           subdivisions per side
 * @param {(x:number,z:number)=>number} [opts.heightFn]  CPU/GPU height sampler; defaults to fBm
 * @param {object} [opts.preset]                   for caustic/seafloor colors (mirrors buildSeafloor)
 * @param {import('three/tsl').UniformNode<THREE.Vector3>} [opts.sunDir]
 * @param {number} [opts.seed]
 */
export function buildTerrain({
  size = 400,
  resolution = 128,
  heightFn,
  preset = {},
  sunDir,
  seed,
} = {}) {
  // Default to fBm; heightFn is shared between mesh displacement and getHeight,
  // so callers can also pass a custom sampler (e.g. a basin-shaped function).
  const hFn = heightFn ?? makeFbmHeight({
    seed: seed ?? preset.seed ?? 1,
    amplitude: preset.terrainAmplitude ?? 8,
    frequency: preset.terrainFrequency ?? 0.04,
    octaves: preset.terrainOctaves ?? 4,
  });

  // ---- Mesh: PlaneGeometry rotated to XZ, vertices displaced by hFn ----
  const geometry = new THREE.PlaneGeometry(size, size, resolution, resolution);
  geometry.rotateX(-Math.PI / 2);
  const pos = geometry.attributes.position;
  const half = size / 2;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    pos.setY(i, hFn(x, z));
  }
  pos.needsUpdate = true;
  geometry.computeVertexNormals();

  // ---- Material: reuses seafloor's caustic shading (water-type-agnostic) ----
  const seafloorColor = uniform(new THREE.Color(preset.seafloorColor ?? 0x4a3a28));
  const causticColor = uniform(new THREE.Color(preset.causticColor ?? 0x3a8a9a));
  const causticStrength = uniform(preset.causticStrength ?? 0.55);
  const underwaterMix = uniform(0);

  const material = new THREE.MeshStandardNodeMaterial({ roughness: 0.95, metalness: 0 });
  material.colorNode = Fn(() => {
    const caustics = causticsPattern(positionWorld.xz, time);
    const sunLit = sunDir ? causticsSunLit(sunDir) : float(1);
    const lit = caustics.mul(causticStrength).mul(sunLit).mul(underwaterMix);
    return mix(seafloorColor, causticColor, lit);
  })();

  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'SeedOcean_Terrain';
  mesh.frustumCulled = false;

  // Clamped CPU query — bounded water callers (lake shoreline, river bank) ask
  // for terrain height inside the [−half, half] square. Outside the patch the
  // sampler is still valid (fBm is infinite), but we clamp so lake/river don't
  // accidentally read nonsense at the demo's edges.
  function getHeight(x, z) {
    const cx = THREE.MathUtils.clamp(x, -half, half);
    const cz = THREE.MathUtils.clamp(z, -half, half);
    return hFn(cx, cz);
  }

  return {
    mesh,
    uniforms: { underwaterMix, causticStrength },
    getHeight,
    /** @param {number} mix */
    updateUnderwater(mix) { underwaterMix.value = mix; },
  };
}
