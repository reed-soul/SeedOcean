// SeedOcean public API — embed FFT ocean in any Three.js WebGPU scene.

import * as THREE from 'three/webgpu';
import { uniform } from 'three/tsl';
import { buildFFTOcean } from './core/fft-ocean.js';
import { buildGerstnerOcean } from './core/fallback/gerstner-ocean.js';
import { validateFFT } from './core/fft/fft.js';
import { buildEnvironment } from './core/environment.js';
import { exportFFTOceanGLB } from './core/export-glb.js';
import { BuoyancySampler } from './core/buoyancy.js';
import { BuoyancySystem } from './core/buoyancy-body.js';
import { buildSeafloor } from './core/seafloor.js';
import { buildTerrain } from './core/terrain.js';
import { buildPoolScene } from './core/pool-scene.js';
import { buildAtmosphere } from './core/atmosphere.js';
import { createUnderwaterPipeline } from './core/underwater-post.js';
import { PRESETS, DEFAULT_PRESET } from './presets/index.js';
import { resolvePreset } from './presets/resolve.js';
import { stateFromPreset } from './state.js';
import { disposeOcean, disposeSeafloor, disposeDemoObject } from './core/dispose.js';
import { waterTypeOf, isEnclosed, usesTerrain, WATER } from './core/water-types.js';
import { normalizeFlowMapConfig, populateFlowMap } from './core/flow-map.js';
import { resolveDemoObjects } from './core/demo-objects.js';
import { PRESET_FORMAT, normalizePreset } from './presets/index.js';

const VERSION = '0.6.0-alpha';

const ABOVE_FOG = { color: 0x4a90b8, density: 0.00085 };
const BELOW_FOG = { color: 0x032838, density: 0.0032 };

/**
 * @typedef {object} SeedOceanOptions
 * @property {HTMLElement} [container] — mount canvas here (creates renderer if omitted)
 * @property {THREE.WebGPURenderer} [renderer]
 * @property {THREE.Scene} [scene]
 * @property {THREE.PerspectiveCamera} [camera]
 * @property {string|object} [preset] — preset id or preset object
 * @property {object} [state] — live tuning state (merged with preset defaults)
 * @property {boolean} [environment=true]
 * @property {boolean} [seafloor=true]
 * @property {boolean} [underwater=true]
 * @property {boolean} [buoyancy=true]
 * @property {boolean|object|Function} [demoObjects=false] — true = default factory;
 *   config `{ buoy?, boat?, crates? }`; or `(ctx) => handle` for full control
 * @property {boolean} [validateFFT=false]
 * @property {number} [fftGrid=128] — size used only by the FFT self-test
 * @property {'perf'|'quality'} [quality='perf'] — 128² vs 256² simulation grid
 */

export class SeedOcean {
  /** @param {SeedOceanOptions} options */
  static async create(options = {}) {
    const instance = new SeedOcean(options);
    await instance._init();
    return instance;
  }

  /** @param {SeedOceanOptions} options */
  constructor(options = {}) {
    this.options = options;
    this.version = VERSION;
    this.clock = new THREE.Clock();
    this.sunDir = new THREE.Vector3();
    this._ownsRenderer = !options.renderer;
    this._ownsScene = !options.scene;
    this._ownsCamera = !options.camera;
    this.quality = options.quality === 'quality' ? 'quality' : 'perf';
  }

