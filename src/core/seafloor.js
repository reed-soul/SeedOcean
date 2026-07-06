// Procedural caustic light patterns on the sea floor.

import * as THREE from 'three/webgpu';
import { Fn, positionWorld, mix, uniform, time } from 'three/tsl';
import { causticsPattern, causticsSunLit } from './caustics.js';

/**
 * @param {object} preset
 * @param {import('three/tsl').UniformNode<THREE.Vector3>} sunDir
 */
export function buildSeafloor(preset, sunDir) {
  const seafloorColor = uniform(new THREE.Color(preset.seafloorColor ?? 0x0a1a22));
  const causticColor = uniform(new THREE.Color(preset.causticColor ?? 0x3a8a9a));
  const causticStrength = uniform(preset.causticStrength ?? 0.55);
  const underwaterMix = uniform(0);

  const material = new THREE.MeshStandardNodeMaterial({ roughness: 0.95, metalness: 0 });

  material.colorNode = Fn(() => {
    const caustics = causticsPattern(positionWorld.xz, time);
    const sunLit = causticsSunLit(sunDir);
    const lit = caustics.mul(causticStrength).mul(sunLit).mul(underwaterMix);
    return mix(seafloorColor, causticColor, lit);
  })();

  const geometry = new THREE.PlaneGeometry(2400, 2400, 1, 1);
  geometry.rotateX(-Math.PI / 2);

  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'SeedOcean_Seafloor';
  mesh.position.y = preset.seafloorDepth ?? -28;
  mesh.frustumCulled = false;

  return {
    mesh,
    uniforms: { underwaterMix, causticStrength },
    updateUnderwater(mix) {
      underwaterMix.value = mix;
    },
  };
}
