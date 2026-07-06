// FFT ocean surface — world-space sampling, SSS, Jacobian foam.
// Shading adapted from poseidon (MIT) / gasgiant FFT-Ocean (MIT).

import * as THREE from 'three/webgpu';
import {
  Fn, positionWorld, cameraPosition, vec2, vec3, vec4, float,
  texture, normalize, dot, max, pow, mix, saturate, smoothstep, uniform, time,
} from 'three/tsl';
import { makeDetailTexture } from './detail-texture.js';

export function createFFTSurfaceMaterial(cascades, lengthScales, shading) {
  const mat = new THREE.MeshPhysicalNodeMaterial({
    transparent: true,
    side: THREE.DoubleSide,
    depthWrite: true,
  });

  const detailTex = makeDetailTexture();
  const worldXZ = positionLocal.xz.add(shading.clipOrigin);

  mat.positionNode = Fn(() => {
    const disp = vec3(0).toVar();
    cascades.forEach((c, i) => {
      disp.addAssign(texture(c.displacement, worldXZ.div(lengthScales[i])).xyz);
    });
    return positionLocal.add(disp);
  })();

  const normalFromMaps = Fn(() => {
    const d = vec4(0).toVar();
    cascades.forEach((c, i) => {
      d.addAssign(texture(c.derivatives, worldXZ.div(lengthScales[i])));
    });
    const slopeX = d.x.div(float(1).add(d.z));
    const slopeZ = d.y.div(float(1).add(d.w));
    const N = normalize(vec3(slopeX.negate(), float(1), slopeZ.negate())).toVar();
    const t = time;
    const det1 = texture(detailTex, worldXZ.mul(0.06).add(vec2(t.mul(0.012), t.mul(0.008)))).xy.sub(0.5).mul(2);
    const det2 = texture(detailTex, worldXZ.mul(0.17).add(vec2(t.mul(-0.02), t.mul(0.015)))).xy.sub(0.5).mul(2);
    const detail = det1.add(det2.mul(0.5)).mul(shading.detail);
    return normalize(N.add(vec3(detail.x, 0, detail.y)));
  });

  const nNode = normalFromMaps();
  mat.normalNode = nNode;

  mat.colorNode = Fn(() => {
    const N = nNode;
    const V = normalize(cameraPosition.sub(positionWorld));
    const fresnel = pow(float(1).sub(max(dot(N, V), 0)), 3).saturate();
    const depthTint = smoothstep(float(-3), float(6), positionWorld.y);

    // Subsurface scatter — sun-lit crest glow (poseidon-style)
    const heightFactor = saturate(positionWorld.y.mul(0.4).add(0.3));
    const H = normalize(N.negate().add(shading.sunDir));
    const sss = pow(saturate(dot(V, H.negate())), 4).mul(shading.sssStrength).mul(heightFactor);

    const shallow = mix(shading.waterColor, shading.scatterColor, sss);
    const body = mix(shading.deepColor, shallow, depthTint);
    const spec = shading.foamColor.mul(fresnel.mul(shading.foamStrength));

    const foamRaw = float(0).toVar();
    cascades.forEach((c, i) => {
      if (i >= cascades.length - 1) return;
      const turb = texture(c.displacement, worldXZ.div(lengthScales[i])).w;
      foamRaw.addAssign(saturate(shading.foamThreshold.sub(turb).mul(shading.foamScale)));
    });
    const coverage = smoothstep(float(0.2), float(0.9), foamRaw);
    const foam = shading.foamColor.mul(float(0.55).add(saturate(dot(N, shading.sunDir)).mul(0.55)));

    return mix(body.add(spec), foam, coverage);
  })();

  mat.roughnessNode = shading.roughness;
  mat.metalnessNode = shading.metalness;

  return { material: mat, detailTex };
}

export function createShadingUniforms(preset) {
  return {
    clipOrigin: uniform(new THREE.Vector2()),
    waterColor: uniform(new THREE.Color(preset.waterColor ?? 0x0a5f7a)),
    deepColor: uniform(new THREE.Color(preset.deepColor ?? 0x021a2b)),
    scatterColor: uniform(new THREE.Color(preset.scatterColor ?? 0x2e8f8f)),
    foamColor: uniform(new THREE.Color(preset.foamColor ?? 0xd0ecff)),
    foamStrength: uniform(preset.foamStrength ?? 0.32),
    foamThreshold: uniform(preset.foamThreshold ?? 0.42),
    foamScale: uniform(preset.foamScale ?? 2.2),
    sssStrength: uniform(preset.sssStrength ?? 0.85),
    roughness: uniform(preset.roughness ?? 0.09),
    metalness: uniform(preset.metalness ?? 0.14),
    detail: uniform(0.08),
    sunDir: uniform(new THREE.Vector3(0, 1, 0)),
  };
}

export function applyShadingUniforms(shading, preset, state) {
  shading.waterColor.value.set(state.waterColor ?? preset.waterColor);
  shading.deepColor.value.set(state.deepColor ?? preset.deepColor);
  shading.scatterColor.value.set(preset.scatterColor ?? 0x2e8f8f);
  shading.foamColor.value.set(preset.foamColor);
  shading.foamStrength.value = state.foamStrength ?? preset.foamStrength;
  shading.foamThreshold.value = preset.foamThreshold ?? 0.42;
  shading.foamScale.value = preset.foamScale ?? 2.2;
  shading.sssStrength.value = state.sssStrength ?? preset.sssStrength ?? 0.85;
  shading.roughness.value = state.roughness ?? preset.roughness;
  shading.metalness.value = preset.metalness ?? 0.14;
}