  async _init() {
    const opts = this.options;
    const presetInput = opts.preset ?? DEFAULT_PRESET;
    this.preset = resolvePreset(presetInput);
    this.state = { ...stateFromPreset(this.preset), ...(opts.state ?? {}) };

    // Detect WebGPU once. When unavailable we fall back to the Gerstner-wave
    // renderer (no compute shaders) but keep the public API identical.
    this.isWebGPU = await (async () => {
      if (typeof navigator === 'undefined' || !navigator.gpu) return false;
      try { return Boolean(await navigator.gpu.requestAdapter()); }
      catch { return false; }
    })();

    if (opts.renderer) {
      this.renderer = opts.renderer;
    } else {
      this.renderer = new THREE.WebGPURenderer({ antialias: true, forceWebGL: !this.isWebGPU });
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      this.renderer.setSize(window.innerWidth, window.innerHeight);
      if (opts.container) opts.container.appendChild(this.renderer.domElement);
    }

    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = this.state.exposure;

    this.scene = opts.scene ?? new THREE.Scene();
    // Per-preset fog: bounded water (pool/lake/river) declares its own fog color
    // + density so the scene reads as an enclosed space rather than an ocean.
    // Ocean presets keep the default ABOVE_FOG (hazy ocean-blue to the horizon).
    const presetFog = this.preset.fog;
    const initialFog = presetFog
      ? { color: presetFog.color, density: presetFog.density }
      : { color: ABOVE_FOG.color, density: ABOVE_FOG.density };
    if (!this.scene.fog) {
      this.scene.fog = new THREE.FogExp2(initialFog.color, initialFog.density);
    }

    if (opts.camera) {
      this.camera = opts.camera;
    } else {
      // Bounded water uses a shorter far plane so distant sky/terrain edges
      // don't read as an ocean horizon. Ocean keeps 6000 for the open sea.
      const waterType = waterTypeOf(this.preset);
      const enclosed = isEnclosed(waterType);
      const far = this.preset.scene?.cameraFar ?? (enclosed ? 700 : 6000);
      this.camera = new THREE.PerspectiveCamera(
        55,
        this.renderer.domElement.clientWidth / this.renderer.domElement.clientHeight || 1,
        0.5,
        far,
      );
      this.camera.position.set(0, 14, 48);
    }

    await this.renderer.init();

    if (this.isWebGPU && opts.validateFFT === true) {
      this.fftTest = await validateFFT(this.renderer, opts.fftGrid ?? 128);
    }

    if (opts.environment !== false) {
      this.env = buildEnvironment(this.renderer);
      this.scene.add(this.env.sunLight);
      this.scene.add(this.env.hemi);
      // Bounded water hides the infinite sky dome — the horizon should read as
      // the enclosure (pool walls / valley hills / fog), not an ocean skyline.
      // preset.scene.sky defaults true for ocean, false for bounded water.
      const waterType = waterTypeOf(this.preset);
      const skyOn = this.preset.scene?.sky ?? !isEnclosed(waterType);
      if (skyOn) {
        this.scene.add(this.env.sky);
      } else {
        this.env.sky.visible = false;
        // With the sky dome hidden, set a solid background = fog color so the
        // horizon reads as tinted atmosphere instead of pure black. The FogExp2
        // then fades the enclosure edges smoothly into this backdrop.
        const fogColor = this.preset.fog?.color ?? ABOVE_FOG.color;
        this.scene.background = new THREE.Color(fogColor);
      }
      if (this.env.stars) this.scene.add(this.env.stars);
    }

    if (this.isWebGPU) {
      this.ocean = await buildFFTOcean(this.renderer, this.preset, this.state, this.quality);
    } else {
      this.ocean = await buildGerstnerOcean(this.renderer, this.preset, this.state);
    }
    this.scene.add(this.ocean.root);
    this.ocean.updateClipmap(this.camera);

    this.submergedMix = uniform(0);

    if (opts.seafloor !== false) {
      // Bounded water (lake/river) gets displaced terrain as its basin/banks;
      // open water keeps the flat seafloor. Both expose the same handle shape
      // ({ mesh, updateUnderwater }) so update()/applyFogBlend are agnostic.
      const waterType = waterTypeOf(this.preset);
      if (usesTerrain(waterType)) {
        this.seafloor = buildTerrain({
          preset: this.preset,
          sunDir: this.ocean.shading.sunDir,
          size: this.preset.terrain?.size ?? 400,
          resolution: this.preset.terrain?.resolution ?? 128,
          seed: this.preset.seed,
        });
      } else if (waterType === WATER.POOL) {
        // Pool gets a full enclosure (deck + pool walls + tiled floor +
        // perimeter walls) instead of the 2400m flat seafloor.
        this.seafloor = buildPoolScene(this.preset, this.ocean.shading.sunDir);
      } else {
        this.seafloor = buildSeafloor(this.preset, this.ocean.shading.sunDir);
      }
      this.scene.add(this.seafloor.mesh);
    }

    if (this.isWebGPU && opts.buoyancy !== false) {
      this.buoyancy = new BuoyancySampler(this.ocean.simulator, 3);
      this.buoyancySystem = new BuoyancySystem(this.buoyancy);
      this._applyCurrent();
    } else if (opts.buoyancy !== false) {
      // Fallback: analytical Gerstner sampler (no GPU readback).
      this.buoyancy = { getHeight: (x, z) => this.ocean.getHeight(x, z), getSlope: () => ({ dx: 0, dz: 0 }), requestReadback: () => null, underwaterMix: (camY, x, z) => {
        const s = this.ocean.getHeight(x, z);
        return Math.min(1, Math.max(0, (s - camY + 0.25) / 1.2));
      } };
      this.buoyancySystem = new BuoyancySystem(this.buoyancy);
      this._applyCurrent();
    }

    if (opts.demoObjects) {
      this._buildDemoObjects();
    }

    if (this.isWebGPU && opts.underwater !== false) {
      this.underwater = createUnderwaterPipeline(this.renderer, this.scene, this.camera);
      this.underwater.setPreset(this.preset);
    }

    // Spray + rain (atmosphere). Zero-cost when both intensities are zero.
    this.atmosphere = buildAtmosphere({
      sprayIntensity: this.preset.sprayIntensity ?? 0,
      rainIntensity: this.preset.rainIntensity ?? 0,
      windDirection: this.state.windDirection,
      windSpeed: this.preset.spectrum?.local?.windSpeed ?? 10,
    });
    this.scene.add(this.atmosphere.group);

    this.syncSky();

    this.ocean.evolve(0, 1 / 60, this.state.waveSpeed);
    if (this.buoyancy?.requestReadback) await this.buoyancy.requestReadback(this.renderer);
  }

