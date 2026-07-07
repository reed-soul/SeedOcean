// FFT ocean integration — simulator + render mesh + wake + reflector.
// Mesh is a camera-snapped clipmap for open water, or a finite patch for
// bounded water (pool/lake) — selected by preset.waterType.

import { WakeField } from './wake-field.js';
import { OceanSimulator } from './fft/ocean-simulator.js';
import { createFFTSurfaceMaterial, createShadingUniforms, applyShadingUniforms } from './fft/surface-material.js';
import { buildSpectrumParams } from './fft/defaults.js';
import { buildClipmapMesh } from './clipmap.js';
import { buildPatchMesh } from './water-patch.js';

/**
 * @param {import('three/webgpu').WebGPURenderer} renderer
 * @param {object} preset
 * @param {object} state — live UI state
 * @param {'perf'|'quality'} [quality='perf'] — selects FFT grid size (128² vs 256²)
 */
export async function buildFFTOcean(renderer, preset, state, quality = 'perf') {
  const spectrumParams = buildSpectrumParams(preset, state, quality);
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

  // Select mesh by water type. Both builders return { root, mesh, update, ... }
  // and the surface shader is mesh-agnostic (samples positionLocal.xz + clipOrigin).
  const waterType = preset.waterType ?? 'ocean';
  let surface;
  if (waterType === 'pool' || waterType === 'lake') {
    surface = buildPatchMesh(material, preset.patch ?? { width: 40, length: 40, cells: 64 });
    // Bounded water: clipOrigin stays at (0,0); patch vertices are local-to-origin.
  } else {
    surface = buildClipmapMesh(material, { patchHalf: 56, levels: 4, cells: 32 });
  }
  surface.root.add(surfaceReflector.target);

  function applyPreset(nextPreset, nextState) {
    const params = buildSpectrumParams(nextPreset, nextState, quality);
    simulator.setSeed(nextState.seed);
    simulator.applyParams(params);
    applyShadingUniforms(shading, nextPreset, nextState);
    return simulator.updateInitialSpectrum();
  }

  function applyLiveTuning(nextPreset, nextState) {
    const params = buildSpectrumParams(nextPreset, nextState, quality);
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
    surface.update(camera);
    // clipOrigin tracks the mesh root so positionLocal.xz + clipOrigin gives
    // world XZ. Clipmap snaps root to camera; bounded patch root is fixed.
    shading.clipOrigin.value.set(surface.root.position.x, surface.root.position.z);
  }

  function setUnderwaterMix(mix) {
    shading.underwaterMix.value = mix;
  }

  function stampWake(x, z, vx, vz, radius = 4, strength = 1) {
    wakeField.stamp(x, z, vx, vz, radius, strength);
  }

  return {
    root: surface.root,
    mesh: surface.mesh,
    clipmap: surface,
    simulator,
    shading,
    wakeField,
    spectrumParams,
    waterType,
    applyPreset,
    applyLiveTuning,
    setSunDirection,
    setUnderwaterMix,
    evolve,
    updateClipmap,
    stampWake,
  };
}

