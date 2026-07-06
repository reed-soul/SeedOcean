// Procedural ocean mesh — Gerstner displacement + depth-tinted PBR water.

import * as THREE from 'three/webgpu';
import {
  color, float, mix, positionWorld, cameraPosition, normalize, dot, pow, max,
  smoothstep, uniform,
} from 'three/tsl';
import { buildGerstnerNodes } from './gerstner.js';

const DEFAULT_SEGMENTS = 256;
const DEFAULT_SIZE = 800;

/**
 * @param {ReturnType<import('./gerstner.js').wavesFromPreset>} waves
 */
export function buildOcean(waves, options = {}) {
  const size = options.size ?? DEFAULT_SIZE;
  const segments = options.segments ?? DEFAULT_SEGMENTS;

  const gerstner = buildGerstnerNodes(waves);

  const waterColorU = uniform(color(0x0a4f6e));
  const deepColorU = uniform(color(0x021a2b));
  const foamColorU = uniform(color(0xd8f0ff));
  const roughnessU = uniform(0.08);
  const metalnessU = uniform(0.15);
  const foamStrengthU = uniform(0.35);

  const material = new THREE.MeshPhysicalNodeMaterial({
    transparent: true,
    side: THREE.DoubleSide,
    depthWrite: true,
  });

  material.positionNode = gerstner.displacedPosition();
  material.normalNode = gerstner.displacedNormal();

  const viewDir = normalize(cameraPosition.sub(positionWorld));
  const n = gerstner.displacedNormal();
  const fresnel = pow(float(1).sub(max(dot(n, viewDir), 0)), 3).saturate();
  const depthTint = smoothstep(float(-2), float(6), positionWorld.y);

  material.colorNode = mix(deepColorU, waterColorU, depthTint)
    .add(foamColorU.mul(fresnel.mul(foamStrengthU)));
  material.roughnessNode = roughnessU;
  material.metalnessNode = metalnessU;

  const geometry = new THREE.PlaneGeometry(size, size, segments, segments);
  geometry.rotateX(-Math.PI / 2);

  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'SeedOcean_Surface';
  mesh.receiveShadow = true;

  function applyColors(preset) {
    waterColorU.value.set(preset.waterColor ?? 0x0a4f6e);
    deepColorU.value.set(preset.deepColor ?? 0x021a2b);
    foamColorU.value.set(preset.foamColor ?? 0xd8f0ff);
    roughnessU.value = preset.roughness ?? 0.08;
    metalnessU.value = preset.metalness ?? 0.15;
    foamStrengthU.value = preset.foamStrength ?? 0.35;
  }

  function updateWaves(wavesResolved, ampScale = 1) {
    gerstner.updateFromPreset(wavesResolved, ampScale);
  }

  function setWaveGlobals(speed, amp) {
    gerstner.waveSpeed.value = speed;
    gerstner.waveAmp.value = amp;
  }

  return {
    mesh,
    material,
    geometry,
    gerstner,
    applyColors,
    updateWaves,
    setWaveGlobals,
  };
}