  _buildDemoObjects() {
    const handle = resolveDemoObjects(this.options.demoObjects, {
      preset: this.preset,
      scene: this.scene,
      ocean: this.ocean,
      buoyancySystem: this.buoyancySystem,
      submergedMix: this.submergedMix,
    });
    this.buoy = handle?.buoy ?? null;
    this.boat = handle?.boat ?? null;
    this.crates = handle?.crates ?? null;
  }

  async applyPreset(idOrPreset, nextState) {
    const nextPreset = resolvePreset(idOrPreset);
    const prevType = this.preset?.waterType ?? 'ocean';
    const nextType = nextPreset.waterType ?? 'ocean';
    this.preset = nextPreset;
    if (nextState) Object.assign(this.state, nextState);
    else Object.assign(this.state, stateFromPreset(this.preset));

    // waterType change requires rebuilding the scene graph (ocean mesh type,
    // seafloor/terrain/pool enclosure, sky/fog, demo objects). Shader-only
    // applyPreset can't swap a clipmap for a patch or materialize pool walls.
    if (prevType !== nextType) {
      await this._rebuildForWaterType();
      return;
    }
    await this.ocean.applyPreset(this.preset, this.state);
    this.underwater?.setPreset(this.preset);
    this.atmosphere?.applyPreset(this.preset);
    this.applyLiveTuning();
    this.syncSky();
    this._applyCurrent();
    this._applySceneBackdrop();
  }

