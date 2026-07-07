// Type declarations for SeedOcean — hand-written to keep the surface precise
// and avoid shipping generated noise. Mirrors src/index.js exports.

import type * as THREE from 'three';

/** Quality tier: selects the FFT simulation grid size. */
export type Quality = 'perf' | 'quality';

/** Preset id or an inline preset object. */
export type PresetRef = string | Preset;

/** Sky / sun parameters. */
export interface SkyParams {
  elevation: number;
  azimuth: number;
  exposure: number;
  turbidity?: number;
  cloudCoverage: number;
  starsDensity?: number;
}

/** One band of the JONSWAP spectrum (wind-sea `local` or long-period `swell`). */
export interface SpectrumBand {
  scale?: number;
  windSpeed?: number;
  windDirection?: number;
  fetch?: number;
  spreadBlend?: number;
  swell?: number;
  peakEnhancement?: number;
  shortWavesFade?: number;
}

export interface SpectrumParams {
  lambda?: number;
  foamDecay?: number;
  /** 0 = instantaneous foam, 1 = foam holds indefinitely. */
  foamPersistence?: number;
  lengthScales?: number[];
  cascades?: number;
  N?: number;
  local?: SpectrumBand;
  swell?: SpectrumBand;
}

/** Schema version tag for serialized presets (`seedocean-preset/1`).
 * Lets headless round-trip (SeedOceanAPI.toPreset/fromPreset) and future
 * migrations tag their on-disk format. Absent on legacy presets → normalizePreset
 * fills it in, so existing data files stay clean. */
export type PresetFormat = 'seedocean-preset/1';

/** Current preset schema version (the only legal value of Preset.format today). */
export const PRESET_FORMAT: PresetFormat;

/** A named sea state + look. Calm / storm / etc. are instances of this. */
export interface Preset {
  /** Schema version. Optional — normalizePreset fills it in. */
  format?: PresetFormat;
  id: string;
  name: string;
  description?: string;
  seed: number;
  waveAmp: number;
  waveSpeed: number;
  windDirection: number;
  waterColor: number;
  deepColor: number;
  scatterColor: number;
  foamColor: number;
  foamStrength: number;
  foamThreshold?: number;
  foamScale?: number;
  foamPersistence?: number;
  sssStrength: number;
  roughness: number;
  metalness?: number;
  refractionStrength?: number;
  reflectionStrength?: number;
  refractionDistort?: number;
  reflectDistort?: number;
  wakeHeight?: number;
  wakeFoam?: number;
  underwaterColor: number;
  godRayStrength: number;
  seafloorColor?: number;
  causticColor?: number;
  causticStrength?: number;
  seafloorDepth?: number;
  sky: SkyParams;
  spectrum?: SpectrumParams;
  /** Future-proofing for stages not yet on every preset. */
  rainIntensity?: number;
  sprayIntensity?: number;
  /** Water mesh type — selects clipmap vs bounded patch vs terrain basin. */
  waterType?: 'ocean' | 'pool' | 'lake' | 'river';
  /** Bounded-water patch dimensions (pool/lake). */
  patch?: { width: number; length: number; cells: number; shape?: 'rect' | 'circle'; segments?: number };
  /** Terrain basin config (lake/river) — passed to buildTerrain. */
  terrain?: {
    size?: number;
    resolution?: number;
    amplitude?: number;
    frequency?: number;
    octaves?: number;
    basin?: boolean;
    basinRadius?: number;
    basinFloor?: number;
    rimHeight?: number;
    rimFalloff?: number;
    /** River channel mode: bed along centerline + rising banks (overrides basin). */
    channel?: boolean;
    width?: number;
    bankHeight?: number;
    bankFalloff?: number;
    points?: number[][];
  };
  /** Pool enclosure config (deck/walls/floor colors + dimensions). */
  pool?: {
    deckWidth?: number;
    wallHeight?: number;
    tileColor?: number;
    deckColor?: number;
    wallColor?: number;
    groutColor?: number;
  };
  /** Per-preset above-water fog (bounded water enclosures). */
  fog?: { color: number; density: number };
  /** Scene-level switches (sky visibility, camera far plane). */
  scene?: { sky?: boolean; cameraFar?: number };
  /** River flow direction (XZ) and speed (m/s) — drives flow-scroll shader + buoyancy current. */
  flow?: { dir: [number, number]; speed: number };
  /** River ribbon mesh config (Catmull-Rom centerline + width). */
  river?: {
    points?: number[][];
    width?: number;
    length?: number;
    meander?: number;
    lengthSegs?: number;
    crossSegs?: number;
    closed?: boolean;
  };
  /** Stylized render mode (cartoon / ink wash). */
  renderMode?: 'stylized';
  celBands?: number;
  starsDensity?: number;
}

