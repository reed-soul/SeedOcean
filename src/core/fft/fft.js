// GPU inverse FFT (Stockham butterfly) — adapted from poseidon / gasgiant FFT-Ocean (MIT).
import { Fn, instanceIndex, uint, float, vec2, attributeArray } from 'three/tsl';

const cmul = (a, b) => vec2(a.x.mul(b.x).sub(a.y.mul(b.y)), a.x.mul(b.y).add(a.y.mul(b.x)));

function fillButterfly(array, N) {
  const logN = Math.log2(N);
  for (let step = 0; step < logN; step++) {
    const b = N >> (step + 1);
    for (let j = 0; j < N / 2; j++) {
      const i = (2 * b * Math.floor(j / b) + (j % b)) % N;
      const X = Math.floor(j / b) * b;
      const twRe = Math.cos((2 * Math.PI * X) / N);
      const twIm = -Math.sin((2 * Math.PI * X) / N);
      const put = (col, re, im) => {
        const o = (step * N + col) * 4;
        array[o] = re;
        array[o + 1] = im;
        array[o + 2] = i;
        array[o + 3] = i + b;
      };
      put(j, twRe, twIm);
      put(j + N / 2, -twRe, -twIm);
    }
  }
}

export class FFT {
  constructor(N) {
    this.N = N;
    this.logN = Math.log2(N);
    this.butterfly = attributeArray(this.logN * N, 'vec4');
    fillButterfly(this.butterfly.value.array, N);
    this.butterfly.value.needsUpdate = true;
  }

  _hStep(field, scratch, s) {
    const N = this.N;
    const src = s % 2 === 0 ? field : scratch;
    const dst = s % 2 === 0 ? scratch : field;
    const bf = this.butterfly;
    return Fn(() => {
      const id = instanceIndex;
      const x = id.mod(uint(N));
      const y = id.div(uint(N));
      const data = bf.element(uint(s * N).add(x));
      const tw = vec2(data.x, data.y.negate());
      const a = src.element(y.mul(N).add(uint(data.z)));
      const b = src.element(y.mul(N).add(uint(data.w)));
      dst.element(id).assign(a.add(cmul(tw, b)));
    })().compute(N * N);
  }

  _vStep(field, scratch, s) {
    const N = this.N;
    const src = s % 2 === 0 ? field : scratch;
    const dst = s % 2 === 0 ? scratch : field;
    const bf = this.butterfly;
    return Fn(() => {
      const id = instanceIndex;
      const x = id.mod(uint(N));
      const y = id.div(uint(N));
      const data = bf.element(uint(s * N).add(y));
      const tw = vec2(data.x, data.y.negate());
      const a = src.element(uint(data.z).mul(N).add(x));
      const b = src.element(uint(data.w).mul(N).add(x));
      dst.element(id).assign(a.add(cmul(tw, b)));
    })().compute(N * N);
  }

  _permute(field) {
    const N = this.N;
    return Fn(() => {
      const id = instanceIndex;
      const x = id.mod(uint(N));
      const y = id.div(uint(N));
      const sign = float(1).sub(float(x.add(y).mod(uint(2))).mul(2));
      field.element(id).assign(field.element(id).mul(sign));
    })().compute(N * N);
  }

  buildField(field, scratch) {
    const h = [];
    const v = [];
    for (let s = 0; s < this.logN; s++) {
      h.push(this._hStep(field, scratch, s));
      v.push(this._vStep(field, scratch, s));
    }
    return { h, v, permute: this._permute(field) };
  }
}

export async function validateFFT(renderer, N) {
  const fft = new FFT(N);

  async function ifftOf(fill) {
    const field = attributeArray(N * N, 'vec2');
    const scratch = attributeArray(N * N, 'vec2');
    const k = fft.buildField(field, scratch);
    fill(field.value.array);
    field.value.needsUpdate = true;
    for (const s of k.h) renderer.compute(s);
    for (const s of k.v) renderer.compute(s);
    renderer.compute(k.permute);
    return new Float32Array(await renderer.getArrayBufferAsync(field.value));
  }

  const r1 = await ifftOf((a) => {
    a.fill(0);
    const c = ((N / 2) * N + N / 2) * 2;
    a[c] = 1;
  });
  let err1 = 0;
  for (let i = 0; i < N * N; i++) {
    err1 = Math.max(err1, Math.abs(r1[i * 2] - 1), Math.abs(r1[i * 2 + 1]));
  }

  const r2 = await ifftOf((a) => {
    a.fill(0);
    const c = ((N / 2) * N + (N / 2 + 1)) * 2;
    a[c] = 1;
  });
  let err2 = 0;
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const o = (y * N + x) * 2;
      err2 = Math.max(err2, Math.abs(r2[o] - Math.cos((2 * Math.PI * x) / N)), Math.abs(r2[o + 1] - Math.sin((2 * Math.PI * x) / N)));
    }
  }

  return { pass: err1 < 1e-3 && err2 < 1e-3, err1, err2 };
}