  /**
   * Rebuild the water-type-dependent scene graph when applyPreset crosses a
   * waterType boundary (e.g. coastal → pool). Tears down the old ocean mesh,
   * seafloor/terrain/pool enclosure, and demo objects, then rebuilds them for
   * the new preset. Environment/underwater/atmosphere are kept and refreshed.
   */
  async _rebuildForWaterType() {
    const opts = this.options;

    // --- Tear down water-type-specific scene graph ---
    if (this.ocean) {
      this.scene.remove(this.ocean.root);
      disposeOcean(this.ocean);
      this.ocean = null;
    }
    if (this.seafloor) {
      this.scene.remove(this.seafloor.mesh);
      disposeSeafloor(this.seafloor);
      this.seafloor = null;
    }
    this._removeDemoObjects();

    // --- Rebuild ocean (correct mesh type for the new waterType) ---
    if (this.isWebGPU) {
      this.ocean = await buildFFTOcean(this.renderer, this.preset, this.state, this.quality);
    } else {
      this.ocean = await buildGerstnerOcean(this.renderer, this.preset, this.state);
    }
    this.scene.add(this.ocean.root);
    this.ocean.updateClipmap(this.camera);

    // --- Rebuild seafloor / terrain / pool enclosure ---
    const waterType = waterTypeOf(this.preset);
    if (usesTerrain(waterType)) {
      this.seafloor = buildTerrain({
        preset: this.preset,
        sunDir: this.ocean.shading.sunDir,
        size: this.preset.terrain?.size ?? 400,
        resolution: this.preset.terrain?.resolution ?? 128,
        seed: this.preset.seed,
      });
    } else if (waterType === WATER.POOL) {
      this.seafloor = buildPoolScene(this.preset, this.ocean.shading.sunDir);
    } else {
      this.seafloor = buildSeafloor(this.preset, this.ocean.shading.sunDir);
    }
    this.scene.add(this.seafloor.mesh);

    // --- Rebuild buoyancy sampler against the new simulator ---
    if (opts.buoyancy !== false) {
      if (this.isWebGPU) {
        this.buoyancy = new BuoyancySampler(this.ocean.simulator, 3);
      } else {
        this.buoyancy = {
          getHeight: (x, z) => this.ocean.getHeight(x, z),
          getSlope: () => ({ dx: 0, dz: 0 }),
          requestReadback: () => null,
          underwaterMix: (camY, x, z) => {
            const s = this.ocean.getHeight(x, z);
            return Math.min(1, Math.max(0, (s - camY + 0.25) / 1.2));
          },
        };
      }
      this.buoyancySystem = new BuoyancySystem(this.buoyancy);
    }

    // --- Rebuild demo objects (guarded by waterType) ---
    if (opts.demoObjects) this._buildDemoObjects();

    // --- Refresh sky / fog / background / camera far for the new scene ---
    this._applySceneBackdrop();
    this.underwater?.setPreset(this.preset);
    this.atmosphere?.applyPreset(this.preset);
    this.applyLiveTuning();
    this.syncSky();
    this._applyCurrent();
    this.ocean.evolve(0, 1 / 60, this.state.waveSpeed);
  }

  /**
   * Apply preset-driven scene backdrop: sky visibility, fog color/density,
   * background color, and camera far plane. Called on init + every preset
   * switch so the enclosure matches the water type.
   */
  _applySceneBackdrop() {
    if (!this.env) return;
    const waterType = waterTypeOf(this.preset);
    const enclosed = isEnclosed(waterType);
    const skyOn = this.preset.scene?.sky ?? !enclosed;
    this.env.sky.visible = skyOn;
    if (skyOn) {
      this.scene.background = null;
    } else {
      const fogColor = this.preset.fog?.color ?? ABOVE_FOG.color;
      this.scene.background = new THREE.Color(fogColor);
    }
    // Camera far plane: bounded water uses a tighter far so distant geometry
    // doesn't read as an ocean horizon.
    if (this._ownsCamera) {
      this.camera.far = this.preset.scene?.cameraFar ?? (enclosed ? 700 : 6000);
      this.camera.updateProjectionMatrix();
    }
  }

  /** Remove boat/buoy/crates added by _buildDemoObjects (for scene rebuild). */
  _removeDemoObjects() {
    const { scene, buoyancySystem } = this;
    disposeDemoObject(scene, buoyancySystem, this.boat);
    this.boat = null;
    disposeDemoObject(scene, buoyancySystem, this.buoy);
    this.buoy = null;
    if (this.crates) {
      for (const crate of this.crates) disposeDemoObject(scene, buoyancySystem, crate);
      this.crates = null;
    }
  }