/** Live-tunable subset of a preset (mirrors `stateFromPreset`). */
export interface OceanState {
  presetId: string;
  seed: number;
  waveAmp: number;
  waveSpeed: number;
  windDirection: number;
  waterColor: number;
  deepColor: number;
  sssStrength: number;
  foamStrength: number;
  foamPersistence: number;
  roughness: number;
  refractionStrength: number;
  reflectionStrength: number;
  godRayStrength: number;
  elevation: number;
  azimuth: number;
  exposure: number;
  cloudCoverage: number;
  starsDensity: number;
}

export interface SeedOceanOptions {
  container?: HTMLElement;
  renderer?: THREE.WebGPURenderer;
  scene?: THREE.Scene;
  camera?: THREE.PerspectiveCamera;
  preset?: PresetRef;
  state?: Partial<OceanState>;
  environment?: boolean;
  seafloor?: boolean;
  underwater?: boolean;
  buoyancy?: boolean;
  demoObjects?: boolean;
  validateFFT?: boolean;
  fftGrid?: number;
  quality?: Quality;
}

/** Result of {@link validateFFT}. */
export interface FFTTestResult {
  pass: boolean;
  err1: number;
  err2: number;
}

/** Per-frame diagnostics returned by {@link SeedOcean.update} / {@link SeedOcean.tick}. */
export interface FrameInfo {
  t: number;
  dt: number;
  underwaterMix: number;
}

/**
 * Top-level entry point. `await SeedOcean.create(opts)` builds the ocean and
 * optional seafloor, underwater post, buoyancy system, and demo objects.
 */
export declare class SeedOcean {
  static create(options?: SeedOceanOptions): Promise<SeedOcean>;
  constructor(options?: SeedOceanOptions);

  readonly version: string;
  readonly quality: Quality;
  /** True when the WebGPU backend is active; false on the WebGL2/Gerstner fallback. */
  readonly isWebGPU: boolean;
  readonly clock: THREE.Clock;
  readonly sunDir: THREE.Vector3;
  readonly renderer: THREE.WebGPURenderer;
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
  readonly preset: Preset;
  readonly state: OceanState;
  readonly ocean: FFTOceanHandle;
  readonly env?: EnvironmentHandle;
  readonly seafloor?: SeafloorHandle | TerrainHandle;
  readonly buoyancy?: BuoyancySampler;
  readonly buoyancySystem?: BuoyancySystem;
  readonly underwater?: UnderwaterHandle;
  readonly atmosphere?: AtmosphereHandle;
  readonly boat?: THREE.Object3D;
  readonly buoy?: THREE.Mesh;
  readonly crates?: THREE.Mesh[];
  readonly fftTest?: FFTTestResult;

  applyPreset(preset: PresetRef, nextState?: Partial<OceanState>): Promise<void>;
  applyLiveTuning(): void;
  syncSky(): void;
  update(dt?: number): FrameInfo;
  render(): void;
  tick(): FrameInfo;
  resize(width: number, height: number): void;
  exportGLB(filename?: string): Promise<void>;
  dispose(): void;
}

export interface FFTOceanHandle {
  root: THREE.Object3D;
  mesh: THREE.Mesh;
  clipmap: { root: THREE.Object3D; snap: number; extent: number; update: (camera: THREE.Camera) => void };
  simulator: {
    N: number;
    cascades: OceanCascade[];
    foamPersistence: { value: number };
    evolve: (t: number, dt?: number) => void;
    setSeed: (seed: number) => void;
    applyParams: (params: SpectrumParams & Record<string, unknown>) => void;
    updateInitialSpectrum: () => Promise<void>;
  };
  shading: Record<string, THREE.IUniform | { value: unknown }>;
  wakeField: WakeField;
  spectrumParams: SpectrumParams & Record<string, unknown>;
  applyPreset: (preset: Preset, state: OceanState) => Promise<void>;
  applyLiveTuning: (preset: Preset, state: OceanState) => void;
  setSunDirection: (dir: THREE.Vector3) => void;
  setUnderwaterMix: (mix: number) => void;
  evolve: (t: number, dt: number, timeScale?: number) => void;
  updateClipmap: (camera: THREE.Camera) => void;
  stampWake: (x: number, z: number, vx: number, vz: number, radius?: number, strength?: number) => void;
}

export interface OceanCascade {
  N: number;
  lengthScale: number;
  displacement: THREE.Texture;
  derivatives: THREE.Texture;
  foam: THREE.Texture;
}

export interface EnvironmentHandle {
  sky: THREE.Object3D;
  sunLight: THREE.DirectionalLight;
  hemi: THREE.HemisphereLight;
  skyState: SkyParams & { cloudCoverage: number };
  updateSun: (scene: THREE.Scene) => THREE.Vector3;
  applyPreset: (preset: Preset) => void;
  dispose: () => void;
}

