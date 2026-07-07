// Default FFT simulation parameters — presets override slices of this.

export const FFT_DEFAULTS = {
  N: 128,
  cascades: 3,
  lengthScales: [200, 20, 3.5],
  boundaryFactor: 6,
  g: 9.81,
  depth: 500,
  lambda: 1.25,
  foamDecay: 0.45,
  timeScale: 1.0,
  foamThreshold: 0.42,
  foamScale: 2.2,
  local: {
    scale: 1.0,
    windSpeed: 12,
    windDirection: 45,
    fetch: 100000,
    spreadBlend: 1.0,
    swell: 0.2,
    peakEnhancement: 3.3,
    shortWavesFade: 0.02,
  },
  swell: {
    scale: 0.75,
    windSpeed: 2.5,
    windDirection: 70,
    fetch: 300000,
    spreadBlend: 1.0,
    swell: 1.0,
    peakEnhancement: 3.3,
    shortWavesFade: 0.01,
  },
};

/**
 * Quality presets. `perf` ships the default 128² grid for broad device coverage;
 * `quality` bumps to 256² (4× the GPU work) to match the wave detail of paid
 * ocean systems on capable hardware. An explicit `spectrum.N` always wins.
 */
export const QUALITY_GRID = { perf: 128, quality: 256 };

/** Merge preset.spectrum overrides onto defaults. `quality` selects the default N. */
export function buildSpectrumParams(preset, state, quality = 'perf') {
  const s = preset.spectrum ?? {};
  const windDir = state.windDirection ?? s.windDirection ?? preset.sky?.azimuth ?? 45;
  const amp = state.waveAmp ?? 1;
  const baseN = QUALITY_GRID[quality] ?? FFT_DEFAULTS.N;
  const N = s.N ?? baseN;
  if (N < 2 || (N & (N - 1)) !== 0) {
    throw new Error(`[seedocean] FFT grid N must be a power of two (got ${N})`);
  }

  return {
    ...FFT_DEFAULTS,
    seed: state.seed,
    lambda: (s.lambda ?? FFT_DEFAULTS.lambda) * (0.7 + amp * 0.3),
    foamDecay: s.foamDecay ?? FFT_DEFAULTS.foamDecay,
    // foamPersistence: live-tunable; 0 = instantaneous foam, 1 = foam holds indefinitely.
    foamPersistence: state.foamPersistence
      ?? s.foamPersistence
      ?? (1 - (s.foamDecay ?? FFT_DEFAULTS.foamDecay)),
    local: {
      ...FFT_DEFAULTS.local,
      ...(s.local ?? {}),
      scale: (s.local?.scale ?? FFT_DEFAULTS.local.scale) * amp,
      windSpeed: (s.local?.windSpeed ?? FFT_DEFAULTS.local.windSpeed) * (state.waveSpeed ?? 1),
      windDirection: windDir,
    },
    swell: { ...FFT_DEFAULTS.swell, ...(s.swell ?? {}) },
    lengthScales: s.lengthScales ?? FFT_DEFAULTS.lengthScales,
    cascades: s.cascades ?? FFT_DEFAULTS.cascades,
    N,
  };
}
