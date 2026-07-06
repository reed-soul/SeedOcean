// FFT ocean integration — simulator + clipmap render mesh + wake + reflector.

import { WakeField } from './wake-field.js';
import { OceanSimulator } from './fft/ocean-simulator.js';
import { createFFTSurfaceMaterial, createShadingUniforms, applyShadingUniforms } from './fft/surface-material.js';
import { buildSpectrumParams } from './fft/defaults.js';
import { buildClipmapMesh } from './clipmap.js';

/**
 * @param {import('three/webgpu').WebGPURenderer} renderer
 * @param {object} preset
 * @param {object} state — live UI state
 */
export async function buildFFTOcean(renderer, preset, state) {
  const spectrumParams = buildSpectrumParams(preset, state);
  const simulator = new OceanSimulator(renderer, spectrumParams);
  await simulator.updateInitialSpectrum();

  const wakeField = new WakeField(512, 220);
  const shading = createShadingUniforms(preset);
  applyShadingUniforms(shading, preset, state);

  const { material, reflector: surfaceReflector } = createFFTSurfaceMaterial(
    simulator.cascades,
    spectrumParams.lengthScales,
    shading,
    wakeField,
  );

  const clipmap = buildClipmapMesh(material, {
    patchHalf: 56,
    levels: 4,
    cells: 32,
  });
  clipmap.root.add(surfaceReflector.target);

  function applyPreset(nextPreset, nextState) {
    const params = buildSpectrumParams(nextPreset, nextState);
    simulator.setSeed(nextState.seed);
    simulator.applyParams(params);
    applyShadingUniforms(shading, nextPreset, nextState);
    return simulator.updateInitialSpectrum();
  }

  function applyLiveTuning(nextPreset, nextState) {
    const params = buildSpectrumParams(nextPreset, nextState);
    simulator.applyParams(params);
    applyShadingUniforms(shading, nextPreset, nextState);
  }

  function setSunDirection(dir) {
    shading.sunDir.value.copy(dir);
  }

  function evolve(t, dt, timeScale = 1) {
    simulator.evolve(t * timeScale, dt);
    wakeField.decay(dt);
    wakeField.upload();
  }

  function updateClipmap(camera) {
    clipmap.update(camera);
    shading.clipOrigin.value.set(clipmap.root.position.x, clipmap.root.position.z);
  }

  function setUnderwaterMix(mix) {
    shading.underwaterMix.value = mix;
  }

  function stampWake(x, z, vx, vz, radius = 4, strength = 1) {
    wakeField.stamp(x, z, vx, vz, radius, strength);
  }

  return {
    root: clipmap.root,
    mesh: clipmap.mesh,
    clipmap,
    simulator,
    shading,
    wakeField,
    spectrumParams,
    applyPreset,
    applyLiveTuning,
    setSunDirection,
    setUnderwaterMix,
    evolve,
    updateClipmap,
    stampWake,
  };
}
