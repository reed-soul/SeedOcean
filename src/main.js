import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import WebGPU from 'three/addons/capabilities/WebGPU.js';
import { SeedOcean } from './seedocean.js';
import { buildGUI } from './ui/controls.js';
import { attachShorelinePainter } from './ui/shoreline-painter.js';
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
  console.warn('WebGPU unavailable — running in WebGL2 fallback mode (Gerstner waves).');
}

let seedOcean;
let controls;
let painter;

async function init() {
  // Allow `?preset=ID` to boot straight into a preset (useful for bounded-water
  // types like pool that need the ocean built with the right mesh from the start).
  const params = new URLSearchParams(location.search);
  const initialPreset = params.get('preset') || undefined;

  seedOcean = await SeedOcean.create({
    container: app,
    preset: initialPreset,
    demoObjects: true,
    quality: 'quality',
    validateFFT: true,
  });

  controls = new OrbitControls(seedOcean.camera, seedOcean.renderer.domElement);
  controls.enableDamping = true;
  controls.maxPolarAngle = Math.PI * 0.95;
  controls.minDistance = 4;
  controls.maxDistance = 420;
  controls.target.set(0, 2, 0);

  if (!seedOcean.fftTest?.pass) {
    console.warn(
      `FFT self-test failed (impulse=${seedOcean.fftTest?.err1}, freq=${seedOcean.fftTest?.err2})`,
    );
  }

  painter = attachShorelinePainter({ ocean: seedOcean, controls });

  buildGUI({
    state: seedOcean.state,
    brush: painter.brush,
    onPreset: (id) => seedOcean.applyPreset(id),
    onReseed: () => seedOcean.applyPreset(seedOcean.preset),
    onLive: () => seedOcean.applyLiveTuning(),
    onSky: () => seedOcean.syncSky(),
    onExport: () => seedOcean.exportGLB(),
    onExportPreset: () => seedOcean.exportPreset({ download: true }),
    onBrushReset: () => painter.reset(),
  });

  window.addEventListener('resize', onResize);
  window.__seedOcean = seedOcean;
  seedOcean.renderer.setAnimationLoop(animate);
}

function onResize() {
  seedOcean.resize(window.innerWidth, window.innerHeight);
}

function animate() {
  controls.update();
  const { t, underwaterMix: uMix } = seedOcean.update();

  if (hud) {
    const { preset, state, ocean, boat } = seedOcean;
    const mode = uMix > 0.45 ? 'UNDERWATER' : 'surface';
    const brushHint = painter?.brush?.enabled ? ' · Shift+drag paint' : '';
    hud.textContent = [
      `SeedOcean v${seedOcean.version} · ${mode}${brushHint}`,
      `${preset.name} · seed ${state.seed}`,
      `grid ${ocean.simulator.N}² · ${ocean.simulator.cascades.length} cascades · boat y ${boat?.position.y.toFixed(2) ?? '—'}m`,
      `wake + refraction · t ${t.toFixed(1)}s`,
    ].join('\n');
  }

  seedOcean.render();
}

init().catch((e) => fail(e?.message ?? String(e)));
