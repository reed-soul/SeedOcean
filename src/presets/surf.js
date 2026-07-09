// Coastal Surf — open ocean meeting a sloping beach. Clipmap water + beach
// terrain that crosses the waterline, with FlowMap-driven white-water break
// and onshore rush. Completes Issue #10 / Phase 11c.

export const surf = {
  id: 'surf',
  name: 'Coastal Surf',
  description: 'Near-shore breaking waves and white water on a sloping beach — tidal foam band with onshore rush.',
  waterType: 'coast',
  // Beach terrain: ocean in −Z, dunes in +Z, waterline near z=0 with mild cove warp.
  terrain: {
    size: 480,
    resolution: 220,
    beach: true,
    shoreZ: 12,
    slope: 0.14,
    oceanFloor: -28,
    duneHeight: 9,
    duneRun: 50,
    shoreNoise: 6,
    amplitude: 1.6,
    frequency: 0.02,
    octaves: 4,
  },
  // Keep the sky — coast is open water meeting land, not an enclosed basin.
  scene: { sky: true, cameraFar: 2500 },
  fog: { color: 0x8aa4b0, density: 0.0012 },
  // Mild onshore current; FlowMap.B scales this into the surf zone rush.
  flow: { dir: [0, 1], speed: 1.6 },
  flowmap: {
    size: 256,
    worldExtent: 240,
    flowStrength: 1,
    shore: { bandWidth: 2.4, foamStrength: 1.05 },
    surf: {
      // Narrow break: peak ~2.5 m depth, fall off over ~9 m of depth range.
      breakDepth: 2.5,
      breakWidth: 9,
      foamStrength: 1.25,
      rushSpeed: 0.95,
    },
  },
  seed: 88,
  waveAmp: 1.05,
  waveSpeed: 1.05,
  windDirection: 200,
  // Clear coastal teal — shallower read than open-ocean coastal chop.
  waterColor: 0x1a7a8c,
  deepColor: 0x0a3a4a,
  scatterColor: 0x4ec4c0,
  foamColor: 0xf2f8ff,
  foamStrength: 0.55,
  sssStrength: 1.05,
  foamThreshold: 0.34,
  foamScale: 2.6,
  foamPersistence: 0.62,
  roughness: 0.08,
  metalness: 0.12,
  refractionStrength: 0.7,
  reflectionStrength: 0.5,
  refractionDistort: 0.042,
  reflectDistort: 0.02,
  underwaterColor: 0x0a4a58,
  godRayStrength: 0.28,
  seafloorColor: 0xc2b280,
  causticColor: 0x9fd6c8,
  causticStrength: 0.7,
  seafloorDepth: -24,
  sprayIntensity: 0.35,
  sky: {
    elevation: 22,
    azimuth: 200,
    exposure: 0.42,
    turbidity: 6,
    cloudCoverage: 0.28,
    starsDensity: 0,
  },
  spectrum: {
    lambda: 1.15,
    // Fetch-limited coastal wind-sea — energetic enough to break in the shallows.
    local: { windSpeed: 11, scale: 0.95, swell: 0.18, fetch: 80000 },
    swell: { windSpeed: 3.5, scale: 0.55 },
  },
};
