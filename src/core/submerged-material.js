// Standard material with underwater caustic overlay (buoy, boat, crates).

import * as THREE from 'three/webgpu';
import { Fn, positionWorld, mix, uniform, time } from 'three/tsl';
import { causticsPattern, causticsSunLit } from './caustics.js';

/**
 * @param {number} baseColor
 * @param {number} causticColor
 * @param {import('three/tsl').UniformNode<THREE.Vector3>} sunDir
 * @param {import('three/tsl').UniformNode<number>} underwaterMix
 */
export function createSubmergedMaterial(baseColor, causticColor, sunDir, underwaterMix, opts = {}) {
  const base = uniform(new THREE.Color(baseColor));
  const caustic = uniform(new THREE.Color(causticColor));
  const causticStrength = uniform(opts.causticStrength ?? 0.55);

  const mat = new THREE.MeshStandardNodeMaterial({
    roughness: opts.roughness ?? 0.55,
    metalness: opts.metalness ?? 0.08,
  });

  mat.colorNode = Fn(() => {
    const pattern = causticsPattern(positionWorld.xz, time);
    const sunLit = causticsSunLit(sunDir);
    const lit = pattern.mul(causticStrength).mul(sunLit).mul(underwaterMix);
    return mix(base, caustic, lit);
  })();

  return { material: mat, causticStrength };
}
