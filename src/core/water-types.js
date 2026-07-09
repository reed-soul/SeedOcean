// Water-type taxonomy — single source of truth for mesh / enclosure / flowmap
// dispatch. Prefer these helpers over scattering `=== 'lake' || === 'river'`
// across seedocean.js / fft-ocean.js / flow-map.js / api.

/** @typedef {'ocean' | 'pool' | 'lake' | 'river' | 'coast'} WaterType */

export const WATER = /** @type {const} */ ({
  OCEAN: 'ocean',
  POOL: 'pool',
  LAKE: 'lake',
  RIVER: 'river',
  COAST: 'coast',
});

/** @param {{ waterType?: string } | null | undefined} preset */
export function waterTypeOf(preset) {
  return /** @type {WaterType} */ (preset?.waterType ?? WATER.OCEAN);
}

/** Lake basin / river channel / coastal beach — displaced terrain seafloor. */
export function usesTerrain(type) {
  return type === WATER.LAKE || type === WATER.RIVER || type === WATER.COAST;
}

/**
 * Fully enclosed scenes (no ocean horizon): hide sky dome, tighten far plane,
 * skip open-water demo boat/crates. Coast stays open — beach + sea + sky.
 */
export function isEnclosed(type) {
  return type === WATER.POOL || type === WATER.LAKE || type === WATER.RIVER;
}

/** Auto-build a FlowMap when the preset omits an explicit flowmap block. */
export function usesFlowMapAuto(type) {
  return type === WATER.LAKE || type === WATER.RIVER || type === WATER.COAST;
}

/** Finite patch mesh (pool rect / lake disc). River uses a ribbon; coast uses clipmap. */
export function usesPatchMesh(type) {
  return type === WATER.POOL || type === WATER.LAKE;
}
