// Sky + sun rig — mirrors the three.js webgpu_ocean example, packaged for reuse.

import * as THREE from 'three/webgpu';
import { SkyMesh } from 'three/addons/objects/SkyMesh.js';

/**
 * @param {THREE.WebGPURenderer} renderer
 */
export function buildEnvironment(renderer) {
  const sun = new THREE.Vector3();
  const sky = new SkyMesh();
  sky.scale.setScalar(10000);

  sky.turbidity.value = 8;
  sky.rayleigh.value = 2.2;
  sky.mieCoefficient.value = 0.004;
  sky.mieDirectionalG.value = 0.75;
  sky.cloudCoverage.value = 0.35;
  sky.cloudDensity.value = 0.45;
  sky.cloudElevation.value = 0.45;

  const sunLight = new THREE.DirectionalLight(0xffffff, 2.5);
  sunLight.castShadow = false;

  const hemi = new THREE.HemisphereLight(0x7ec8ff, 0x0a1a2e, 0.6);

  const pmrem = new THREE.PMREMGenerator(renderer);
  const envScene = new THREE.Scene();
  let envTarget;

  const skyState = {
    elevation: 18,
    azimuth: 165,
    exposure: 0.28,
    turbidity: 8,
    cloudCoverage: 0.35,
  };

  function updateSun(scene) {
    const phi = THREE.MathUtils.degToRad(90 - skyState.elevation);
    const theta = THREE.MathUtils.degToRad(skyState.azimuth);
    sun.setFromSphericalCoords(1, phi, theta);

    sky.sunPosition.value.copy(sun);
    sunLight.position.copy(sun).multiplyScalar(400);
    sunLight.intensity = 1.5 + skyState.elevation / 45;

    if (envTarget) envTarget.dispose();
    envScene.add(sky);
    envTarget = pmrem.fromScene(envScene);
    scene.environment = envTarget.texture;

    return sun.clone().normalize();
  }

  function applyPreset(preset, scene) {
    Object.assign(skyState, preset.sky ?? {});
    if (preset.sky?.turbidity != null) sky.turbidity.value = preset.sky.turbidity;
    if (preset.sky?.cloudCoverage != null) sky.cloudCoverage.value = preset.sky.cloudCoverage;
    return updateSun(scene);
  }

  function dispose() {
    if (envTarget) envTarget.dispose();
    pmrem.dispose();
  }

  return { sky, sunLight, hemi, sun, skyState, updateSun, applyPreset, dispose };
}
