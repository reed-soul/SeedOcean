// Mountain Lake — bounded circular water patch sitting in a procedural terrain
// basin. Reuses the FFT patch mesh (Stage 4) for the surface and the fBm terrain
// (Stage 5) for the lake bed + surrounding hills. Low wind, deep green water.

export const lake = {
  id: 'lake',
  name: 'Mountain Lake',
  description: 'Still mountain lake ringed by procedural hills — bounded circular water over a terrain basin.',
  waterType: 'lake',
  patch: { width: 80, length: 80, cells: 96, shape: 'circle', segments: 96 },
  terrain: {
    size: 400,
    resolution: 160,
    amplitude: 9,
    frequency: 0.035,
    octaves: 4,
    basin: true,
    basinRadius: 38,        // slightly inside patch radius (40) so water laps the shore
    basinFloor: -6,         // lake-bed depth, meters below water
    rimHeight: 12,          // surrounding hills rise above the water
    rimFalloff: 1.5,
  },
  seed: 4242,
  waveAmp: 0.18,
  waveSpeed: 0.35,
  windDirection: 60,
  // Deep emerald mountain-lake water.
  waterColor: 0x2e5a3a,
  deepColor: 0x0c2418,
  scatterColor: 0x4f8a5a,
  foamColor: 0xeaf4ee,
  foamStrength: 0.08,
  sssStrength: 0.7,
  foamThreshold: 0.6,
  foamScale: 1.4,
  roughness: 0.06,
  metalness: 0.18,
  refractionStrength: 0.78,
  reflectionStrength: 0.62,
  refractionDistort: 0.04,
  reflectDistort: 0.02,
  underwaterColor: 0x123022,
  godRayStrength: 0.28,
  // Earthy lake bed + soft caustics (lower than ocean — lake water is darker).
  seafloorColor: 0x3a3324,
  causticColor: 0x9fd6a4,
  causticStrength: 0.45,
  seafloorDepth: -6,
  sky: { elevation: 30, azimuth: 70, exposure: 0.42, turbidity: 5, cloudCoverage: 0.18, starsDensity: 0 },
  spectrum: {
    lambda: 0.7,
    local: { windSpeed: 2.2, scale: 0.22, swell: 0.06 },
    swell: { windSpeed: 1.0, scale: 0.14 },
  },
};