export interface SeafloorHandle {
  mesh: THREE.Mesh;
  updateUnderwater: (mix: number) => void;
}

/** Displaced terrain basin returned by {@link buildTerrain} (lake/river). */
export interface TerrainHandle extends SeafloorHandle {
  /** CPU-side height query at world XZ, clamped to the terrain square. */
  getHeight: (x: number, z: number) => number;
}

export interface UnderwaterHandle {
  render: () => void;
  setPreset: (preset: Preset) => void;
  uniforms: Record<string, THREE.IUniform | { value: unknown }>;
}

/** Throttled GPU readback for height/slope queries at world points. */
export declare class BuoyancySampler {
  constructor(simulator: FFTOceanHandle['simulator'], interval?: number);
  requestReadback(renderer: THREE.WebGPURenderer): Promise<void> | null;
  getHeight(x: number, z: number): number;
  getSlope(x: number, z: number): { dx: number; dz: number };
  underwaterMix(cameraY: number, x: number, z: number, smooth?: number): number;
}

export declare class BuoyancyBody {
  constructor(object: THREE.Object3D, options?: {
    buoyancyOffset?: number;
    samples?: number[][];
    springK?: number;
    damping?: number;
    maxTilt?: number;
    currentDrag?: number;
  });
  sampleVelocity(dt: number): THREE.Vector3;
}

export declare class BuoyancySystem {
  constructor(sampler: BuoyancySampler);
  add(body: BuoyancyBody): void;
  remove(object: THREE.Object3D): void;
  getBody(object: THREE.Object3D): BuoyancyBody | undefined;
  /** Set global river current — dir (unit XZ) and speed (m/s). */
  setCurrent(dirX: number, dirZ: number, speed: number): void;
  update(dt: number): void;
}

export interface WakeField {
  size: number;
  worldExtent: number;
  texture: THREE.Texture;
  stamp(x: number, z: number, vx: number, vz: number, radius?: number, strength?: number): void;
  decay(dt: number): void;
  upload(): void;
  dirty?: boolean;
}

export interface AtmosphereHandle {
  group: THREE.Group;
  state: { sprayIntensity: number; rainIntensity: number; windDirection: number; windSpeed: number };
  applyPreset(preset: Preset): void;
  update(dt: number, ctx: {
    camera: THREE.Camera;
    sampler?: { getHeight: (x: number, z: number) => number };
    wake?: { stamp: (x: number, z: number, vx: number, vz: number, r?: number, s?: number) => void } | null;
  }): void;
  dispose(): void;
}

// ----- Module-level factories re-exported from src/index.js -----

export declare function buildFFTOcean(
  renderer: THREE.WebGPURenderer,
  preset: Preset,
  state: OceanState,
  quality?: Quality,
): Promise<FFTOceanHandle>;

export declare function validateFFT(renderer: THREE.WebGPURenderer, grid?: number): Promise<FFTTestResult>;

export declare function createUnderwaterPipeline(
  renderer: THREE.WebGPURenderer,
  scene: THREE.Scene,
  camera: THREE.Camera,
): UnderwaterHandle;

export declare function buildSeafloor(preset: Preset, sunDirUniform?: { value: THREE.Vector3 }): SeafloorHandle;

/** Fractal-Brownian-motion height closure for procedural terrain. */
export declare function makeFbmHeight(opts?: {
  seed?: number;
  amplitude?: number;
  frequency?: number;
  octaves?: number;
  persistence?: number;
  lacunarity?: number;
}): (x: number, z: number) => number;

/** River channel height closure: bed along a Catmull-Rom centerline + rising banks. */
export declare function makeRiverChannelHeight(points: number[][], opts?: {
  width?: number;
  bankHeight?: number;
  bankFalloff?: number;
  bedDepth?: number;
  seed?: number;
  amplitude?: number;
  frequency?: number;
  octaves?: number;
}): (x: number, z: number) => number;

export declare function buildTerrain(opts?: {
  size?: number;
  resolution?: number;
  heightFn?: (x: number, z: number) => number;
  preset?: Preset;
  sunDir?: { value: THREE.Vector3 };
  seed?: number;
}): TerrainHandle;

export declare function buildPoolScene(
  preset?: Preset,
  sunDir?: { value: THREE.Vector3 },
): SeafloorHandle;

/** Default gently-meandering river centerline. */
export declare function defaultRiverCenterline(length?: number, meander?: number): number[][];

