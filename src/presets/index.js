export { calm } from './calm.js';
export { dawn } from './dawn.js';
export { mist } from './mist.js';
export { breeze } from './breeze.js';
export { coastal } from './coastal.js';
export { swell } from './swell.js';
export { tropical } from './tropical.js';
export { sunset } from './sunset.js';
export { moonlit } from './moonlit.js';
export { arctic } from './arctic.js';
export { bioluminescent } from './bioluminescent.js';
export { cartoon } from './cartoon.js';
export { ink } from './ink.js';
export { pool } from './pool.js';
export { lake } from './lake.js';
export { river } from './river.js';
export { gale } from './gale.js';
export { storm } from './storm.js';
export { tempest } from './tempest.js';

/** Schema version stamped onto every preset by `normalizePreset`.
 * The headless API (SeedOceanAPI.toPreset / fromPreset) tags its serialized JSON
 * with this; legacy preset data files omit it, so normalize fills it in to keep
 * the data files clean while making the round-trip format explicit. */
export const PRESET_FORMAT = 'seedocean-preset/1';

/**
 * Stamp the schema version onto a preset (immutably). Presets that already carry
 * a `format` are returned as-is; legacy presets get `format: PRESET_FORMAT`.
 * Use at registry construction and at headless `fromPreset` ingest.
 * @param {object} preset
 * @returns {object} a shallow clone with format set
 */
export function normalizePreset(preset) {
  if (!preset || typeof preset !== 'object') return preset;
  if (preset.format === PRESET_FORMAT) return preset;
  return { format: PRESET_FORMAT, ...preset };
}

import { calm } from './calm.js';
import { dawn } from './dawn.js';
import { mist } from './mist.js';
import { breeze } from './breeze.js';
import { coastal } from './coastal.js';
import { swell } from './swell.js';
import { tropical } from './tropical.js';
import { sunset } from './sunset.js';
import { moonlit } from './moonlit.js';
import { arctic } from './arctic.js';
import { bioluminescent } from './bioluminescent.js';
import { cartoon } from './cartoon.js';
import { ink } from './ink.js';
import { pool } from './pool.js';
import { lake } from './lake.js';
import { river } from './river.js';
import { gale } from './gale.js';
import { storm } from './storm.js';
import { tempest } from './tempest.js';

/**
 * Preset registry — ordered as a narrative: calm morning → temperate → tropical
 * → night → polar → bioluminescent → stylized → bounded (pool) → rising storm.
 * Every entry is normalized with the current PRESET_FORMAT so `PRESETS[id].format`
 * is always defined, even though the data files stay clean (no per-file `format`).
 * @type {Record<string, typeof calm>}
 */
export const PRESETS = {
  calm: normalizePreset(calm),
  dawn: normalizePreset(dawn),
  mist: normalizePreset(mist),
  breeze: normalizePreset(breeze),
  coastal: normalizePreset(coastal),
  swell: normalizePreset(swell),
  tropical: normalizePreset(tropical),
  sunset: normalizePreset(sunset),
  moonlit: normalizePreset(moonlit),
  arctic: normalizePreset(arctic),
  bioluminescent: normalizePreset(bioluminescent),
  cartoon: normalizePreset(cartoon),
  ink: normalizePreset(ink),
  pool: normalizePreset(pool),
  lake: normalizePreset(lake),
  river: normalizePreset(river),
  gale: normalizePreset(gale),
  storm: normalizePreset(storm),
  tempest: normalizePreset(tempest),
};

export const DEFAULT_PRESET = 'coastal';

export const PRESET_LIST = Object.values(PRESETS);
