import { PRESETS, DEFAULT_PRESET, normalizePreset } from './index.js';

/**
 * Resolve a preset id or inline object to a normalized preset.
 * @param {string|object} [ref]
 * @param {{ strict?: boolean }} [opts] — strict throws on unknown ids (API tier)
 */
export function resolvePreset(ref, { strict = false } = {}) {
  if (!ref) return PRESETS[DEFAULT_PRESET];
  if (typeof ref === 'string') {
    const p = PRESETS[ref];
    if (!p) {
      const known = Object.keys(PRESETS).join(', ');
      if (strict) {
        throw new Error(`[seedocean] unknown preset "${ref}". Known: ${known}`);
      }
      console.warn(
        `[seedocean] unknown preset "${ref}", falling back to "${DEFAULT_PRESET}". Known: ${known}`,
      );
      return PRESETS[DEFAULT_PRESET];
    }
    return p;
  }
  return normalizePreset(ref);
}
