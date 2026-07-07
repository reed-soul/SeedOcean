// Headless introspection utilities — pure CPU, no renderer dependency.
//
// Two halves:
//   • statsOf(object3D) — geometry budget from a built THREE.Object3D (the ocean
//     root, a clipmap, a patch, a river ribbon). Mirrors SeedThree's statsOf().
//   • spectrumStats(spectrumParams) — closed-form sea-state estimates (peak
//     wavelength / significant wave height / peak period) from JONSWAP params.
//
// Both are used by the headless Design API (src/api/seedocean.js design()) so a
// scene composer can reason about an ocean BEFORE spending a renderer on it.

/**
 * Per-mesh + summary geometry stats for a THREE.Object3D.
 *
 * Walks every descendant Mesh. Triangle count is `index.count/3` for indexed
 * geometry, else `position.count/3` (non-indexed). InstancedMesh contributes
 * `geometry tris × count`. Returns rounded integers; verts are non-instanced
 * vertex counts (the raw buffer size, NOT multiplied by instance count — that's
 * the GPU upload cost, which is what a budget call wants).
 *
 * @param {import('three/webgpu').Object3D} object
 * @returns {{
 *   meshes: number,
 *   instances: number,
 *   triangles: number,
 *   verts: number,
 * }}
 */
export function statsOf(object) {
  let meshes = 0;
  let instances = 0;
  let triangles = 0;
  let verts = 0;
  if (!object) return { meshes, instances, triangles, verts };
  object.traverse((o) => {
    if (!o.isMesh || !o.geometry) return;
    meshes++;
    const geo = o.geometry;
    const triCount = geo.index
      ? geo.index.count / 3
      : geo.attributes.position.count / 3;
    const inst = o.isInstancedMesh ? o.count : 1;
    if (o.isInstancedMesh) instances += o.count;
    triangles += triCount * inst;
    verts += geo.attributes.position.count;
  });
  return { meshes, instances, triangles: Math.round(triangles), verts };
}

// ---- sea-state estimates from JONSWAP params -------------------------------

// Deep-water JONSWAP significant-wave-height enhancement factor as a function of
// the peak-enhancement γ. Closed-form integral of the standard JONSWAP spectrum
// (Carter 1982 approximation): f(γ) = 1 - 0.287·ln(γ). Valid for deep water;
// the TMA shallow-water depth correction would multiply this, but SeedOcean's
// default depth=500 is effectively deep so we don't apply it. ⚠️ medium
// confidence — this is the textbook approximation, ±15% vs the GPU-realized Hs
// because of cascade band-splitting + discrete sampling. Good enough for
// design-time estimates, not a runtime measurement.
function jonswapHeightFactor(gamma) {
  return 1 - 0.287 * Math.log(Math.max(1, gamma));
}

/**
 * Estimate sea-state parameters from a single JONSWAP band (wind-sea `local` or
 * long-period `swell`). Pure JS twin of the closed-form half of
 * `src/core/fft/spectrum.js` `fillSet` — it re-derives `alpha`/`peakOmega` from
 * {windSpeed, fetch, peakEnhancement} and inverts the deep-water dispersion
 * relation to get peak wavelength / period, then estimates Hs via the standard
 * JONSWAP integral. Does NOT touch TSL or the renderer.
 *
 * @param {{ windSpeed?: number, fetch?: number, peakEnhancement?: number, scale?: number }} band
 * @param {number} [g=9.81]  gravitational acceleration
 * @returns {{
 *   peakWavelength: number, // metres (λ_p = 2π/k_p, deep water)
 *   peakPeriod: number,     // seconds (T_p = 2π/ω_p)
 *   significantHeight: number, // metres (Hs ≈ 4·sqrt(m0))
 *   alpha: number,          // Phillips constant
 *   peakOmega: number,      // rad/s
 * }}
 */
export function bandStats(band, g = 9.81) {
  const windSpeed = band?.windSpeed ?? 12;
  const fetch = band?.fetch ?? 100000;
  const gamma = band?.peakEnhancement ?? 3.3;
  const scale = band?.scale ?? 1;

  // fillSet twins (spectrum.js:91-92) — closed form, no GPU.
  const alpha = 0.076 * Math.pow((g * fetch) / (windSpeed * windSpeed), -0.22);
  const peakOmega = 22 * Math.pow((windSpeed * fetch) / (g * g), -0.33);

  // Deep-water dispersion: ω² = g·k  →  k_p = ω_p²/g.
  const peakK = (peakOmega * peakOmega) / g;
  const peakWavelength = (2 * Math.PI) / peakK;
  const peakPeriod = (2 * Math.PI) / peakOmega;

  // Zeroth spectral moment m0 ≈ (alpha·g²/ω_p⁴)·f(γ); Hs = 4·sqrt(m0). The band
  // amplitude `scale` multiplies through (matches buildSpectrumParams scaling).
  const m0 = ((alpha * g * g) / Math.pow(peakOmega, 4)) * jonswapHeightFactor(gamma);
  const significantHeight = scale * 4 * Math.sqrt(m0);

  return {
    peakWavelength,
    peakPeriod,
    significantHeight,
    alpha,
    peakOmega,
  };
}

/**
 * Sea-state estimate from a full spectrumParams object (the output of
 * `buildSpectrumParams`). Combines `local` (wind-sea) + `swell` bands — the
 * realized wave field is their linear superposition, so Hs combines in
 * quadrature (variances add) and peak wavelength takes the longer-period band.
 *
 * Used by the headless Design API to give a scene composer a physical read on a
 * preset without rendering it: "10 m/s wind → ~2-4 m seas, 8 s peak period,
 * 80 m dominant wavelength" lets them size buoyancy samples, camera height, and
 * foam budget before spending a renderer.
 *
 * @param {{ local?: any, swell?: any, g?: number, depth?: number, lengthScales?: number[], cascades?: number, N?: number }} params
 * @returns {{
 *   local: object,
 *   swell: object,
 *   significantHeight: number,  // combined Hs (quadrature sum)
 *   dominantPeakWavelength: number, // longer of local/swell
 *   dominantPeakPeriod: number,
 *   depth: number,
 *   cascades: number,
 *   gridN: number,
 *   lengthScales: number[],
 * }}
 */
export function spectrumStats(params) {
  const g = params?.g ?? 9.81;
  const local = bandStats(params?.local ?? {}, g);
  const swell = bandStats(params?.swell ?? {}, g);

  // Variances add → Hs²_local + Hs²_swell → Hs_combined.
  const significantHeight = Math.sqrt(
    local.significantHeight * local.significantHeight +
      swell.significantHeight * swell.significantHeight,
  );

  // Dominant band = longer peak wavelength (lower frequency).
  const localDominates = local.peakWavelength >= swell.peakWavelength;
  const dominant = localDominates ? local : swell;

  return {
    local,
    swell,
    significantHeight,
    dominantPeakWavelength: dominant.peakWavelength,
    dominantPeakPeriod: dominant.peakPeriod,
    depth: params?.depth ?? 500,
    cascades: params?.cascades ?? 3,
    gridN: params?.N ?? 128,
    lengthScales: params?.lengthScales ?? [200, 20, 3.5],
  };
}
