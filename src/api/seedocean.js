// SeedOcean headless Design API — design and introspect oceans programmatically,
// with no dev server, no browser, and (for the design surface) no GPU.
//
// This is a thin ADAPTER over the exact same parameter + geometry code the live
// renderer runs: it imports the real preset registry, the real
// buildSpectrumParams (JONSWAP param math), the real mesh builders (clipmap /
// patch / river), and the real terrain heightFns — so an ocean designed here is
// parameter-identical to one rendered by SeedOcean.create. Nothing in the live
// app is modified; the Vite bundle imports this file only via the `./api`
// subpath (or the SeedOceanAPI namespace), never from the default entry.
//
// Two tiers of use:
//   • DESIGN (no GPU): listPresets / getSchema / describe / design / toPreset /
//     fromPreset. Runs under Node and Deno. Design() builds the JONSWAP params,
//     derives closed-form sea-state stats (Hs / peak wavelength / period), and
//     constructs the surface geometry to report a triangle budget — all pure
//     CPU. The renderer never touches this path.
//   • LIVE (needs a real THREE renderer/device): createOcean() is a thin wrapper
//     over SeedOcean.create so an integrator has ONE entrypoint that hands off
//     to the live pipeline when a device is available.
//
// The design/introspection surface mirrors SeedThree's src/api/seedthree.js:
// describe() is the progressive-disclosure text menu an agent uses to discover
// presets → folders → knobs, getSchema() exposes those knobs as data, and
// toPreset/fromPreset round-trip the seedocean-preset/1 JSON the live app's Save
// would write (once it grows one — the format is forward-compatible).

import { PRESETS, DEFAULT_PRESET, PRESET_FORMAT, normalizePreset } from '../presets/index.js';
import { resolvePreset } from '../presets/resolve.js';
import { buildSpectrumParams } from '../core/fft/defaults.js';
import { buildClipmapMesh } from '../core/clipmap.js';
import { buildPatchMesh } from '../core/water-patch.js';
import { buildRiverMesh, defaultRiverCenterline } from '../core/river-mesh.js';
import { makeFbmHeight, makeBasinFn, makeRiverChannelHeight } from '../core/terrain.js';
import { statsOf, spectrumStats } from '../core/stats.js';
import { stateFromPreset } from '../state.js';

export { PRESETS, DEFAULT_PRESET, PRESET_FORMAT, normalizePreset, resolvePreset };

// ---- preset resolution -----------------------------------------------------

// ---- introspection ---------------------------------------------------------

/** One-line descriptor per preset — the menu an agent picks from. */
export function listPresets() {
  return Object.entries(PRESETS).map(([key, p]) => ({
    key,
    name: p.name,
    description: p.description ?? null,
    waterType: p.waterType ?? 'ocean',
    generator: 'fft-jonswap',
    seed: p.seed,
  }));
}

// The globally-editable controls (preset-derived, not environment-specific) that
// the live UI exposes. Kept as DATA so an agent can discover what's tunable
// without rendering. Grouped into folders mirroring the describe() menu.
//
// `apply` is the field on the live state object the knob writes to (matches
// OceanState in seedocean.d.ts). Min/max/step/default are the UI ranges.
const SCHEMA = {
  spectrum: [
    { key: 'waveAmp', name: 'Wave amplitude', min: 0.1, max: 3, step: 0.05, default: 1 },
    { key: 'waveSpeed', name: 'Wave speed', min: 0, max: 3, step: 0.05, default: 1 },
    { key: 'windDirection', name: 'Wind direction (°)', min: 0, max: 360, step: 1, default: 45 },
    { key: 'foamPersistence', name: 'Foam persistence', min: 0, max: 1, step: 0.01, default: 0.55 },
  ],
  color: [
    { key: 'waterColor', name: 'Shallow color', type: 'color', default: 0x0a5f7a },
    { key: 'deepColor', name: 'Deep color', type: 'color', default: 0x062f3e },
    { key: 'scatterColor', name: 'Scatter color', type: 'color', default: 0x6ed4d4 },
    { key: 'foamColor', name: 'Foam color', type: 'color', default: 0xffffff },
    { key: 'sssStrength', name: 'Subsurface strength', min: 0, max: 3, step: 0.05, default: 1 },
    { key: 'underwaterColor', name: 'Underwater tint', type: 'color', default: 0x0a3a4a },
  ],
  foam: [
    { key: 'foamStrength', name: 'Foam strength', min: 0, max: 5, step: 0.1, default: 1.2 },
    { key: 'foamThreshold', name: 'Foam threshold', min: 0, max: 2, step: 0.01, default: 0.42 },
    { key: 'foamScale', name: 'Foam scale', min: 0.5, max: 6, step: 0.1, default: 2.2 },
  ],
  sky: [
    { key: 'elevation', name: 'Sun elevation (°)', min: -10, max: 90, step: 0.5, default: 28 },
    { key: 'azimuth', name: 'Sun azimuth (°)', min: 0, max: 360, step: 1, default: 215 },
    { key: 'exposure', name: 'Exposure', min: 0.05, max: 2, step: 0.01, default: 0.55 },
    { key: 'cloudCoverage', name: 'Cloud coverage', min: 0, max: 1, step: 0.01, default: 0.4 },
    { key: 'starsDensity', name: 'Star density', min: 0, max: 3, step: 0.1, default: 1 },
  ],
  atmosphere: [
    { key: 'sprayIntensity', name: 'Spray intensity', min: 0, max: 1.5, step: 0.05, default: 0 },
    { key: 'rainIntensity', name: 'Rain intensity', min: 0, max: 1, step: 0.01, default: 0 },
    { key: 'godRayStrength', name: 'God-ray strength', min: 0, max: 1, step: 0.01, default: 0.22 },
  ],
};

