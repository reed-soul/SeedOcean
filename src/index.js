export { SeedOcean } from './seedocean.js';
export { PRESETS, DEFAULT_PRESET, PRESET_LIST, PRESET_FORMAT, normalizePreset } from './presets/index.js';
export { buildFFTOcean } from './core/fft-ocean.js';
export { validateFFT } from './core/fft/fft.js';
export { BuoyancySampler } from './core/buoyancy.js';
export { BuoyancySystem, BuoyancyBody } from './core/buoyancy-body.js';
export { createUnderwaterPipeline } from './core/underwater-post.js';
export { buildSeafloor } from './core/seafloor.js';
export { buildTerrain, makeFbmHeight, makeRiverChannelHeight, makeBeachHeight } from './core/terrain.js';
export { buildPoolScene } from './core/pool-scene.js';
export { buildRiverMesh, defaultRiverCenterline } from './core/river-mesh.js';
export { FlowMap, bakeFlowMapForPreset, normalizeFlowMapConfig, FLOWMAP_FORMAT } from './core/flow-map.js';
export { WATER, waterTypeOf, usesTerrain, isEnclosed, usesFlowMapAuto, usesPatchMesh } from './core/water-types.js';
export { attachShorelinePainter } from './ui/shoreline-painter.js';
export { exportFFTOceanGLB } from './core/export-glb.js';
export { statsOf, spectrumStats, bandStats } from './core/stats.js';
export { stateFromPreset } from './state.js';

// Importing the main entry (`seedocean` / `src/index.js`) auto-registers the
// `<water-canvas>` custom element as a side effect. For explicit control, import
// `seedocean/web-component` directly — it registers the element when evaluated.
export { SeedOceanCanvas } from './web-component.js';

// Headless design API — no-GPU design/introspection surface (listPresets /
// describe / getSchema / design / toPreset / fromPreset) plus a live adapter.
// Also available as the `seedocean/api` subpath import. See src/api/README.md.
export * as SeedOceanAPI from './api/seedocean.js';

