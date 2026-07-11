import GUI from 'lil-gui';
import { PRESET_LIST } from '../presets/index.js';
import { mountPanelFX } from './panel-fx.js';

/**
 * @param {object} ctx
 * @param {object} ctx.state
 * @param {(id: string) => void} ctx.onPreset
 * @param {() => void} ctx.onReseed
 * @param {() => void} ctx.onLive
 * @param {() => void} ctx.onSky
 * @param {() => void} ctx.onExport
 * @param {object} [ctx.brush] — shoreline painter brush state (mutated in place)
 * @param {() => void} [ctx.onBrushReset]
 * @param {() => void} [ctx.onExportPreset]
 */
export function buildGUI(ctx) {
  const gui = new GUI({ title: '' });
  const state = ctx.state;

  // Branding header — pure-text wordmark (drop in a logo image later by
  // replacing this span with an <img>). Sits above the folders.
  const brand = document.createElement('div');
  brand.className = 'so-brand';
  brand.textContent = 'SeedOcean';
  gui.domElement.prepend(brand);
  gui.domElement.querySelector(':scope > .lil-title')?.remove(); // brand replaces the default title bar
  mountPanelFX(gui.domElement); // flowing-waves GPU background

  const presetNames = Object.fromEntries(PRESET_LIST.map((p) => [p.name, p.id]));
  const presetFolder = gui.addFolder('Preset');
  presetFolder.add({ preset: state.presetId }, 'preset', presetNames)
    .name('Environment')
    .onChange((id) => ctx.onPreset(id));

  const waves = gui.addFolder('Spectrum');
  waves.add(state, 'seed', 1, 9999, 1).name('Seed').onFinishChange(ctx.onReseed);
  waves.add(state, 'waveAmp', 0.2, 2.0, 0.01).name('Amplitude').onChange(() => ctx.onReseed());
  waves.add(state, 'waveSpeed', 0.1, 2.5, 0.01).name('Wind ×').onChange(() => ctx.onReseed());
  waves.add(state, 'windDirection', 0, 360, 1).name('Wind °').onChange(() => ctx.onReseed());

  const color = gui.addFolder('Water');
  color.addColor(state, 'waterColor').name('Shallow').onChange(() => ctx.onLive());
  color.addColor(state, 'deepColor').name('Deep').onChange(() => ctx.onLive());
  color.add(state, 'sssStrength', 0, 3, 0.01).name('SSS').onChange(() => ctx.onLive());
  color.add(state, 'foamStrength', 0, 1, 0.01).name('Foam').onChange(() => ctx.onLive());
  color.add(state, 'foamPersistence', 0, 0.95, 0.01).name('Foam hold').onChange(() => ctx.onLive());
  color.add(state, 'roughness', 0, 1, 0.01).name('Roughness').onChange(() => ctx.onLive());
  color.add(state, 'refractionStrength', 0, 1, 0.01).name('Refraction').onChange(() => ctx.onLive());
  color.add(state, 'reflectionStrength', 0, 1, 0.01).name('Reflection').onChange(() => ctx.onLive());

  const under = gui.addFolder('Underwater');
  under.add(state, 'godRayStrength', 0, 0.6, 0.01).name('God rays').onChange(() => ctx.onLive());

  const sky = gui.addFolder('Sky');
  sky.add(state, 'elevation', 0, 60, 0.5).name('Sun height').onChange(() => ctx.onSky());
  sky.add(state, 'azimuth', 0, 360, 1).name('Sun bearing').onChange(() => ctx.onSky());
  sky.add(state, 'exposure', 0.05, 1.2, 0.01).name('Exposure').onChange(() => ctx.onSky());
  sky.add(state, 'cloudCoverage', 0, 1, 0.01).name('Clouds').onChange(() => ctx.onSky());
  sky.add(state, 'starsDensity', 0, 1, 0.01).name('Stars').onChange(() => ctx.onSky());

  // Shoreline painter (Phase 11d) — Shift+drag on the water plane.
  if (ctx.brush) {
    const brush = ctx.brush;
    const paint = gui.addFolder('Shoreline brush');
    paint.add(brush, 'enabled').name('Enabled');
    paint.add(brush, 'mode', ['shore', 'flow', 'erase']).name('Mode');
    paint.add(brush, 'radius', 1, 24, 0.5).name('Radius m');
    paint.add(brush, 'strength', 0.05, 1, 0.01).name('Strength');
    paint.add(brush, 'direction', 0, 360, 1).name('Flow °');
    if (ctx.onBrushReset) {
      paint.add({ reset: ctx.onBrushReset }, 'reset').name('Reset map');
    }
    paint.open();
  }

  const io = gui.addFolder('Export');
  io.add({ export: ctx.onExport }, 'export').name('Export .glb');
  if (ctx.onExportPreset) {
    io.add({ save: ctx.onExportPreset }, 'save').name('Save preset JSON');
  }

  return gui;
}
