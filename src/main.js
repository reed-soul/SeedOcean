import * as THREE from 'three/webgpu';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import WebGPU from 'three/addons/capabilities/WebGPU.js';

import { resolveWaves } from './core/gerstner.js';
import { buildOcean } from './core/ocean.js';
import { buildEnvironment } from './core/environment.js';
import { exportOceanGLB } from './core/export-glb.js';
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
let waves;
let state;
let clock;
let preset;

async function init() {
  preset = PRESETS[DEFAULT_PRESET];
  state = stateFromPreset(preset);
  waves = resolveWaves(preset, state.seed, state.waveAmp);

  renderer = new THREE.WebGPURenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = state.exposure;
  app.appendChild(renderer.domElement);

  scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x4a90b8, 0.0012);

  camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.5, 4000);
  camera.position.set(0, 12, 42);

  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.maxPolarAngle = Math.PI * 0.49;
  controls.minDistance = 8;
  controls.maxDistance = 280;
  controls.target.set(0, 2, 0);

  await renderer.init();

  env = buildEnvironment(renderer);
  scene.add(env.sky);
  scene.add(env.sunLight);
  scene.add(env.hemi);
  syncSky();

  ocean = buildOcean(waves);
  ocean.applyColors({ ...preset, ...state });
  ocean.setWaveGlobals(state.waveSpeed, 1);
  scene.add(ocean.mesh);

  // Reference buoy — shows scale against the swell.
  const buoy = new THREE.Mesh(
    new THREE.CylinderGeometry(0.35, 0.5, 1.2, 12),
    new THREE.MeshStandardNodeMaterial({ color: 0xff5533, roughness: 0.55 }),
  );
  buoy.position.set(6, 0.6, -4);
  buoy.name = 'Buoy';
  scene.add(buoy);

  buildGUI({
    state,
    onPreset: switchPreset,
    onReseed: rebuildWaves,
    onLive: applyLiveTuning,
    onSky: syncSky,
    onExport: () => exportSnapshot(),
  });

  clock = new THREE.Clock();
  window.addEventListener('resize', onResize);
  renderer.setAnimationLoop(animate);
}

function switchPreset(id) {
  preset = PRESETS[id];
  Object.assign(state, stateFromPreset(preset));
  rebuildWaves();
  applyLiveTuning();
  syncSky();
}

function rebuildWaves() {
  waves = resolveWaves(preset, state.seed, state.waveAmp);
  ocean.updateWaves(waves, 1);
  ocean.setWaveGlobals(state.waveSpeed, 1);
}

function applyLiveTuning() {
  ocean.applyColors({ ...preset, ...state });
  ocean.setWaveGlobals(state.waveSpeed, 1);
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
  env.updateSun(scene);
  renderer.toneMappingExposure = state.exposure;
}

function exportSnapshot() {
  const t = clock.getElapsedTime();
  const slug = preset.id;
  exportOceanGLB(ocean.mesh, waves, t, state.waveSpeed, `seedocean-${slug}.glb`);
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

  if (hud) {
    hud.textContent = [
      `SeedOcean v0.1.0-alpha`,
      `${preset.name} · seed ${state.seed}`,
      `t ${t.toFixed(1)}s`,
    ].join('\n');
  }

  renderer.render(scene, camera);
}

init().catch((e) => fail(e?.message ?? String(e)));
