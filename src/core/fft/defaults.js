// Default FFT simulation parameters — presets override slices of this.

export const FFT_DEFAULTS = {
  N: 128,
  cascades: 2,
  lengthScales: [100, 12],
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

/** Merge preset.spectrum overrides onto defaults. */
export function buildSpectrumParams(preset, state) {
  const s = preset.spectrum ?? {};
  const windDir = state.windDirection ?? s.windDirection ?? preset.sky?.azimuth ?? 45;
  const amp = state.waveAmp ?? 1;

  return {
    ...FFT_DEFAULTS,
    seed: state.seed,
    lambda: (s.lambda ?? FFT_DEFAULTS.lambda) * (0.7 + amp * 0.3),
    foamDecay: s.foamDecay ?? FFT_DEFAULTS.foamDecay,
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
    N: s.N ?? FFT_DEFAULTS.N,
  };
}
