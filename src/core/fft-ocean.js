// FFT ocean integration — simulator + render mesh + wake + flowmap + reflector.
// Mesh is a camera-snapped clipmap for open water, or a finite patch for
// bounded water (pool/lake) — selected by preset.waterType.

import { WakeField } from './wake-field.js';
import { FlowMap, bakeFlowMapForPreset, normalizeFlowMapConfig, populateFlowMap } from './flow-map.js';
import { OceanSimulator } from './fft/ocean-simulator.js';
import { createFFTSurfaceMaterial, createShadingUniforms, applyShadingUniforms } from './fft/surface-material.js';
import { buildSpectrumParams } from './fft/defaults.js';
import { buildClipmapMesh } from './clipmap.js';
import { buildPatchMesh } from './water-patch.js';
import { buildRiverMesh, defaultRiverCenterline } from './river-mesh.js';
import { waterTypeOf, usesPatchMesh, WATER } from './water-types.js';

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

  // FlowMap: lake/river/coast bake content; ocean/pool stay null unless the
  // preset embeds painter pixels. Opt out with `flowmap: false`. For the
  // shoreline painter (11d) the demo always wants a map — allocate a blank
  // one when bake returns null so strokes have a texture binding.
  let flowMap = bakeFlowMapForPreset(preset);
  if (!flowMap && preset.flowmap !== false) {
    flowMap = new FlowMap(256, 220);
  }

  const shading = createShadingUniforms(preset);
  applyShadingUniforms(shading, preset, state);

  const { material, reflector: surfaceReflector, detailTex } = createFFTSurfaceMaterial(
    simulator.cascades,
    spectrumParams.lengthScales,
    shading,
    wakeField,
    flowMap,
  );

  // Select mesh by water type. Builders return { root, mesh, update, ... }
  // and the surface shader is mesh-agnostic (samples positionLocal.xz + clipOrigin).
  // Coast uses the open-ocean clipmap — the beach is the terrain seafloor, not
  // a finite water patch (waves must continue past the waterline into the bay).
  const waterType = waterTypeOf(preset);
  let surface;
  if (usesPatchMesh(waterType)) {
    // Lakes default to a circular disc so the shoreline reads as a basin;
    // pools stay rectangular. preset.patch can override shape explicitly.
    const patchDefaults = waterType === WATER.LAKE
      ? { width: 80, length: 80, cells: 96, shape: 'circle', segments: 96 }
      : { width: 40, length: 40, cells: 64, shape: 'rect' };
    surface = buildPatchMesh(material, { ...patchDefaults, ...(preset.patch ?? {}) });
    // Bounded water: clipOrigin stays at (0,0); patch vertices are local-to-origin.
  } else if (waterType === WATER.RIVER) {
    // Ribbon mesh extruded along a Catmull-Rom centerline. Flow scrolling is
    // driven by FlowMap (per-texel river tangents) with preset.flow as the
    // base speed the map's B channel scales.
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
    // Re-bake flowmap in place when the water type stays the same (rebuild
    // path handles type changes by constructing a fresh ocean). Same-type
    // switches (e.g. lake → lake with different shore band) just rewrite
    // the existing texture so the material binding stays valid.
    if (flowMap) rebakeFlowMap(flowMap, nextPreset);
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
    flowMap,
    reflector: surfaceReflector,
    detailTex,
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

/**
 * Rewrite an existing FlowMap from a new preset without reallocating the
 * DataTexture (keeps the material's texture() node + extent uniform valid).
 * World extent and resolution stay locked to the values chosen at ocean build.
 * @param {import('./flow-map.js').FlowMap} flowMap
 * @param {object} preset
 */
function rebakeFlowMap(flowMap, preset) {
  const cfg = normalizeFlowMapConfig(preset.flowmap, preset);
  if (cfg) populateFlowMap(flowMap, preset, cfg);
  else flowMap.clear();
  // Painter round-trip: embedded pixels override the procedural bake.
  if (preset.flowmap?.pixels) flowMap.fromJSON(preset.flowmap);
  else flowMap.upload();
}
