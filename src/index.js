export { SeedOcean } from './seedocean.js';
export { PRESETS, DEFAULT_PRESET, PRESET_LIST, PRESET_FORMAT, normalizePreset } from './presets/index.js';
export { buildFFTOcean } from './core/fft-ocean.js';
export { validateFFT } from './core/fft/fft.js';
export { BuoyancySampler } from './core/buoyancy.js';
export { BuoyancySystem, BuoyancyBody } from './core/buoyancy-body.js';
export { createUnderwaterPipeline } from './core/underwater-post.js';
export { buildSeafloor } from './core/seafloor.js';
export { buildTerrain, makeFbmHeight, makeRiverChannelHeight } from './core/terrain.js';
export { buildPoolScene } from './core/pool-scene.js';
export { buildRiverMesh, defaultRiverCenterline } from './core/river-mesh.js';
export { exportFFTOceanGLB } from './core/export-glb.js';
export { statsOf, spectrumStats, bandStats } from './core/stats.js';
export { stateFromPreset } from './ui/controls.js';

// Auto-registering <water-canvas> custom element. Importing this side-effect
// module registers the element; it also re-exports the class for tests.
export { SeedOceanCanvas } from './web-component.js';

// Headless design API — no-GPU design/introspection surface (listPresets /
// describe / getSchema / design / toPreset / fromPreset) plus a live adapter.
// Also available as the `seedocean/api` subpath import. See src/api/README.md.
export * as SeedOceanAPI from './api/seedocean.js';

