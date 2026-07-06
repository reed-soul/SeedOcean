import * as THREE from 'three/webgpu';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import WebGPU from 'three/addons/capabilities/WebGPU.js';

import { buildFFTOcean } from './core/fft-ocean.js';
import { validateFFT } from './core/fft/fft.js';
import { buildEnvironment } from './core/environment.js';
import { exportFFTOceanGLB } from './core/export-glb.js';
import { BuoyancySampler } from './core/buoyancy.js';
import { buildSeafloor } from './core/seafloor.js';
import { createUnderwaterPipeline } from './core/underwater-post.js';
import { PRESETS, DEFAULT_PRESET } from './presets/index.js';
import { buildGUI, stateFromPreset } from './ui/controls.js';
import './ui/theme.css';

const hud = document.getElementById('hud');
const errBox = document.getElementById('err');
const app = document.getElementById('app');
const fail = (msg) => {
  errBox.style.display = 'grid';
  errBox.textContent = msg;
  console.error(msg);
};

if (!WebGPU.isAvailable()) {
  fail('WebGPU is required. Use Chrome 113+ or Edge 113+.');
  throw new Error('WebGPU unavailable');
}

let renderer;
let scene;
let camera;
let controls;
let ocean;
let env;
let seafloor;
let underwater;
let buoyancy;
let buoy;
let state;
let clock;
let preset;
let sunDir = new THREE.Vector3();

const ABOVE_FOG = { color: 0x4a90b8, density: 0.00085 };
const BELOW_FOG = { color: 0x032838, density: 0.0032 };

async function init() {
  preset = PRESETS[DEFAULT_PRESET];
  state = stateFromPreset(preset);

  renderer = new THREE.WebGPURenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = state.exposure;
  app.appendChild(renderer.domElement);

  scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(ABOVE_FOG.color, ABOVE_FOG.density);

  camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.5, 6000);
  camera.position.set(0, 14, 48);

  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.maxPolarAngle = Math.PI * 0.95;
  controls.minDistance = 4;
  controls.maxDistance = 420;
  controls.target.set(0, 2, 0);

  await renderer.init();

  const fftTest = await validateFFT(renderer, 128);
  if (!fftTest.pass) {
    console.warn(`FFT self-test failed (impulse=${fftTest.err1}, freq=${fftTest.err2})`);
  }

  env = buildEnvironment(renderer);
  scene.add(env.sky);
  scene.add(env.sunLight);
  scene.add(env.hemi);
  syncSky();

  ocean = await buildFFTOcean(renderer, preset, state);
  scene.add(ocean.root);
  ocean.updateClipmap(camera);

  buoyancy = new BuoyancySampler(ocean.simulator, 3);

  seafloor = buildSeafloor(preset, ocean.shading.sunDir);
  scene.add(seafloor.mesh);

  buoy = new THREE.Mesh(
    new THREE.CylinderGeometry(0.35, 0.5, 1.2, 12),
    new THREE.MeshStandardNodeMaterial({ color: 0xff5533, roughness: 0.55 }),
  );
  buoy.position.set(6, 0.6, -4);
  buoy.name = 'Buoy';
  scene.add(buoy);

  underwater = createUnderwaterPipeline(renderer, scene, camera);
  underwater.setPreset(preset);

  ocean.evolve(0, 1 / 60, state.waveSpeed);
  await buoyancy.requestReadback(renderer);

  buildGUI({
    state,
    onPreset: switchPreset,
    onReseed: reseedOcean,
    onLive: applyLiveTuning,
    onSky: syncSky,
    onExport: () => exportSnapshot(),
  });

  clock = new THREE.Clock();
  window.addEventListener('resize', onResize);
  renderer.setAnimationLoop(animate);
}

async function switchPreset(id) {
  preset = PRESETS[id];
  Object.assign(state, stateFromPreset(preset));
  await ocean.applyPreset(preset, state);
  underwater.setPreset(preset);
  applyLiveTuning();
  syncSky();
}

async function reseedOcean() {
  await ocean.applyPreset(preset, state);
}

function applyLiveTuning() {
  ocean.applyLiveTuning(preset, state);
  underwater.uniforms.godRayStrength.value = state.godRayStrength ?? preset.godRayStrength ?? 0.22;
  renderer.toneMappingExposure = state.exposure;
}

function syncSky() {
  Object.assign(env.skyState, {
    elevation: state.elevation,
    azimuth: state.azimuth,
    exposure: state.exposure,
    cloudCoverage: state.cloudCoverage,
  });
  env.sky.cloudCoverage.value = state.cloudCoverage;
  sunDir = env.updateSun(scene);
  ocean.setSunDirection(sunDir);
  underwater.uniforms.sunDir.value.copy(sunDir);
  renderer.toneMappingExposure = state.exposure;
}

function applyFogBlend(mix) {
  const fog = scene.fog;
  fog.color.setHex(mix > 0.5 ? BELOW_FOG.color : ABOVE_FOG.color);
  fog.density = THREE.MathUtils.lerp(ABOVE_FOG.density, BELOW_FOG.density, mix);
}

async function exportSnapshot() {
  ocean.evolve(clock.getElapsedTime(), clock.getDelta(), state.waveSpeed);
  const slug = preset.id;
  await exportFFTOceanGLB(renderer, ocean.root, ocean.mesh, ocean.simulator, `seedocean-${slug}.glb`);
}

function onResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

function animate() {
  const dt = clock.getDelta();
  const t = clock.getElapsedTime();
  controls.update();

  ocean.updateClipmap(camera);
  seafloor.mesh.position.x = ocean.root.position.x;
  seafloor.mesh.position.z = ocean.root.position.z;

  ocean.evolve(t, dt, state.waveSpeed);
  buoyancy.requestReadback(renderer);

  const uMix = buoyancy.underwaterMix(
    camera.position.y,
    camera.position.x,
    camera.position.z,
  );
  underwater.uniforms.underwaterMix.value = uMix;
  ocean.setUnderwaterMix(uMix);
  seafloor.updateUnderwater(uMix);
  applyFogBlend(uMix);

  const buoyY = buoyancy.getHeight(buoy.position.x, buoy.position.z);
  buoy.position.y = buoyY + 0.75;

  if (hud) {
    const fft = ocean.simulator;
    const mode = uMix > 0.45 ? 'UNDERWATER' : 'surface';
    hud.textContent = [
      `SeedOcean v0.4.0-alpha · ${mode}`,
      `${preset.name} · seed ${state.seed}`,
      `grid ${fft.N}² · ${fft.cascades.length} cascades · buoy y ${buoyY.toFixed(2)}m`,
      `t ${t.toFixed(1)}s`,
    ].join('\n');
  }

  underwater.render();
}

init().catch((e) => fail(e?.message ?? String(e)));
