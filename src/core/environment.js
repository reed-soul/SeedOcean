// Sky + sun rig — mirrors the three.js webgpu_ocean example, packaged for reuse.
// Night support: a procedural star Points layer + sunLight repurposed as moonlight.

import * as THREE from 'three/webgpu';
import { SkyMesh } from 'three/addons/objects/SkyMesh.js';

/** Build a star field as Points distributed on a sphere shell. */
function buildStars(count, radius) {
  const positions = new Float32Array(count * 3);
  const sizes = new Float32Array(count);
  const colors = new Float32Array(count * 3);
  const cool = new THREE.Color(0xcdd9ff);
  const warm = new THREE.Color(0xffe9c4);
  const tmp = new THREE.Color();
  for (let i = 0; i < count; i++) {
    // Uniform distribution on a sphere (avoid pole clumping).
    const u = Math.random();
    const v = Math.random();
    const theta = 2 * Math.PI * u;
    const phi = Math.acos(2 * v - 1);
    const r = radius * (0.92 + Math.random() * 0.08);
    positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
    positions[i * 3 + 1] = Math.abs(r * Math.cos(phi)) * 0.85 + r * 0.05; // bias above horizon
    positions[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
    sizes[i] = 0.6 + Math.random() * 1.8;
    tmp.copy(warm).lerp(cool, Math.random()).multiplyScalar(0.6 + Math.random() * 0.4);
    colors[i * 3] = tmp.r;
    colors[i * 3 + 1] = tmp.g;
    colors[i * 3 + 2] = tmp.b;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

  // Circular star sprite via PointsMaterial (size attenuation, round by default
  // with a small alpha-falloff texture — fall back to default square if no tex).
  const mat = new THREE.PointsMaterial({
    size: 28,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    vertexColors: true,
    fog: false,
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  points.renderOrder = -1;
  return points;
}

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

  // Star field — inside the sky shell, only visible at night.
  const stars = buildStars(1800, 9000);

  const pmrem = new THREE.PMREMGenerator(renderer);
  const envScene = new THREE.Scene();
  let envTarget;

  const skyState = {
    elevation: 18,
    azimuth: 165,
    exposure: 0.28,
    turbidity: 8,
    cloudCoverage: 0.35,
    starsDensity: 1, // 0 = no stars, 1 = full density
  };

  // nightFactor: 0 in daytime, ramps to 1 as the sun drops below ~6°.
  let nightFactor = 0;
  const _moonColor = new THREE.Color(0x9db4ff);
  const _dayColor = new THREE.Color(0xffffff);

  function updateSun(scene) {
    const phi = THREE.MathUtils.degToRad(90 - skyState.elevation);
    const theta = THREE.MathUtils.degToRad(skyState.azimuth);
    sun.setFromSphericalCoords(1, phi, theta);

    sky.sunPosition.value.copy(sun);
    sunLight.position.copy(sun).multiplyScalar(400);

    // Derive night factor: full day above 6°, full night below 0°, blended between.
    const e = skyState.elevation;
    nightFactor = THREE.MathUtils.clamp((6 - e) / 6, 0, 1);

    // Dim + cool the light at night (the "moon" sits where the sun direction points).
    sunLight.intensity = THREE.MathUtils.lerp(1.5 + e / 45, 0.25, nightFactor);
    sunLight.color.lerpColors(_dayColor, _moonColor, nightFactor);
    hemi.intensity = THREE.MathUtils.lerp(0.6, 0.18, nightFactor);

    // Hide the solar disc at night; show stars.
    sky.showSunDisc.value = 1 - nightFactor;
    stars.material.opacity = nightFactor * skyState.starsDensity;
    stars.visible = stars.material.opacity > 0.01;

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
    if (preset.sky?.starsDensity != null) skyState.starsDensity = preset.sky.starsDensity;
    return updateSun(scene);
  }

  function dispose() {
    if (envTarget) envTarget.dispose();
    pmrem.dispose();
    stars.geometry.dispose();
    stars.material.dispose();
  }

  return { sky, sunLight, hemi, sun, stars, skyState, updateSun, applyPreset, dispose };
}