const SCHEMA_FOLDERS = Object.keys(SCHEMA);

/**
 * The full knob vocabulary for a preset, as data. Defaults are pulled from the
 * preset itself (falling back to the schema defaults) so the returned ranges
 * match what an integrator would see if they loaded the preset live.
 *
 * @param {string|object} presetRef  preset id or inline preset
 * @returns {{ preset: string, name: string, waterType: string, folders: Record<string, object[]> }}
 */
export function getSchema(presetRef = DEFAULT_PRESET) {
  const p = resolvePreset(presetRef, { strict: true });
  const folders = {};
  for (const [folder, knobs] of Object.entries(SCHEMA)) {
    folders[folder] = knobs.map((k) => {
      // The preset's own value is the real default for this preset.
      const presetVal = p[k.key];
      const def = presetVal !== undefined ? presetVal : k.default;
      return { ...k, default: def };
    });
  }
  return {
    preset: p.id,
    name: p.name,
    waterType: p.waterType ?? 'ocean',
    folders,
  };
}

// ---- describe(): the agent-facing TEXT menu --------------------------------
// Progressive disclosure, mirroring SeedThree's describe(): the first hit is the
// preset list, then a preset's quick-start + folder index, then one folder's
// dials. Keeps an agent's first contact small.

const fmtKnob = (k) => {
  if (k.type === 'color') return `  ${k.key} — ${k.name}; hex color (default 0x${(k.default ?? 0).toString(16)})`;
  return `  ${k.key} — ${k.name}; ${k.min}..${k.max} step ${k.step} (default ${k.default})`;
};

/**
 * Text menu for agents. Call with no args for the preset list; with a preset
 * key for its quick-start + folder index; with (preset, folder) to open one
 * folder ('spectrum' | 'color' | 'foam' | 'sky' | 'atmosphere').
 *
 * @param {string} [presetRef]
 * @param {string} [folder]
 * @returns {string}
 */
export function describe(presetRef = null, folder = null) {
  if (!presetRef) {
    const rows = listPresets().map((s) => `  ${s.key.padEnd(16)} ${s.name} — ${s.waterType}`);
    return [
      'SeedOcean presets — pick one, then design by SEED first:',
      ...rows,
      '',
      "Quick start:  design({ preset: 'coastal', seed: 1..9999 })",
      'Every seed is a different realization of the preset. The design() call',
      'returns sea-state stats (Hs, peak wavelength/period) + a geometry budget',
      'WITHOUT rendering — so you can size a scene before spending a renderer.',
      '',
      "  describe('<preset>')            → that preset's quick-start + folder index",
      "  describe('<preset>', '<folder>') → open one folder's dials",
    ].join('\n');
  }
  const schema = getSchema(presetRef);
  if (folder) {
    const knobs = schema.folders[folder];
    if (!knobs) return `Unknown folder "${folder}". Folders: ${SCHEMA_FOLDERS.join(', ')}`;
    return [`${schema.name} — ${folder} (${knobs.length} dials):`, ...knobs.map(fmtKnob)].join('\n');
  }
  const counts = Object.entries(schema.folders).map(([n, arr]) => `${n} (${arr.length})`).join(' · ');
  return [
    `${schema.name} — ${schema.waterType}.`,
    '',
    `Quick start:  design({ preset: '${schema.preset}', seed: 1..9999 })`,
    'The SEED re-rolls the FFT noise; iterating it is usually all a scene needs.',
    'Read the returned sea-state stats + triangle budget before tuning dials.',
    '',
    `Closed folders — open with describe('${schema.preset}', '<folder>'):`,
    `  ${counts}`,
  ].join('\n');
}

