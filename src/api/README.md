# SeedOcean API — headless design + live render

Two-tier programmatic API for designing and rendering oceans. The **design** tier
runs with no GPU (Node, Deno) and lets a scene composer size a scene before
spending a renderer; the **live** tier hands off to the WebGPU FFT pipeline when
a device is available. Modeled on the equivalent split in
[SeedThree's `src/api/`](https://github.com/SkyeShark/SeedThree).

```js
import { SeedOceanAPI } from 'seedocean';           // namespace export
// or
import * as SeedOceanAPI from 'seedocean/api';      // subpath (cleaner tree-shaking)
```

## Design tier — no GPU

Runs anywhere. Builds real JONSWAP params, derives closed-form sea-state stats
(significant wave height, peak wavelength/period), constructs the surface
geometry for a triangle budget, and reports the terrain envelope — all pure CPU.

### Discover

```js
SeedOceanAPI.describe();                    // → text menu: list all 19 presets
SeedOceanAPI.describe('coastal');           // → coastal's quick-start + folder index
SeedOceanAPI.describe('coastal', 'spectrum'); // → open the spectrum folder's dials
SeedOceanAPI.listPresets();                 // → [{ key, name, waterType, seed, ... }]
SeedOceanAPI.getSchema('storm');            // → { folders: { spectrum: [...], color: [...] } }
```

`getSchema()` returns knobs as **data** (`{ key, name, min, max, step, default }`),
so an agent or UI can render its own controls without hardcoding ranges.

### Design (the main call)

```js
const result = SeedOceanAPI.design({
  preset: 'coastal',   // any preset id or inline preset object
  seed: 42,            // re-rolls the FFT noise
  controls: { waveAmp: 1.4, windDirection: 200 }, // partial state override
  quality: 'perf',     // 'perf' (128²) | 'quality' (256²) — reporting only headless
});

// result.seaState — closed-form sea state
//   { significantHeight: 3.67,   // metres (Hs)
//     dominantPeakWavelength: 64, // metres
//     dominantPeakPeriod: 6.4,    // seconds
//     local: {...}, swell: {...} }

// result.stats — surface geometry budget
//   { triangles: 2384, meshes: 1, instances: 0, verts: 1260 }

// result.terrain — height envelope for bounded water (null for ocean/pool)
//   { minHeight: -6.35, maxHeight: 26.52, sampleCount: 1089 }

// result.flowmap — FlowMap bake coverage (null for ocean/pool)
//   { size: 256, worldExtent: 200, shoreCoverage: 0.055, flowCoverage: 0, meanShore: 0.44 }
```

Use `design()` to size a scene: pick a buoyancy sample count from Hs, set camera
height from the terrain envelope, budget foam from `stats.triangles` / shore
coverage — before spending a renderer.

### Preset round-trip (`seedocean-preset/1`)

```js
const json = SeedOceanAPI.toPreset({ preset: 'coastal', seed: 42, controls: { waveAmp: 1.5 } });
// → { format: 'seedocean-preset/1', preset: { id, name, seed: 42, waveAmp: 1.5, ... } }

const { preset, seed, controls } = SeedOceanAPI.fromPreset(json);
// round-trips; fromPreset also accepts legacy presets (no `format`) and normalizes them.
```

Hand `json` to a human, store it, or feed `fromPreset()` back into the live API.

## Live tier — needs a renderer

```js
const ocean = await SeedOceanAPI.createOcean({
  renderer, scene, camera,
  preset: 'coastal',
  quality: 'quality',
});
ocean.tick();   // update() + render()
```

`createOcean()` is a thin wrapper over `SeedOcean.create()` (see the main README).
It late-imports the WebGPU pipeline so the design tier never pulls the renderer
into its bundle graph.

## CPU / GPU boundary

The natural fault line is `OceanSimulator` (the FFT dispatch). Everything
**upstream** of the FFT — JONSWAP params (`buildSpectrumParams`), surface
geometry (`buildClipmapMesh` / `buildPatchMesh` / `buildRiverMesh`), terrain
heightFns (`makeFbmHeight` / `makeBasinFn` / `makeRiverChannelHeight`), buoyancy
math, wake field — is pure CPU and headless-runnable. The renderer only becomes
load-bearing at:

1. `OceanSimulator` construction + `updateInitialSpectrum` + `evolve` (the FFT).
2. TSL `MeshStandardNodeMaterial` / `MeshPhysicalNodeMaterial` colorNodes.
3. GPU readback paths (`readBuoyancyBuffer`, `readCascadeBuffers`, `exportFFTOceanGLB`).

The design API stays entirely on the upstream side. See
[`docs/ocean-fft-design.md`](../../docs/ocean-fft-design.md) for the full
algorithm/architecture brief.

## Files

- `seedocean.js` — this API (design + live adapter)
- `../core/stats.js` — `statsOf()` + `spectrumStats()` + `bandStats()` (pure CPU)
- `../core/flow-map.js` — `bakeFlowMapForPreset` / `FlowMap` (`seedocean-flowmap/1`)
- `../presets/index.js` — `PRESETS`, `normalizePreset`, `PRESET_FORMAT`
