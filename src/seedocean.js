// SeedOcean public API — embed FFT ocean in any Three.js WebGPU scene.

import * as THREE from 'three/webgpu';
import { uniform } from 'three/tsl';
import { buildFFTOcean } from './core/fft-ocean.js';
import { buildGerstnerOcean } from './core/fallback/gerstner-ocean.js';
import { validateFFT } from './core/fft/fft.js';
import { buildEnvironment } from './core/environment.js';
import { exportFFTOceanGLB } from './core/export-glb.js';
import { BuoyancySampler } from './core/buoyancy.js';
import { BuoyancySystem, BuoyancyBody } from './core/buoyancy-body.js';
import { buildSeafloor } from './core/seafloor.js';
import { buildTerrain } from './core/terrain.js';
import { buildBoat } from './core/boat.js';
import { buildAtmosphere } from './core/atmosphere.js';
import { createSubmergedMaterial } from './core/submerged-material.js';
import { createUnderwaterPipeline } from './core/underwater-post.js';
import { PRESETS, DEFAULT_PRESET } from './presets/index.js';
import { stateFromPreset } from './ui/controls.js';

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
 * @property {boolean} [demoObjects=false] — buoy, boat, crates
 * @property {boolean} [validateFFT=true]
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
    this.preset = typeof presetInput === 'string' ? PRESETS[presetInput] : presetInput;
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
    if (!this.scene.fog) {
      this.scene.fog = new THREE.FogExp2(ABOVE_FOG.color, ABOVE_FOG.density);
    }

    if (opts.camera) {
      this.camera = opts.camera;
    } else {
      this.camera = new THREE.PerspectiveCamera(
        55,
        this.renderer.domElement.clientWidth / this.renderer.domElement.clientHeight || 1,
        0.5,
        6000,
      );
      this.camera.position.set(0, 14, 48);
    }

    await this.renderer.init();

    if (this.isWebGPU && opts.validateFFT !== false) {
      this.fftTest = await validateFFT(this.renderer, opts.fftGrid ?? 128);
    }

    if (opts.environment !== false) {
      this.env = buildEnvironment(this.renderer);
      this.scene.add(this.env.sky);
      this.scene.add(this.env.sunLight);
      this.scene.add(this.env.hemi);
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
      const waterType = this.preset.waterType ?? 'ocean';
      if (waterType === 'lake' || waterType === 'river') {
        this.seafloor = buildTerrain({
          preset: this.preset,
          sunDir: this.ocean.shading.sunDir,
          size: this.preset.terrain?.size ?? 400,
          resolution: this.preset.terrain?.resolution ?? 128,
          seed: this.preset.seed,
        });
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
    const { preset, scene, ocean, buoyancySystem, submergedMix } = this;

    const buoyMat = createSubmergedMaterial(
      0xff5533,
      preset.causticColor ?? 0x3a8a9a,
      ocean.shading.sunDir,
      submergedMix,
      { causticStrength: 0.65 },
    );
    this.buoy = new THREE.Mesh(
      new THREE.CylinderGeometry(0.35, 0.5, 1.2, 12),
      buoyMat.material,
    );
    this.buoy.position.set(6, 0.6, -4);
    this.buoy.name = 'Buoy';
    scene.add(this.buoy);
    buoyancySystem.add(new BuoyancyBody(this.buoy, {
      buoyancyOffset: 0.75,
      samples: [[0, 0]],
      springK: 28,
      damping: 6,
    }));

    const boatHullMat = createSubmergedMaterial(
      0xc8d4dc,
      preset.causticColor ?? 0x3a8a9a,
      ocean.shading.sunDir,
      submergedMix,
      { causticStrength: 0.48, roughness: 0.45, metalness: 0.12 },
    );
    this.boat = buildBoat(boatHullMat.material);
    scene.add(this.boat);
    buoyancySystem.add(new BuoyancyBody(this.boat, {
      buoyancyOffset: 0.35,
      samples: [[0, 0], [2.2, 0], [-2.2, 0], [0, 0.9], [0, -0.9]],
      springK: 14,
      damping: 4.5,
      maxTilt: 0.22,
    }));

    this.crates = [];
    for (const [cx, cz] of [[12, -8], [-10, 14], [18, 6]]) {
      const crateMat = createSubmergedMaterial(
        0xc49a6c,
        preset.causticColor ?? 0x3a8a9a,
        ocean.shading.sunDir,
        submergedMix,
        { causticStrength: 0.5, roughness: 0.75 },
      );
      const crate = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.4, 1.4), crateMat.material);
      crate.position.set(cx, 0.7, cz);
      crate.name = 'Crate';
      scene.add(crate);
      this.crates.push(crate);
      buoyancySystem.add(new BuoyancyBody(crate, {
        buoyancyOffset: 0.7,
        samples: [[0, 0]],
        springK: 32,
        damping: 7,
        maxTilt: 0.12,
      }));
    }
  }

  async applyPreset(idOrPreset, nextState) {
    this.preset = typeof idOrPreset === 'string' ? PRESETS[idOrPreset] : idOrPreset;
    if (nextState) Object.assign(this.state, nextState);
    else Object.assign(this.state, stateFromPreset(this.preset));
    await this.ocean.applyPreset(this.preset, this.state);
    this.underwater?.setPreset(this.preset);
    this.atmosphere?.applyPreset(this.preset);
    this.applyLiveTuning();
    this.syncSky();
    this._applyCurrent();
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
    fog.color.setHex(mix > 0.5 ? BELOW_FOG.color : ABOVE_FOG.color);
    fog.density = THREE.MathUtils.lerp(ABOVE_FOG.density, BELOW_FOG.density, mix);
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

  dispose() {
    this.renderer.setAnimationLoop(null);
    if (this._ownsRenderer) this.renderer.dispose();
  }
}
