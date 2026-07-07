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
  // Ribbon mesh — gently meandering centerline, ~14m wide, ~200m long.
  river: {
    width: 14,
    length: 200,
    meander: 16,
    lengthSegs: 180,
    crossSegs: 20,
    // Explicit centerline so the terrain channel (below) and the ribbon mesh
    // share an IDENTICAL Catmull-Rom curve — the river bed then sits exactly
    // under the water surface. These are defaultRiverCenterline(200,16).
    points: [[-100, 0], [-75, 12.17], [-50, 15.8], [-25, 8.36], [0, -4.94], [25, -14.78], [50, -14.26], [75, -3.74], [100, 9.4]],
  },
  // Terrain as river banks via channel mode: the heightFn builds its own
  // Catmull-Rom curve from river.points (the terrain.points fallback reads
  // preset.river.points), so the bed sits directly under the ribbon and banks
  // rise steeply on each side into a gorge.
  terrain: {
    size: 700,
    resolution: 240,
    channel: true,
    width: 14,              // matches river.width so banks meet the ribbon edges
    bankHeight: 20,         // gorge walls rise well above the camera
    bankFalloff: 60,        // steep climb then plateau into forested hills
    basinFloor: -4,         // river-bed depth
    amplitude: 10,
    frequency: 0.03,
    octaves: 5,
  },
  // Gorge fog: dense + earthy so the terrain edge (~350m) hides in haze and
  // there's no ocean horizon. The river reads as enclosed by valley walls.
  fog: { color: 0x8a9484, density: 0.0035 },
  scene: { sky: false, cameraFar: 650 },
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
  // Higher exposure than ocean presets: with the sky dome hidden the scene
  // loses ambient skylight, so we push exposure up to compensate.
  sky: { elevation: 42, azimuth: 75, exposure: 1.3, turbidity: 5, cloudCoverage: 0.14, starsDensity: 0 },
  spectrum: {
    lambda: 0.7,
    local: { windSpeed: 1.8, scale: 0.18, swell: 0.04 },
    swell: { windSpeed: 0.8, scale: 0.12 },
  },
};
