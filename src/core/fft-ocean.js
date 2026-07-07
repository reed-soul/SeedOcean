// FFT ocean integration — simulator + render mesh + wake + reflector.
// Mesh is a camera-snapped clipmap for open water, or a finite patch for
// bounded water (pool/lake) — selected by preset.waterType.

import { WakeField } from './wake-field.js';
import { OceanSimulator } from './fft/ocean-simulator.js';
import { createFFTSurfaceMaterial, createShadingUniforms, applyShadingUniforms } from './fft/surface-material.js';
import { buildSpectrumParams } from './fft/defaults.js';
import { buildClipmapMesh } from './clipmap.js';
import { buildPatchMesh } from './water-patch.js';
import { buildRiverMesh, defaultRiverCenterline } from './river-mesh.js';

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
    // Lakes default to a circular disc so the shoreline reads as a basin;
    // pools stay rectangular. preset.patch can override shape explicitly.
    const patchDefaults = waterType === 'lake'
      ? { width: 80, length: 80, cells: 96, shape: 'circle', segments: 96 }
      : { width: 40, length: 40, cells: 64, shape: 'rect' };
    surface = buildPatchMesh(material, { ...patchDefaults, ...(preset.patch ?? {}) });
    // Bounded water: clipOrigin stays at (0,0); patch vertices are local-to-origin.
  } else if (waterType === 'river') {
    // Ribbon mesh extruded along a Catmull-Rom centerline. The surface shader
    // is unchanged — flow is achieved by scrolling the cascade UVs by
    // flowDir*flowSpeed*time, set in applyShadingUniforms from preset.flow.
    const river = preset.river ?? {};
    const points = river.points ?? defaultRiverCenterline(river.length ?? 160, river.meander ?? 12);
    surface = buildRiverMesh(material, {
      points,
      width: river.width ?? 14,
      lengthSegs: river.lengthSegs ?? 128,
      crossSegs: river.crossSegs ?? 16,
    });
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

