/** Live tuning state derived from a preset — decoupled from lil-gui. */
export function stateFromPreset(preset) {
  return {
    presetId: preset.id,
    seed: preset.seed,
    waveAmp: preset.waveAmp,
    waveSpeed: preset.waveSpeed,
    windDirection: preset.windDirection ?? preset.sky?.azimuth ?? 45,
    waterColor: preset.waterColor,
    deepColor: preset.deepColor,
    sssStrength: preset.sssStrength ?? 0.85,
    foamStrength: preset.foamStrength,
    foamPersistence: preset.foamPersistence ?? (1 - (preset.spectrum?.foamDecay ?? 0.45)),
    roughness: preset.roughness,
    refractionStrength: preset.refractionStrength ?? 0.72,
    reflectionStrength: preset.reflectionStrength ?? 0.55,
    godRayStrength: preset.godRayStrength ?? 0.22,
    elevation: preset.sky.elevation,
    azimuth: preset.sky.azimuth,
    exposure: preset.sky.exposure,
    starsDensity: preset.sky.starsDensity ?? 1,
    cloudCoverage: preset.sky.cloudCoverage,
  };
}