  /** Push preset.flow into the buoyancy system as the global current. */
  _applyCurrent() {
    if (!this.buoyancySystem) return;
    const flow = this.preset?.flow;
    if (flow) this.buoyancySystem.setCurrent(flow.dir[0], flow.dir[1], flow.speed);
    else this.buoyancySystem.setCurrent(0, 0, 0);
  }

  applyLiveTuning() {
    this.ocean.applyLiveTuning(this.preset, this.state);
    if (this.underwater) {
      this.underwater.uniforms.godRayStrength.value =
        this.state.godRayStrength ?? this.preset.godRayStrength ?? 0.22;
    }
    if (this.atmosphere) {
      this.atmosphere.state.windDirection = this.state.windDirection;
      this.atmosphere.state.windSpeed = this.preset.spectrum?.local?.windSpeed ?? 10;
    }
    this.renderer.toneMappingExposure = this.state.exposure;
  }

  syncSky() {
    if (!this.env) return;
    Object.assign(this.env.skyState, {
      elevation: this.state.elevation,
      azimuth: this.state.azimuth,
      exposure: this.state.exposure,
      cloudCoverage: this.state.cloudCoverage,
      starsDensity: this.state.starsDensity ?? 1,
    });
    this.env.sky.cloudCoverage.value = this.state.cloudCoverage;
    this.sunDir = this.env.updateSun(this.scene);
    this.ocean?.setSunDirection(this.sunDir);
    this.underwater?.uniforms.sunDir.value.copy(this.sunDir);
    this.renderer.toneMappingExposure = this.state.exposure;
  }

  _applyFogBlend(mix) {
    const fog = this.scene.fog;
    if (!fog) return;
    // Above-water fog color/density comes from the preset (bounded water
    // declares its own enclosure-tinted fog); fall back to the ocean haze.
    const above = this.preset?.fog ?? ABOVE_FOG;
    fog.color.setHex(mix > 0.5 ? BELOW_FOG.color : above.color);
    fog.density = THREE.MathUtils.lerp(above.density, BELOW_FOG.density, mix);
  }

  _stampWake(object, dt, radius = 4, strength = 1.1) {
    const body = this.buoyancySystem?.getBody(object);
    if (!body) return;
    const vel = body.sampleVelocity(dt);
    const speed = Math.sqrt(vel.x * vel.x + vel.z * vel.z);
    if (speed < 0.15) return;
    this.ocean.stampWake(object.position.x, object.position.z, vel.x, vel.z, radius, strength);
  }

  /**
   * Advance simulation and render one frame.
   * @param {number} [dt] — delta seconds (uses internal clock if omitted)
   */
  update(dt) {
    const delta = dt ?? this.clock.getDelta();
    const t = this.clock.getElapsedTime();

    this.ocean.updateClipmap(this.camera);
    // Star shell follows the camera so it always reads as infinitely far.
    if (this.env?.stars) this.env.stars.position.copy(this.camera.position);
    if (this.seafloor) {
      this.seafloor.mesh.position.x = this.ocean.root.position.x;
      this.seafloor.mesh.position.z = this.ocean.root.position.z;
    }

    this.ocean.evolve(t, delta, this.state.waveSpeed);
    this.buoyancy?.requestReadback(this.renderer);

    let uMix = 0;
    if (this.buoyancy) {
      uMix = this.buoyancy.underwaterMix(
        this.camera.position.y,
        this.camera.position.x,
        this.camera.position.z,
      );
    }

    if (this.underwater) this.underwater.uniforms.underwaterMix.value = uMix;
    this.ocean.setUnderwaterMix(uMix);
    this.seafloor?.updateUnderwater(uMix);
    this.submergedMix.value = uMix;
    this._applyFogBlend(uMix);

    this.buoyancySystem?.update(delta);
    if (this.boat) this._stampWake(this.boat, delta, 5.5, 1.35);

    if (this.atmosphere) {
      this.atmosphere.update(delta, {
        camera: this.camera,
        sampler: this.buoyancy,
        wake: this.ocean.wakeField,
      });
    }

    return { t, dt: delta, underwaterMix: uMix };
  }

