import GUI from 'lil-gui';
import { PRESET_LIST } from '../presets/index.js';

/**
 * @param {object} ctx
 */
export function buildGUI(ctx) {
  const gui = new GUI({ title: 'SeedOcean' });
  const state = ctx.state;

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
  color.add(state, 'sssStrength', 0, 2, 0.01).name('SSS').onChange(() => ctx.onLive());
  color.add(state, 'foamStrength', 0, 1, 0.01).name('Foam').onChange(() => ctx.onLive());
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

  gui.add({ export: ctx.onExport }, 'export').name('Export .glb');

  return gui;
}

export function stateFromPreset(preset) {
  return {
    presetId: preset.id,
    seed: preset.seed,
    waveAmp: preset.waveAmp,
    waveSpeed: preset.waveSpeed,
    windDirection: preset.windDirection ?? preset.sky?.azimuth ?? 45,
    waterColor: preset.waterColor,
    deepColor: preset.deepColor,
    sssStrength: preset.sssStrength ?? 0.85,
    foamStrength: preset.foamStrength,
    roughness: preset.roughness,
    refractionStrength: preset.refractionStrength ?? 0.72,
    reflectionStrength: preset.reflectionStrength ?? 0.55,
    godRayStrength: preset.godRayStrength ?? 0.22,
    elevation: preset.sky.elevation,
    azimuth: preset.sky.azimuth,
    exposure: preset.sky.exposure,
    cloudCoverage: preset.sky.cloudCoverage,
  };
}
