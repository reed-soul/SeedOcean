import { uniform, attributeArray } from 'three/tsl';
import { createSharedSpectrumUniforms, applySpectrumParams } from './spectrum.js';
import { gaussianNoise } from './gaussian-noise.js';
import { OceanCascade } from './ocean-cascade.js';
import { FFT } from './fft.js';
import { createCascadeMaps } from './maps.js';

const FIELD_NAMES = ['DxDz', 'DyDxz', 'DyxDyz', 'DxxDzz'];

export class OceanSimulator {
  constructor(renderer, params) {
    this.renderer = renderer;
    this.params = params;
    this.N = params.N;
    this.time = uniform(0);
    this.seed = params.seed ?? 1;

    this.shared = createSharedSpectrumUniforms();
    applySpectrumParams(this.shared, params);

    this.noise = attributeArray(this.N * this.N, 'vec2');
    this._uploadNoise(this.seed);

    this.cascades = [];
    const count = Math.min(params.cascades, params.lengthScales.length);
    const boundary = (i) => ((2 * Math.PI) / params.lengthScales[i]) * params.boundaryFactor;
    for (let i = 0; i < count; i++) {
      this.cascades.push(new OceanCascade({
        N: this.N,
        shared: this.shared,
        noise: this.noise,
        lengthScale: params.lengthScales[i],
        cutoffLow: i === 0 ? 1e-4 : boundary(i),
        cutoffHigh: i === count - 1 ? 9999 : boundary(i + 1),
        time: this.time,
      }));
    }

    this.fft = new FFT(this.N);
    this.timeDepGroup = this.cascades.map((c) => c.kTimeDependent);
    const ffts = [];
    for (const c of this.cascades) {
      for (const name of FIELD_NAMES) {
        const scratch = attributeArray(this.N * this.N, 'vec2');
        ffts.push(this.fft.buildField(c[name], scratch));
      }
    }
    this.stepGroups = [];
    for (let s = 0; s < this.fft.logN; s++) this.stepGroups.push(ffts.map((f) => f.h[s]));
    for (let s = 0; s < this.fft.logN; s++) this.stepGroups.push(ffts.map((f) => f.v[s]));
    this.stepGroups.push(ffts.map((f) => f.permute));

    this.lambda = uniform(params.lambda);
    this.dt = uniform(1 / 60);
    // foamPersistence: 0 = instantaneous (legacy), 1 = foam holds indefinitely.
    this.foamPersistence = uniform(params.foamPersistence ?? (1 - (params.foamDecay ?? 0.45)));

    this.assembleGroup = [];
    this.advectGroup = [];
    this.cascadeMaps = [];
    for (const c of this.cascades) {
      const maps = createCascadeMaps(c, {
        N: this.N, lambda: this.lambda, dt: this.dt, foamDecay: this.foamPersistence,
      });
      c.displacement = maps.displacement;
      c.derivatives = maps.derivatives;
      c.foam = maps.foam;
      this.assembleGroup.push(maps.assemble);
      this.advectGroup.push(maps.advect);
      this.cascadeMaps.push(maps);
    }
  }

  _uploadNoise(seed) {
    const noiseData = gaussianNoise(this.N, seed);
    this.noise.value.array.set(noiseData);
    this.noise.value.needsUpdate = true;
    this.seed = seed;
  }

  setSeed(seed) {
    this._uploadNoise(seed);
  }

  applyParams(params) {
    this.params = params;
    applySpectrumParams(this.shared, params);
    this.lambda.value = params.lambda;
    this.foamPersistence.value = params.foamPersistence ?? (1 - (params.foamDecay ?? 0.45));
  }

  async updateInitialSpectrum() {
    applySpectrumParams(this.shared, this.params);
    for (const c of this.cascades) {
      await this.renderer.computeAsync(c.kInitial);
      await this.renderer.computeAsync(c.kConjugate);
    }
  }

  evolve(t, dt = 1 / 60) {
    this.time.value = t;
    this.dt.value = dt;
    this.renderer.compute(this.timeDepGroup);
    for (const group of this.stepGroups) this.renderer.compute(group);
    // Foam: assemble writes displacement (.w = breaking source); swap so advect
    // reads prev frame's foam; advect; swap again so `c.foam` holds fresh state.
    this.renderer.compute(this.assembleGroup);
    for (const m of this.cascadeMaps) m.swapFoam();
    this.renderer.compute(this.advectGroup);
    for (const m of this.cascadeMaps) m.swapFoam();
  }
}