  render() {
    if (this.underwater) this.underwater.render();
    else this.renderer.render(this.scene, this.camera);
  }

  tick() {
    const frame = this.update();
    this.render();
    return frame;
  }

  resize(width, height) {
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  }

  async exportGLB(filename) {
    const t = this.clock.getElapsedTime();
    this.ocean.evolve(t, 1 / 60, this.state.waveSpeed);
    const slug = this.preset.id;
    if (!this.isWebGPU) {
      // Fallback path has no FFT simulator to bake; export the current mesh as-is.
      console.warn('glTF export on WebGL2 fallback exports the Gerstner mesh without FFT displacement.');
      return;
    }
    await exportFFTOceanGLB(
      this.renderer,
      this.ocean.root,
      this.ocean.mesh,
      this.ocean.simulator,
      filename ?? `seedocean-${slug}.glb`,
    );
  }

  /**
   * Re-bake the FlowMap from the current preset, wiping painter strokes.
   * No-op when the ocean has no FlowMap (`flowmap: false`).
   */
  resetFlowMap() {
    const map = this.ocean?.flowMap;
    if (!map) return;
    const cfg = normalizeFlowMapConfig(this.preset.flowmap, this.preset);
    if (cfg) populateFlowMap(map, this.preset, cfg);
    else map.clear();
    map.upload();
  }

  /**
   * Serialize the live design to a seedocean-preset/1 envelope, embedding the
   * painted FlowMap pixels when present. Download as JSON when `download` is
   * true (demo Save); otherwise return the object for programmatic use.
   *
   * @param {{ download?: boolean, filename?: string }} [opts]
   * @returns {{ format: string, preset: object }}
   */
  exportPreset({ download = false, filename } = {}) {
    const state = this.state;
    const merged = { ...this.preset, ...stateFromPreset(this.preset), ...state };
    // Embed painted FlowMap so round-trip restores strokes.
    const map = this.ocean?.flowMap;
    if (map && map.isPainted()) {
      const painted = map.toJSON();
      const prev = typeof merged.flowmap === 'object' && merged.flowmap ? merged.flowmap : {};
      merged.flowmap = {
        ...prev,
        size: painted.size,
        worldExtent: painted.worldExtent,
        pixels: painted.pixels,
      };
    }
    const envelope = { format: PRESET_FORMAT, preset: normalizePreset(merged) };

    if (download && typeof document !== 'undefined') {
      const blob = new Blob([JSON.stringify(envelope, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename ?? `seedocean-${this.preset.id}.json`;
      a.click();
      URL.revokeObjectURL(url);
    }
    return envelope;
  }

  dispose() {
    this.renderer.setAnimationLoop(null);

    this._removeDemoObjects();

    if (this.ocean) {
      this.scene.remove(this.ocean.root);
      disposeOcean(this.ocean);
      this.ocean = null;
    }

    if (this.seafloor) {
      this.scene.remove(this.seafloor.mesh);
      disposeSeafloor(this.seafloor);
      this.seafloor = null;
    }

    if (this.atmosphere) {
      this.scene.remove(this.atmosphere.group);
      this.atmosphere.dispose();
      this.atmosphere = null;
    }

    if (this.env) {
      this.scene.remove(this.env.sunLight);
      this.scene.remove(this.env.hemi);
      if (this.env.sky) this.scene.remove(this.env.sky);
      if (this.env.stars) this.scene.remove(this.env.stars);
      this.env.dispose();
      this.env = null;
    }

    this.buoyancy = null;
    this.buoyancySystem = null;
    this.underwater = null;

    if (this._ownsRenderer) this.renderer.dispose();
  }
}
