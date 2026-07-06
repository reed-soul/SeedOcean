// Procedural caustic light patterns on the sea floor.

import * as THREE from 'three/webgpu';
import { Fn, positionWorld, sin, cos, vec2, mix, color, float, uniform, time, saturate, dot, max } from 'three/tsl';

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
    const uv = positionWorld.xz.mul(0.065);
    const t = time;
    const layer1 = sin(uv.x.mul(9).add(t.mul(0.7))).mul(sin(uv.y.mul(8).sub(t.mul(0.5))));
    const layer2 = sin(uv.x.mul(14).sub(t.mul(0.4))).mul(cos(uv.y.mul(11).add(t.mul(0.6))));
    const caustics = layer1.add(layer2).mul(0.5).add(0.5).pow(2).mul(2.2).saturate();

    const sunLit = saturate(dot(vec3(0, 1, 0), sunDir).mul(0.5).add(0.5));
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
