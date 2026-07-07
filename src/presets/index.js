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
 * @type {Record<string, typeof calm>}
 */
export const PRESETS = {
  calm,
  dawn,
  mist,
  breeze,
  coastal,
  swell,
  tropical,
  sunset,
  moonlit,
  arctic,
  bioluminescent,
  cartoon,
  ink,
  pool,
  lake,
  river,
  gale,
  storm,
  tempest,
};

export const DEFAULT_PRESET = 'coastal';

export const PRESET_LIST = Object.values(PRESETS);
