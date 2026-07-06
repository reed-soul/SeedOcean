// WebGL2-friendly Gerstner ocean — used when WebGPU / compute is unavailable.
//
// The vertex shader sums N Gerstner waves (derived from the preset's wind /
// fetch parameters) for displacement + normal. Buoyancy is sampled analytically
// from the same wave set on the CPU — no GPU readback. Foam and SSS are
// approximated in the fragment shader. This is intentionally simpler than the
// FFT path; it exists so the API and visual identity hold on Safari/mobile.

import * as THREE from 'three/webgpu';
import { buildClipmapMesh } from '../clipmap.js';

const MAX_WAVES = 16;

/**
 * Derive a Gerstner wave set from a preset's spectrum parameters.
 * Returns an array of { dir, amplitude, wavelength, speed, steepness }.
 */
function deriveWaves(preset, state) {
  const local = preset.spectrum?.local ?? {};
  const swell = preset.spectrum?.swell ?? {};
  const windSpeed = (local.windSpeed ?? 10) * (state.waveSpeed ?? 1);
  const windDirRad = ((state.windDirection ?? preset.sky?.azimuth ?? 0) * Math.PI) / 180;
  const amp = state.waveAmp ?? 1;

  const waves = [];
  // Wind-sea band: shorter wavelengths.
  const localCount = 8;
  for (let i = 0; i < localCount; i++) {
    const t = i / localCount;
    const wavelength = 6 + t * 22;                   // 6..28 m
    const spread = (Math.random() - 0.5) * 0.9;      // ±~26° around wind
    const dir = windDirRad + spread;
    const amp_i = (0.35 * (1 - t) + 0.08) * amp * (local.scale ?? 1);
    waves.push({
      dir,
      amplitude: Math.max(0.05, amp_i),
      wavelength,
      speed: 1.2 * Math.sqrt(9.81 * wavelength / (2 * Math.PI)) * 0.5,
      steepness: 0.6 - t * 0.25,
    });
  }
  // Swell band: a few long waves.
  const swellCount = 4;
  for (let i = 0; i < swellCount; i++) {
    const t = i / swellCount;
    const wavelength = 40 + t * 60;                  // 40..100 m
    const spread = (Math.random() - 0.5) * 0.3;
    const dir = windDirRad + spread + 0.2;
    const amp_i = (0.5 - t * 0.08) * (swell.scale ?? 0.7);
    waves.push({
      dir,
      amplitude: Math.max(0.05, amp_i),
      wavelength,
      speed: 1.2 * Math.sqrt(9.81 * wavelength / (2 * Math.PI)) * 0.5,
      steepness: 0.7,
    });
  }
  return waves.slice(0, MAX_WAVES);
}

/**
 * Build a Gerstner-wave ocean. Mirrors the FFT ocean's public shape closely
 * enough for SeedOcean's renderer/scene wiring to work.
 */
