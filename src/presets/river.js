// River — a meandering bounded-water ribbon over a procedural terrain channel.
// Combines Stage 5 (terrain as banks), Stage 7a (flow-scroll shader), Stage 7b
// (Catmull-Rom ribbon mesh), and Stage 7c (current force on buoyancy bodies).

export const river = {
  id: 'river',
  name: 'River',
  description: 'Meandering river with directional flow — buoyant objects drift downstream over a procedural channel.',
  waterType: 'river',
  // Directional flow: dir is XZ (here mostly +X with a touch of +Z), speed in m/s.
  // The surface shader scrolls FFT cascade UVs by flowDir*flowSpeed*time so waves
  // appear to move with the current; buoyancy bodies are pushed downstream by
  // BuoyancySystem.current.
  flow: { dir: [1, 0.25], speed: 2.5 },
  // Ribbon mesh — gently meandering centerline, ~14m wide, ~160m long.
  river: {
    width: 14,
    length: 180,
    meander: 14,
    lengthSegs: 160,
    crossSegs: 20,
  },
  // Terrain as river banks. Basin mode carves a channel: deep in the ribbon's
  // path, rising to hills on either side. We size the basin to roughly the
  // ribbon width so the water meets the banks.
  terrain: {
    size: 400,
    resolution: 180,
    amplitude: 7,
    frequency: 0.045,
    octaves: 4,
    basin: true,
    basinRadius: 9,         // ~half the ribbon width
    basinFloor: -4,         // river-bed depth
    rimHeight: 9,           // banks rise above the water
    rimFalloff: 2.0,
  },
  seed: 707,
  waveAmp: 0.12,
  waveSpeed: 0.45,
  windDirection: 75,
  // Murky river water — brown-green from sediment.
  waterColor: 0x4a5a38,
  deepColor: 0x1a2410,
  scatterColor: 0x8a9a5a,
  foamColor: 0xf0eed8,
  foamStrength: 0.14,
  sssStrength: 0.45,
  foamThreshold: 0.55,
  foamScale: 1.5,
  roughness: 0.08,
  metalness: 0.12,
  refractionStrength: 0.6,
  reflectionStrength: 0.5,
  refractionDistort: 0.05,
  reflectDistort: 0.022,
  underwaterColor: 0x1f2a14,
  godRayStrength: 0.22,
  seafloorColor: 0x3a3220,
  causticColor: 0xb0c084,
  causticStrength: 0.35,
  seafloorDepth: -4,
  sky: { elevation: 32, azimuth: 75, exposure: 0.46, turbidity: 6, cloudCoverage: 0.22, starsDensity: 0 },
  spectrum: {
    lambda: 0.7,
    local: { windSpeed: 1.8, scale: 0.18, swell: 0.04 },
    swell: { windSpeed: 0.8, scale: 0.12 },
  },
};