export declare function buildRiverMesh(material: THREE.Material, opts?: {
  points?: number[][];
  width?: number;
  lengthSegs?: number;
  crossSegs?: number;
  closed?: boolean;
}): {
  root: THREE.Object3D;
  mesh: THREE.Mesh;
  snap: number;
  extent: number;
  update: (camera: THREE.Camera) => void;
};

export declare function exportFFTOceanGLB(
  renderer: THREE.WebGPURenderer,
  root: THREE.Object3D,
  mesh: THREE.Mesh,
  simulator: FFTOceanHandle['simulator'],
  filename?: string,
): Promise<void>;

export declare function stateFromPreset(preset: Preset): OceanState;

// ----- Headless introspection (src/core/stats.js) — pure CPU, no renderer ----

/** Per-mesh + summary geometry stats for a built THREE.Object3D. */
export interface GeometryStats {
  meshes: number;
  instances: number;
  triangles: number;
  verts: number;
}

/** Estimate for a single JONSWAP band (wind-sea `local` or `swell`). */
export interface BandStats {
  peakWavelength: number;
  peakPeriod: number;
  significantHeight: number;
  alpha: number;
  peakOmega: number;
}

/** Combined sea-state estimate from a full spectrumParams object. */
export interface SpectrumStats {
  local: BandStats;
  swell: BandStats;
  significantHeight: number;
  dominantPeakWavelength: number;
  dominantPeakPeriod: number;
  depth: number;
  cascades: number;
  gridN: number;
  lengthScales: number[];
}

export declare function statsOf(object: THREE.Object3D): GeometryStats;
export declare function bandStats(band: SpectrumBand, g?: number): BandStats;
export declare function spectrumStats(params: SpectrumParams & { g?: number }): SpectrumStats;

// ----- Registry -----

export declare const PRESETS: Record<string, Preset>;
export declare const DEFAULT_PRESET: string;
export declare const PRESET_LIST: Preset[];

/** Stamp the preset schema version onto a preset (immutably). */
export declare function normalizePreset(preset: Preset): Preset;

// ----- Web component (side-effect import registers <water-canvas>) -----

export declare class SeedOceanCanvas extends HTMLElement {
  static readonly observedAttributes: string[];
  readonly seedOcean: Promise<SeedOcean>;
  connectedCallback(): Promise<void>;
  disconnectedCallback(): void;
  attributeChangedCallback(name: string, oldValue: string, newValue: string): void;
}

declare global {
  interface HTMLElementTagNameMap {
    'water-canvas': SeedOceanCanvas;
  }
}

// ----- Headless Design API (src/api/seedocean.js) ---------------------------
// Two-tier programmatic surface: design tier runs with no GPU (Node/Deno),
// live tier hands off to SeedOcean.create. See src/api/README.md.

/** One row from listPresets(). */
export interface PresetListItem {
  key: string;
  name: string;
  description: string | null;
  waterType: NonNullable<Preset['waterType']>;
  generator: 'fft-jonswap';
  seed: number;
}

/** One editable knob, as data (from getSchema). */
export interface SchemaEntry {
  key: string;
  name: string;
  group?: string;
  type?: 'color' | 'bool';
  min?: number;
  max?: number;
  step?: number;
  default: number | string;
}

/** Result of getSchema(): knobs grouped into folders. */
export interface PresetSchema {
  preset: string;
  name: string;
  waterType: NonNullable<Preset['waterType']>;
  folders: Record<string, SchemaEntry[]>;
}

/** Result of design(): sea-state + geometry + terrain budget, no renderer. */
export interface DesignResult {
  preset: Preset;
  state: OceanState;
  spectrumParams: SpectrumParams;
  seaState: SpectrumStats;
  stats: GeometryStats;
  terrain: { minHeight: number; maxHeight: number; sampleCount: number } | null;
}

/** Serialized preset envelope (seedocean-preset/1). */
export interface PresetEnvelope {
  format: PresetFormat;
  preset: Preset;
}

/** Headless design + live-adapter namespace. */
export declare namespace SeedOceanAPI {
  export { PRESETS, DEFAULT_PRESET, PRESET_FORMAT, normalizePreset };
  export function listPresets(): PresetListItem[];
  export function getSchema(presetRef?: PresetRef): PresetSchema;
  export function describe(presetRef?: string | null, folder?: string | null): string;
  export function design(opts?: {
    preset?: PresetRef;
    seed?: number;
    controls?: Partial<OceanState>;
    quality?: Quality;
  }): DesignResult;
  export function toPreset(opts: {
    preset?: PresetRef;
    seed?: number;
    controls?: Partial<OceanState>;
  }): PresetEnvelope;
  export function fromPreset(json: PresetEnvelope | Preset): {
    preset: Preset;
    seed: number;
    controls: Partial<OceanState>;
  };
  export function createOcean(options?: SeedOceanOptions): Promise<SeedOcean>;
}
