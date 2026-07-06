export { calm } from './calm.js';
export { dawn } from './dawn.js';
export { mist } from './mist.js';
export { breeze } from './breeze.js';
export { coastal } from './coastal.js';
export { swell } from './swell.js';
export { sunset } from './sunset.js';
export { gale } from './gale.js';
export { storm } from './storm.js';
export { tempest } from './tempest.js';

import { calm } from './calm.js';
import { dawn } from './dawn.js';
import { mist } from './mist.js';
import { breeze } from './breeze.js';
import { coastal } from './coastal.js';
import { swell } from './swell.js';
import { sunset } from './sunset.js';
import { gale } from './gale.js';
import { storm } from './storm.js';
import { tempest } from './tempest.js';

/**
 * Preset registry — ordered calm → storm so the GUI dropdown reads as a sea-state ramp.
 * @type {Record<string, typeof calm>}
 */
export const PRESETS = {
  calm,
  dawn,
  mist,
  breeze,
  coastal,
  swell,
  sunset,
  gale,
  storm,
  tempest,
};

export const DEFAULT_PRESET = 'coastal';

export const PRESET_LIST = Object.values(PRESETS);
