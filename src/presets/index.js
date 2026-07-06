export { calm } from './calm.js';
export { coastal } from './coastal.js';
export { storm } from './storm.js';

import { calm } from './calm.js';
import { coastal } from './coastal.js';
import { storm } from './storm.js';

/** @type {Record<string, typeof calm>} */
export const PRESETS = {
  calm,
  coastal,
  storm,
};

export const DEFAULT_PRESET = 'coastal';

export const PRESET_LIST = Object.values(PRESETS);
