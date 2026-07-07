// FFT ocean surface — world-space sampling, SSS, Jacobian foam, screen refraction/reflection, wake.

import * as THREE from 'three/webgpu';
import {
  Fn, positionLocal, positionWorld, cameraPosition, vec2, vec3, vec4, float,
  texture, normalize, dot, max, pow, mix, saturate, smoothstep, uniform, time,
  screenUV, viewportSafeUV, viewportSharedTexture, reflector, fract, floor, step,
} from 'three/tsl';
import { makeDetailTexture } from './detail-texture.js';

/**
 * @param {import('./ocean-cascade.js').OceanCascade[]} cascades
 * @param {number[]} lengthScales
 * @param {ReturnType<typeof createShadingUniforms>} shading
 * @param {import('../wake-field.js').WakeField} [wakeField]
 */
export function createFFTSurfaceMaterial(cascades, lengthScales, shading, wakeField = null) {
  const mat = new THREE.MeshPhysicalNodeMaterial({
    transparent: true,
    side: THREE.DoubleSide,
    depthWrite: true,
  });

  const detailTex = makeDetailTexture();
  // World-space XZ for texture sampling = local XZ + a mesh-origin offset.
  // We use positionLocal (not positionWorld) to avoid a circular dependency:
  // positionNode displaces positionLocal, and displacement is sampled at
  // worldXZ — so worldXZ must not itself depend on the displaced position.
  // clipOrigin supplies the world offset (clipmap snaps it to camera; finite
  // patches leave it at their mesh origin).
  //
  // River flow: subtract a time-varying offset so the FFT waves (which are
  // spatially periodic with zero net drift) appear to scroll downstream. The
  // offset is in *cascade-length-normalized* UV space, so we apply it per
  // cascade below rather than here. The un-flowed worldXZ is kept for wake /
  // detail / caustic sampling (those shouldn't drift).
  const worldXZ = positionLocal.xz.add(shading.clipOrigin);
  // Per-frame flow offset in world meters = flowDir (unit) * flowSpeed * t.
  const flowOffset = shading.flowDir.mul(shading.flowSpeed).mul(time);

  const wakeTex = wakeField ? texture(wakeField.texture) : null;
  const wakeExtent = uniform(wakeField?.worldExtent ?? 220);

  const groundReflector = reflector({ resolutionScale: 0.45, bounces: false });

  mat.positionNode = Fn(() => {
    const disp = vec3(0).toVar();
    cascades.forEach((c, i) => {
      // Flow: scroll the sample upstream so waves appear to move downstream.
      // Offset is scaled into each cascade's UV space (worldXZ / lengthScale).
      const uv = worldXZ.div(lengthScales[i]).sub(flowOffset.div(lengthScales[i]));
      disp.addAssign(texture(c.displacement, uv).xyz);
    });
    if (wakeTex) {
      const wakeUV = fract(worldXZ.div(wakeExtent));
      const wake = wakeTex.sample(wakeUV);
      disp.y.addAssign(wake.r.div(255).mul(shading.wakeHeight));
    }
    return positionLocal.add(disp);
  })();

  const normalFromMaps = Fn(() => {
    const d = vec4(0).toVar();
    cascades.forEach((c, i) => {
      const uv = worldXZ.div(lengthScales[i]).sub(flowOffset.div(lengthScales[i]));
      d.addAssign(texture(c.derivatives, uv));
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

  groundReflector.uvNode = groundReflector.uvNode.add(nNode.xz.mul(shading.reflectDistort));

  mat.colorNode = Fn(() => {
    const N = nNode;
    const V = normalize(cameraPosition.sub(positionWorld));
    const fresnel = pow(float(1).sub(max(dot(N, V), 0)), 3).saturate();
    // Cel-shaded fresnel: quantize into discrete bands when stylized > 0.
    const fresnelCel = floor(fresnel.mul(shading.celBands)).div(shading.celBands);
    const fres = mix(fresnel, fresnelCel, shading.stylized);
    const depthTint = mix(
      smoothstep(float(-3), float(6), positionWorld.y),
      floor(smoothstep(float(-3), float(6), positionWorld.y).mul(shading.celBands)).div(shading.celBands),
      shading.stylized,
    );

    const heightFactor = saturate(positionWorld.y.mul(0.4).add(0.3));
    const H = normalize(N.negate().add(shading.sunDir));
    const sssRaw = pow(saturate(dot(V, H.negate())), 4).mul(shading.sssStrength).mul(heightFactor);
    // Cel SSS — hard step instead of smooth falloff.
    const sssCel = step(float(0.5), sssRaw).mul(shading.sssStrength).mul(heightFactor);
    const sss = mix(sssRaw, sssCel, shading.stylized);

    const shallow = mix(shading.waterColor, shading.scatterColor, sss);
    const body = mix(shading.deepColor, shallow, depthTint);
    const spec = shading.foamColor.mul(fres.mul(shading.foamStrength));

    const foamRaw = float(0).toVar();
    cascades.forEach((c, i) => {
      // Advected/persistent foam (0..~several). Threshold + scale map it to coverage.
      // Flow scroll here too, so foam drifts with the waves + downstream current.
      const uv = worldXZ.div(lengthScales[i]).sub(flowOffset.div(lengthScales[i]));
      const foam = texture(c.foam, uv).x;
      foamRaw.addAssign(saturate(foam.sub(shading.foamThreshold).mul(shading.foamScale)));
    });

    if (wakeTex) {
      const wakeUV = fract(worldXZ.div(wakeExtent));
      foamRaw.addAssign(wakeTex.sample(wakeUV).g.div(255).mul(shading.wakeFoam));
    }

    // Cartoon foam: hard edge instead of smoothstep.
    const coverageReal = smoothstep(float(0.2), float(0.9), foamRaw);
    const coverageCel = step(shading.foamThreshold, foamRaw);
    const coverage = mix(coverageReal, coverageCel, shading.stylized);
    const foam = shading.foamColor.mul(float(0.55).add(saturate(dot(N, shading.sunDir)).mul(0.55)));

    let surface = mix(body.add(spec), foam, coverage);

    const below = smoothstep(float(0.15), float(0.85), shading.underwaterMix)
      .mul(smoothstep(positionWorld.y, float(0), cameraPosition.y));
    surface = mix(surface, shading.deepColor.mul(0.35), below.mul(0.75));

    const refOffset = N.xz.mul(shading.refractionDistort);
    const refracted = viewportSharedTexture(viewportSafeUV(screenUV.add(refOffset)));
    // Stylized mode suppresses refraction AND reflection so the water reads as
    // flat cartoon color bands rather than a see-through/reflective surface
    // (both sampled backdrops would otherwise dominate and wash out the cel look).
    const reflectance = fres.mul(shading.reflectionStrength).mul(float(1).sub(shading.stylized)).saturate();
    const refractAmt = float(1).sub(reflectance).mul(shading.refractionStrength).mul(float(1).sub(shading.stylized)).saturate();
    const aboveWater = float(1).sub(below);
    surface = mix(surface, refracted.rgb, refractAmt.mul(aboveWater));
    surface = mix(surface, groundReflector.rgb, reflectance.mul(aboveWater));

    // Global posterize: quantize the final color into celBands steps. This is
    // the single most effective cartoon cue — it bands EVERY color transition
    // (depth, fresnel, sss, foam) uniformly, giving the Wind Waker / Genshin
    // read that per-channel cel branches alone can't achieve.
    const surfaceCel = floor(surface.mul(shading.celBands)).div(shading.celBands);
    return mix(surface, surfaceCel, shading.stylized);
  })();

  mat.roughnessNode = shading.roughness;
  mat.metalnessNode = shading.metalness;

  return { material: mat, detailTex, reflector: groundReflector };
}

export function createShadingUniforms(preset) {
  return {
    clipOrigin: uniform(new THREE.Vector2()),
    underwaterMix: uniform(0),
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
    refractionStrength: uniform(preset.refractionStrength ?? 0.72),
    reflectionStrength: uniform(preset.reflectionStrength ?? 0.55),
    refractionDistort: uniform(preset.refractionDistort ?? 0.038),
    reflectDistort: uniform(preset.reflectDistort ?? 0.018),
    wakeHeight: uniform(preset.wakeHeight ?? 0.85),
    wakeFoam: uniform(preset.wakeFoam ?? 0.9),
    // Stylized/cel rendering: 0 = realistic (default), 1 = full cartoon.
    // NOTE: initialize to a tiny non-zero value to prevent TSL from constant-
    // folding the mix() branches when the initial value is exactly 0; the real
    // value is set by applyShadingUniforms on build + every preset switch.
    stylized: uniform(0.001),
    celBands: uniform(preset.celBands ?? 4),
    // River flow: direction (unit vec2) + speed (m/s). Zero speed disables flow
    // scrolling (oceans/pools/lakes), so the uniform cost is one mad per cascade.
    flowDir: uniform(new THREE.Vector2(0, 0)),
    flowSpeed: uniform(0),
  };
}

export function applyShadingUniforms(shading, preset, state) {
  // River flow — read preset.flow (dir + speed), normalize the direction.
  if (preset.flow) {
    const [fx, fz] = preset.flow.dir;
    const len = Math.hypot(fx, fz) || 1;
    shading.flowDir.value.set(fx / len, fz / len);
    shading.flowSpeed.value = preset.flow.speed ?? 0;
  } else {
    shading.flowDir.value.set(0, 0);
    shading.flowSpeed.value = 0;
  }
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
  shading.refractionStrength.value = state.refractionStrength ?? preset.refractionStrength ?? 0.72;
  shading.reflectionStrength.value = state.reflectionStrength ?? preset.reflectionStrength ?? 0.55;
  // Stylized mode is a uniform (not a rebuild), so it hot-swaps on preset change.
  shading.stylized.value = preset.renderMode === 'stylized' ? 1 : 0;
  shading.celBands.value = preset.celBands ?? 4;
}
