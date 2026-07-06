import { uniform, attributeArray } from 'three/tsl';
import { buildInitialSpectrum, buildConjugate, buildTimeDependent } from './spectrum.js';

export class OceanCascade {
  constructor({ N, shared, noise, lengthScale, cutoffLow, cutoffHigh, time }) {
    this.N = N;
    this.lengthScale = lengthScale;
    this.deltaK = uniform((2 * Math.PI) / lengthScale);
    this.cutoffLow = uniform(cutoffLow);
    this.cutoffHigh = uniform(cutoffHigh);

    const n2 = N * N;
    this.h0k = attributeArray(n2, 'vec2');
    this.h0 = attributeArray(n2, 'vec4');
    this.wavesData = attributeArray(n2, 'vec4');
    this.DxDz = attributeArray(n2, 'vec2');
    this.DyDxz = attributeArray(n2, 'vec2');
    this.DyxDyz = attributeArray(n2, 'vec2');
    this.DxxDzz = attributeArray(n2, 'vec2');

    this.kInitial = buildInitialSpectrum({
      N, noise, h0k: this.h0k, wavesData: this.wavesData,
      shared, deltaK: this.deltaK, cutoffLow: this.cutoffLow, cutoffHigh: this.cutoffHigh,
    });
    this.kConjugate = buildConjugate({ N, h0k: this.h0k, h0: this.h0 });
    this.kTimeDependent = buildTimeDependent({
      N, h0: this.h0, wavesData: this.wavesData,
      DxDz: this.DxDz, DyDxz: this.DyDxz, DyxDyz: this.DyxDyz, DxxDzz: this.DxxDzz, time,
    });
  }
}
