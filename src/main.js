import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import WebGPU from 'three/addons/capabilities/WebGPU.js';
import { SeedOcean } from './seedocean.js';
import { buildGUI } from './ui/controls.js';
import { attachShorelinePainter } from './ui/shoreline-painter.js';
import { mountPanelFX } from './ui/panel-fx.js';
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

// Loading overlay — shown for the unavoidable slow path (renderer init + FFT
// pipeline compile + environment build all recompile GPU pipelines). Same
// flowing-wave GPU background as the options panel, behind the loader card.
const loadingBox = document.getElementById('loading');
const loadingMsg = loadingBox?.querySelector('.msg');
const loadingBar = loadingBox?.querySelector('.bar-fill');
const loadingCard = loadingBox?.querySelector('.card');
if (loadingCard) mountPanelFX(loadingCard);
const showLoading = () => { loadingBox?.classList.remove('fade'); loadingBox?.classList.add('on'); };
// Fade out (opacity is compositor-driven, so the fade stays smooth even if the
// main thread is still settling), then drop display:none once it's faded.
const hideLoading = () => {
  if (!loadingBox) return;
  loadingBox.classList.add('fade');
  setTimeout(() => loadingBox.classList.remove('on', 'fade'), 450);
};
// Two rAFs guarantee the browser actually PAINTS the overlay before we hand the
// main thread to the blocking pipeline compile (one rAF only queues it).
const nextPaint = () => new Promise((r) => {
  let done = false; const fin = () => { if (!done) { done = true; r(); } };
  requestAnimationFrame(() => requestAnimationFrame(fin));
  setTimeout(fin, 300); // fallback: a backgrounded/throttled tab pauses rAF — don't hang
});
// Progress bar + live step label. setStage writes the text/width; stageStep also
// YIELDS a paint so each step is SEEN before the next blocking chunk runs (a
// synchronous shader compile can't repaint mid-freeze — the bar would just jump).
const setStage = (text, frac) => {
  if (loadingMsg && text != null) loadingMsg.textContent = text;
  if (loadingBar && frac != null) loadingBar.style.width = `${Math.round(frac * 100)}%`;
};

// Show the loader immediately so there's never a blank frame before init runs.
showLoading();

let seedOcean;
let controls;
let painter;

async function init() {
  // Allow `?preset=ID` to boot straight into a preset (useful for bounded-water
  // types like pool that need the ocean built with the right mesh from the start).
  const params = new URLSearchParams(location.search);
  const initialPreset = params.get('preset') || undefined;

  setStage('Initializing renderer…', 0.12);
  await nextPaint();

  seedOcean = await SeedOcean.create({
    container: app,
    preset: initialPreset,
    demoObjects: true,
    quality: 'quality',
    validateFFT: true,
  });

  setStage('Compiling FFT ocean…', 0.55);
  await nextPaint();

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

  setStage('Almost ready', 0.9);
  await nextPaint();

  window.addEventListener('resize', onResize);
  window.__seedOcean = seedOcean;
  seedOcean.renderer.setAnimationLoop(animate);

  // Let the first rendered frame paint before lifting the overlay, so the
  // canvas is actually visible underneath the fade-out.
  requestAnimationFrame(() => requestAnimationFrame(hideLoading));
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