// ---- design (no GPU) -------------------------------------------------------

/**
 * Build the surface geometry for a preset WITHOUT a renderer, to read its
 * triangle budget. Mirrors the waterType dispatch in fft-ocean.js:19-61 — same
 * mesh selection, same defaults — but passes a null material (we only need the
 * geometry for stats). Kept in sync with fft-ocean.js so the headless budget
 * matches what the live renderer builds.
 */
function buildSurfaceGeometry(preset) {
  const waterType = preset.waterType ?? 'ocean';
  if (waterType === 'pool' || waterType === 'lake') {
    const patchDefaults = waterType === 'lake'
      ? { width: 80, length: 80, cells: 96, shape: 'circle', segments: 96 }
      : { width: 40, length: 40, cells: 64, shape: 'rect' };
    return buildPatchMesh(null, { ...patchDefaults, ...(preset.patch ?? {}) });
  }
  if (waterType === 'river') {
    const river = preset.river ?? {};
    const points = river.points ?? defaultRiverCenterline(river.length ?? 160, river.meander ?? 12);
    return buildRiverMesh(null, {
      points,
      width: river.width ?? 14,
      lengthSegs: river.lengthSegs ?? 128,
      crossSegs: river.crossSegs ?? 16,
    });
  }
  return buildClipmapMesh(null, { patchHalf: 56, levels: 4, cells: 32 });
}

// Sample a terrain heightFn across the preset's basin to report the height
// envelope (waterline ↔ bank-top range). Returns null when the preset has no
// terrain (ocean/pool keep a flat seafloor).
//
// Mirrors the hFn composition in buildTerrain (terrain.js:198-228) EXACTLY —
// same defaults, same basin/channel dispatch — so the headless envelope matches
// what the live mesh would show. If buildTerrain's hFn logic changes, update
// this twin (or better, refactor buildTerrain to export its hFn builder).
function makeTerrainHeightFn(preset, size, seed) {
  const t = preset.terrain ?? {};
  const baseFn = makeFbmHeight({
    seed: seed ?? preset.seed ?? 1,
    amplitude: t.amplitude ?? 8,
    frequency: t.frequency ?? 0.04,
    octaves: t.octaves ?? 4,
  });
  if (t.channel) {
    const river = preset.river ?? {};
    const points = t.points ?? river.points ?? [[-80, 0], [0, 0], [80, 0]];
    return makeRiverChannelHeight(points, {
      width: t.width ?? river.width ?? 14,
      bankHeight: t.bankHeight ?? t.rimHeight ?? 16,
      bankFalloff: t.bankFalloff ?? 50,
      bedDepth: t.basinFloor ?? preset.seafloorDepth ?? -4,
      seed: seed ?? preset.seed ?? 1,
      amplitude: t.amplitude ?? 9,
      frequency: t.frequency ?? 0.03,
      octaves: t.octaves ?? 4,
    });
  }
  if (t.basin) {
    return makeBasinFn(baseFn, {
      size,
      basinRadius: t.basinRadius ?? Math.min(preset.patch?.width ?? 60, preset.patch?.length ?? 60) / 2,
      basinFloor: t.basinFloor ?? (preset.seafloorDepth ?? -6),
      rimHeight: t.rimHeight ?? (t.amplitude ?? 8),
      rimFalloff: t.rimFalloff ?? 1.5,
    });
  }
  return baseFn;
}

function terrainEnvelope(preset) {
  const waterType = preset.waterType ?? 'ocean';
  const t = preset.terrain ?? {};
  if (waterType !== 'lake' && waterType !== 'river') return null;
  // Only meaningful when the preset actually asks for terrain relief.
  if (!(t.basin || t.channel)) return null;
  const size = t.size ?? 400;
  const hFn = makeTerrainHeightFn(preset, size, preset.seed);
  let lo = Infinity, hi = -Infinity, count = 0;
  const samples = 33;
  for (let i = 0; i < samples; i++) {
    for (let j = 0; j < samples; j++) {
      const x = (i / (samples - 1) - 0.5) * size;
      const z = (j / (samples - 1) - 0.5) * size;
      const h = hFn(x, z);
      if (h < lo) lo = h;
      if (h > hi) hi = h;
      count++;
    }
  }
  return { minHeight: +lo.toFixed(2), maxHeight: +hi.toFixed(2), sampleCount: count };
}

