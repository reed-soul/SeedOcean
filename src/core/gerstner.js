// Gerstner wave stack — CPU + TSL share the same wave definitions.
// Phase 1 displacement; FFT/IFFT compute replaces this in a later milestone.

import {
  Fn, float, vec2, vec3, sin, cos, dot, time, uniform, positionLocal,
} from 'three/tsl';
import { Rng } from './rng.js';

const GRAVITY = 9.81;
const TAU = Math.PI * 2;

function normalizeDir(x, z) {
  const len = Math.hypot(x, z) || 1;
  return [x / len, z / len];
}

/**
 * @typedef {object} WaveSpec
 * @property {number} amplitude
 * @property {number} wavelength
 * @property {[number, number]} direction
 * @property {number} [steepness]
 * @property {number} [speed]
 */

/** @param {WaveSpec[]} waves */
export function wavesFromPreset(waves, rng, ampScale = 1) {
  return waves.map((w, i) => {
    const dir = normalizeDir(w.direction[0], w.direction[1]);
    const phase = rng ? rng.range(0, TAU) : i * 1.7;
    return {
      amplitude: w.amplitude * ampScale,
      wavelength: w.wavelength,
      direction: dir,
      steepness: w.steepness ?? 0.45,
      speed: w.speed ?? 1,
      phase,
    };
  });
}

export function resolveWaves(preset, seed, ampScale = 1) {
  const rng = new Rng(seed);
  return wavesFromPreset(preset.waves, rng, ampScale);
}

/** CPU Gerstner — export baking and future buoyancy sampling. */
export function sampleGerstner(x, z, t, waves, globalSpeed = 1) {
  let dx = 0;
  let dy = 0;
  let dz = 0;
  const n = waves.length;

  for (const w of waves) {
    const k = TAU / w.wavelength;
    const omega = Math.sqrt(GRAVITY * k) * w.speed * globalSpeed;
    const [dxn, dzn] = w.direction;
    const f = k * (dxn * x + dzn * z) - omega * t + (w.phase ?? 0);
    const a = w.amplitude;
    const q = Math.min(w.steepness / (k * a * n), 1);

    dx += q * a * dxn * Math.cos(f);
    dy += a * Math.sin(f);
    dz += q * a * dzn * Math.cos(f);
  }

  return { x: dx, y: dy, z: dz };
}

/**
 * Build TSL uniforms + displacement/normal nodes for an ocean material.
 * @param {ReturnType<typeof wavesFromPreset>} waves
 */
export function buildGerstnerNodes(waves) {
  const waveSpeed = uniform(1);
  const waveAmp = uniform(1);

  const waveUniforms = waves.map((w) => ({
    amplitude: uniform(w.amplitude),
    wavelength: uniform(w.wavelength),
    direction: uniform(vec2(w.direction[0], w.direction[1])),
    steepness: uniform(w.steepness),
    speed: uniform(w.speed),
    phase: uniform(w.phase ?? 0),
  }));

  const gerstnerDisplacement = Fn(([pos]) => {
    const count = float(waveUniforms.length);
    const disp = vec3(0).toVar();

    for (const wu of waveUniforms) {
      const k = float(TAU).div(wu.wavelength);
      const omega = k.sqrt().mul(Math.sqrt(GRAVITY)).mul(wu.speed).mul(waveSpeed);
      const f = k.mul(dot(wu.direction, pos.xz)).sub(omega.mul(time)).add(wu.phase);
      const a = wu.amplitude.mul(waveAmp);
      const q = wu.steepness.div(k.mul(a).mul(count)).clamp(0, 1);

      disp.x.addAssign(q.mul(a).mul(wu.direction.x).mul(cos(f)));
      disp.y.addAssign(a.mul(sin(f)));
      disp.z.addAssign(q.mul(a).mul(wu.direction.y).mul(cos(f)));
    }

    return disp;
  });

  const displacedPosition = Fn(() => {
    const base = positionLocal.toVar();
    return base.add(gerstnerDisplacement(base));
  });

  const displacedNormal = Fn(() => {
    const eps = float(0.04);
    const p = positionLocal;
    const h = gerstnerDisplacement(p).y;
    const hx = gerstnerDisplacement(p.add(vec3(eps, 0, 0))).y;
    const hz = gerstnerDisplacement(p.add(vec3(0, 0, eps))).y;
    const dx = hx.sub(h).div(eps);
    const dz = hz.sub(h).div(eps);
    return vec3(dx.negate(), 1, dz.negate()).normalize();
  });

  return {
    waveSpeed,
    waveAmp,
    waveUniforms,
    displacedPosition,
    displacedNormal,
    updateFromPreset(wavesResolved, ampScale = 1) {
      waveUniforms.forEach((wu, i) => {
        const w = wavesResolved[i];
        wu.amplitude.value = w.amplitude * ampScale;
        wu.wavelength.value = w.wavelength;
        wu.direction.value.set(w.direction[0], w.direction[1]);
        wu.steepness.value = w.steepness;
        wu.speed.value = w.speed;
        wu.phase.value = w.phase ?? 0;
      });
    },
  };
}
