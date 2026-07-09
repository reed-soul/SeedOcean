// Mountain Lake — bounded circular water patch sitting in a procedural terrain
// basin. Reuses the FFT patch mesh (Stage 4) for the surface and the fBm terrain
// (Stage 5) for the lake bed + surrounding hills. Low wind, deep green water.

export const lake = {
  id: 'lake',
  name: 'Mountain Lake',
  description: 'Still mountain lake ringed by procedural hills — bounded circular water over a terrain basin.',
  waterType: 'lake',
  patch: { width: 80, length: 80, cells: 96, shape: 'circle', segments: 96 },
  // Wet-shore foam ring at the disc edge (seedocean-flowmap/1). Lake has no
  // directional flow — only the A channel (shore) is populated.
  flowmap: {
    size: 256,
    shore: { bandWidth: 4.5, foamStrength: 0.85 },
  },
  terrain: {
    size: 800,
    resolution: 220,
    amplitude: 11,
    frequency: 0.028,
    octaves: 5,
    basin: true,
    basinRadius: 40,        // matches the patch radius so water laps the shore
    basinFloor: -6,         // lake-bed depth, meters below water
    rimHeight: 22,          // surrounding hills rise well above the water
    rimFalloff: 1.2,        // steep rise → reads as a mountain valley
  },
  // Valley fog: dense + cool-tinted so the terrain edge (~400m) hides in haze
  // and there's no ocean horizon. The lake reads as enclosed by mountains.
  fog: { color: 0x9aa6b0, density: 0.0032 },
  scene: { sky: false, cameraFar: 650 },
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
  // Higher exposure than ocean presets: with the sky dome hidden the scene
  // loses ambient skylight, so we push exposure up to compensate.
  sky: { elevation: 42, azimuth: 70, exposure: 1.3, turbidity: 4, cloudCoverage: 0.1, starsDensity: 0 },
  spectrum: {
    lambda: 0.7,
    local: { windSpeed: 2.2, scale: 0.22, swell: 0.06 },
    swell: { windSpeed: 1.0, scale: 0.14 },
  },
};
