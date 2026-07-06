// FFT ocean integration — simulator + render mesh.

import * as THREE from 'three/webgpu';
import { OceanSimulator } from './fft/ocean-simulator.js';
import { createFFTSurfaceMaterial, createShadingUniforms, applyShadingUniforms } from './fft/surface-material.js';
import { buildSpectrumParams } from './fft/defaults.js';

const MESH_SIZE = 600;
const MESH_SEGMENTS = 256;

/**
 * @param {THREE.WebGPURenderer} renderer
 * @param {object} preset
 * @param {object} state — live UI state
 */
export async function buildFFTOcean(renderer, preset, state) {
  const spectrumParams = buildSpectrumParams(preset, state);
  const simulator = new OceanSimulator(renderer, spectrumParams);
  await simulator.updateInitialSpectrum();

  const shading = createShadingUniforms(preset);
  applyShadingUniforms(shading, preset, state);

  const { material } = createFFTSurfaceMaterial(
    simulator.cascades,
    spectrumParams.lengthScales,
    shading,
  );

  const geometry = new THREE.PlaneGeometry(MESH_SIZE, MESH_SIZE, MESH_SEGMENTS, MESH_SEGMENTS);
  geometry.rotateX(-Math.PI / 2);

  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'SeedOcean_FFT';
  mesh.frustumCulled = false;

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
  }

  return {
    mesh,
    simulator,
    shading,
    spectrumParams,
    applyPreset,
    applyLiveTuning,
    setSunDirection,
    evolve,
  };
}