/**
 * Design an ocean from a preset + seed + optional control overrides — real
 * JONSWAP params, real surface geometry, closed-form sea-state stats — with no
 * renderer. Use to size a scene (buoyancy samples, camera height, foam budget,
 * terrain envelope) before spending a GPU.
 *
 * @param {object} o
 * @param {string|object} [o.preset='coastal']
 * @param {number} [o.seed]  re-rolls the FFT noise (falls back to preset.seed)
 * @param {object} [o.controls]  partial override of the live state (see getSchema)
 * @param {'perf'|'quality'} [o.quality='perf']  FFT grid (128² vs 256²) — affects
 *        spectrum stats reporting only (no grid is allocated headless)
 * @returns {{
 *   preset: object, state: object, spectrumParams: object,
 *   seaState: import('../core/stats.js').SpectrumStats,
 *   stats: import('../core/stats.js').GeometryStats,
 *   terrain: { minHeight: number, maxHeight: number, sampleCount: number } | null,
 * }}
 */
export function design({ preset = DEFAULT_PRESET, seed, controls = {}, quality = 'perf' } = {}) {
  const base = resolvePreset(preset, { strict: true });
  const baseState = stateFromPreset(base);
  const state = { ...baseState, ...(seed !== undefined ? { seed } : {}), ...controls };
  // Seed must be set: re-rolls FFT noise deterministically.
  if (state.seed === undefined) state.seed = base.seed ?? 1;

  const spectrumParams = buildSpectrumParams(base, state, quality);
  const seaState = spectrumStats(spectrumParams);

  const surface = buildSurfaceGeometry(base);
  const stats = statsOf(surface.root);

  return {
    preset: base,
    state,
    spectrumParams,
    seaState,
    stats,
    terrain: terrainEnvelope(base),
  };
}

// ---- presets (app-compatible seedocean-preset/1) --------------------------

/**
 * Serialize a design to a seedocean-preset/1 JSON object. The live app's Save
 * (once it adopts the format) writes the same shape, so this round-trips.
 * @param {{ preset?: string|object, seed?: number, controls?: object }} o
 */
export function toPreset({ preset = DEFAULT_PRESET, seed, controls = {} } = {}) {
  const base = resolvePreset(preset, { strict: true });
  const state = { ...stateFromPreset(base), ...(seed !== undefined ? { seed } : {}), ...controls };
  // Fold the live tunables back onto the preset so the JSON is self-describing:
  // a consumer can hand it straight to SeedOcean.create({ preset }) without a
  // separate state argument.
  const merged = { ...base, ...state };
  return { format: PRESET_FORMAT, preset: normalizePreset(merged) };
}

/**
 * Parse a seedocean-preset/1 JSON back into { preset, seed, controls }.
 * Accepts legacy presets (no `format`) by normalizing them on ingest.
 * @param {{ format?: string, preset?: object } | object} json
 */
export function fromPreset(json) {
  const wrapped = json?.format === PRESET_FORMAT ? json.preset : json;
  if (!wrapped) throw new Error('[seedocean] fromPreset: no preset object found');
  const preset = normalizePreset(wrapped);
  const { seed, ...controls } = stateFromPreset(preset);
  return { preset, seed: seed ?? 1, controls };
}

// ---- live (needs renderer) -------------------------------------------------

// Late-imported so the design surface stays renderer-free in the bundle graph:
// Node/Deno callers who only import describe()/design() never pull in the
// WebGPU renderer. createOcean() is the only path that touches it.
let _SeedOcean = null;
async function liveClass() {
  if (!_SeedOcean) {
    const mod = await import('../seedocean.js');
    _SeedOcean = mod.SeedOcean;
  }
  return _SeedOcean;
}

/**
 * One-call live ocean for a real scene. Thin wrapper over SeedOcean.create()
 * (the live pipeline) — exposed here so an integrator has ONE entrypoint that
 * hands off to the renderer when a device is available. The design/describe
 * calls above work without a renderer; this one needs one.
 *
 * @param {object} options  same as SeedOcean.create options ({ renderer, scene,
 *   camera, preset, quality, ... }). See seedocean.d.ts SeedOceanOptions.
 * @returns {Promise<import('../seedocean.js').SeedOcean>}
 */
export async function createOcean(options = {}) {
  const SeedOcean = await liveClass();
  return SeedOcean.create(options);
}