export async function buildGerstnerOcean(renderer, preset, state) {
  const clipmap = buildClipmapMesh(new THREE.MeshBasicMaterial(), {
    patchHalf: 56,
    levels: 4,
    cells: 24,
  });

  const waves = deriveWaves(preset, state);

  // Pack wave params into typed arrays — GLSL array uniforms consume these directly.
  const uDirs = new Float32Array(MAX_WAVES * 2);
  const uAmps = new Float32Array(MAX_WAVES);
  const uWavenumbers = new Float32Array(MAX_WAVES);
  const uSpeeds = new Float32Array(MAX_WAVES);
  const uSteep = new Float32Array(MAX_WAVES);
  for (let i = 0; i < MAX_WAVES; i++) {
    const w = waves[i];
    if (w) {
      uDirs[i * 2] = Math.cos(w.dir);
      uDirs[i * 2 + 1] = Math.sin(w.dir);
      uAmps[i] = w.amplitude;
      uWavenumbers[i] = (2 * Math.PI) / w.wavelength;
      uSpeeds[i] = w.speed;
      uSteep[i] = w.steepness;
    }
  }

  const uniforms = {
    uTime: { value: 0 },
    uDirs: { value: uDirs },
    uAmps: { value: uAmps },
    uWavenumbers: { value: uWavenumbers },
    uSpeeds: { value: uSpeeds },
    uSteep: { value: uSteep },
    uWaveCount: { value: waves.length },
    uSunDir: { value: new THREE.Vector3(0, 1, 0) },
    uWaterColor: { value: new THREE.Color(preset.waterColor ?? 0x0a5f7a) },
    uDeepColor: { value: new THREE.Color(preset.deepColor ?? 0x021a2b) },
    uScatterColor: { value: new THREE.Color(preset.scatterColor ?? 0x2e8f8f) },
    uFoamColor: { value: new THREE.Color(preset.foamColor ?? 0xd0ecff) },
    uFoamStrength: { value: preset.foamStrength ?? 0.32 },
    uSSS: { value: preset.sssStrength ?? 0.85 },
    uRoughness: { value: preset.roughness ?? 0.1 },
  };

  const vertexShader = /* glsl */ `
    uniform float uTime;
    uniform vec2 uDirs[${MAX_WAVES}];
    uniform float uAmps[${MAX_WAVES}];
    uniform float uWavenumbers[${MAX_WAVES}];
    uniform float uSpeeds[${MAX_WAVES}];
    uniform float uSteep[${MAX_WAVES}];
    uniform int uWaveCount;
    varying vec3 vWorldPos;
    varying vec3 vNormal;
    varying float vCrest;

    void main() {
      vec3 pos = position;
      vec3 displaced = vec3(pos.x, 0.0, pos.z);
      vec3 dPdx = vec3(1.0, 0.0, 0.0);
      vec3 dPdz = vec3(0.0, 0.0, 1.0);

      for (int i = 0; i < ${MAX_WAVES}; i++) {
        if (i >= uWaveCount) break;
        vec2 dir = uDirs[i];
        float k = uWavenumbers[i];
        float a = uAmps[i];
        float phase = k * dot(dir, pos.xz) - uSpeeds[i] * k * uTime;
        float c = cos(phase);
        float s = sin(phase);
        float QA = uSteep[i] * a;
        displaced.x += QA * dir.x * c;
        displaced.z += QA * dir.y * c;
        displaced.y += a * s;
        // Accumulate partials for normal.
        dPdx.x -= QA * dir.x * dir.x * k * s;
        dPdx.z -= QA * dir.x * dir.y * k * s;
        dPdx.y += a * dir.x * k * c;
        dPdz.x -= QA * dir.x * dir.y * k * s;
        dPdz.z -= QA * dir.y * dir.y * k * s;
        dPdz.y += a * dir.y * k * c;
      }

      vNormal = normalize(cross(dPdz, dPdx));
      vCrest = clamp(displaced.y * 0.4 + 0.3, 0.0, 1.0);
      vec4 world = modelMatrix * vec4(displaced, 1.0);
      vWorldPos = world.xyz;
      gl_Position = projectionMatrix * viewMatrix * world;
    }
  `;

  const fragmentShader = /* glsl */ `
    precision highp float;
    uniform vec3 uSunDir;
    uniform vec3 uWaterColor;
    uniform vec3 uDeepColor;
    uniform vec3 uScatterColor;
    uniform vec3 uFoamColor;
    uniform float uFoamStrength;
    uniform float uSSS;
    uniform float uRoughness;
    varying vec3 vWorldPos;
    varying vec3 vNormal;
    varying float vCrest;

    void main() {
      vec3 N = normalize(vNormal);
      vec3 V = normalize(cameraPosition - vWorldPos);
      float fres = pow(1.0 - max(dot(N, V), 0.0), 3.0);
      vec3 H = normalize(N + uSunDir);
      float sss = pow(max(dot(V, -H), 0.0), 4.0) * uSSS * vCrest;
      vec3 shallow = mix(uWaterColor, uScatterColor, sss);
      float depthTint = smoothstep(-3.0, 6.0, vWorldPos.y);
      vec3 body = mix(uDeepColor, shallow, depthTint);
      // Crest foam: steep, high crests foam up.
      float foam = smoothstep(0.6, 1.0, vCrest) * uFoamStrength;
      foam += smoothstep(0.85, 1.0, dot(N, vec3(0.0, 1.0, 0.0))) * 0.0; // placeholder for SSS-tied foam
      vec3 surface = mix(body, uFoamColor, clamp(foam, 0.0, 1.0));
      surface += uFoamColor * fres * uFoamStrength * 0.4;
      gl_FragColor = vec4(surface, 1.0);
    }
  `;

  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader,
    fragmentShader,
    side: THREE.DoubleSide,
  });

  // Replace the clipmap's placeholder material.
  clipmap.mesh.material = material;
  clipmap.mesh.frustumCulled = false;

  const sunDirVec = new THREE.Vector3();

  /** Analytical Gerstner height at world XZ — CPU-side, no readback. */
  function getHeight(x, z) {
    let h = 0;
    const t = uniforms.uTime.value;
    const count = uniforms.uWaveCount.value;
    for (let i = 0; i < count; i++) {
      const dir = uDirs[i * 2];
      const dir2 = uDirs[i * 2 + 1];
      const k = uWavenumbers[i];
      const phase = k * (dir * x + dir2 * z) - uSpeeds[i] * k * t;
      h += uAmps[i] * Math.sin(phase);
    }
    return h;
  }

  return {
    root: clipmap.root,
    mesh: clipmap.mesh,
    clipmap,
    material,
    uniforms,
    // Mimic the FFT ocean's shape enough for SeedOcean's wiring.
    simulator: {
      N: 0, // signal "no FFT"
      cascades: [],
      get foamPersistence() { return { value: 0 }; },
      evolve(tNow) { uniforms.uTime.value = tNow; },
      setSeed() {},
      applyParams() {},
      async updateInitialSpectrum() {},
    },
    shading: {
      sunDir: { value: sunDirVec },
      clipOrigin: { value: new THREE.Vector2() },
      underwaterMix: { value: 0 },
    },
    wakeField: null,
    spectrumParams: {},
    applyPreset(nextPreset, nextState) {
      const newWaves = deriveWaves(nextPreset, nextState);
      for (let i = 0; i < MAX_WAVES; i++) {
        const w = newWaves[i];
        if (w) {
          uAmps[i] = w.amplitude;
          uWavenumbers[i] = (2 * Math.PI) / w.wavelength;
          uSpeeds[i] = w.speed;
          uSteep[i] = w.steepness;
          uDirs[i * 2] = Math.cos(w.dir);
          uDirs[i * 2 + 1] = Math.sin(w.dir);
        } else {
          uAmps[i] = 0;
        }
      }
      uniforms.uWaveCount.value = newWaves.length;
      uniforms.uWaterColor.value.set(nextPreset.waterColor ?? 0x0a5f7a);
      uniforms.uDeepColor.value.set(nextPreset.deepColor ?? 0x021a2b);
      uniforms.uScatterColor.value.set(nextPreset.scatterColor ?? 0x2e8f8f);
      uniforms.uFoamColor.value.set(nextPreset.foamColor ?? 0xd0ecff);
      uniforms.uFoamStrength.value = nextState.foamStrength ?? nextPreset.foamStrength ?? 0.32;
      uniforms.uSSS.value = nextState.sssStrength ?? nextPreset.sssStrength ?? 0.85;
      uniforms.uRoughness.value = nextState.roughness ?? nextPreset.roughness ?? 0.1;
    },
    applyLiveTuning(p, s) { this.applyPreset(p, s); },
    setSunDirection(dir) { sunDirVec.copy(dir); uniforms.uSunDir.value.copy(dir); },
    setUnderwaterMix() {},
    evolve(t, dt, timeScale = 1) { uniforms.uTime.value = t * timeScale; },
    updateClipmap(camera) {
      clipmap.update(camera);
      uniforms.value; // noop ref
    },
    stampWake() {},
    // Analytical sampler for buoyancy.
    getHeight,
    isFallback: true,
  };
}
