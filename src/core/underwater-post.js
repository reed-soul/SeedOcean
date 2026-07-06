// Underwater post-process — depth tint, Snell's window, volumetric god rays.

import * as THREE from 'three/webgpu';
import { RenderPipeline } from 'three/webgpu';
import {
  pass, uniform, mix, smoothstep, vec3, vec4, float, screenUV, dot, normalize, pow, max,
} from 'three/tsl';

/**
 * @param {THREE.WebGPURenderer} renderer
 * @param {THREE.Scene} scene
 * @param {THREE.Camera} camera
 */
export function createUnderwaterPipeline(renderer, scene, camera) {
  const underwaterMix = uniform(0);
  const underwaterColor = uniform(new THREE.Color(0x043a55));
  const sunDir = uniform(new THREE.Vector3(0, 1, 0));
  const godRayStrength = uniform(0.22);

  const scenePass = pass(scene, camera);
  const sceneColor = scenePass.getTextureNode('output');

  const fogged = mix(sceneColor, vec4(underwaterColor, 1), underwaterMix.mul(0.58));

  const snellAmt = smoothstep(float(0.4), float(0.98), screenUV.y).mul(underwaterMix).mul(0.42);
  const snellColor = vec4(0.42, 0.74, 0.98, 1);
  const withSnell = mix(fogged, snellColor, snellAmt);

  const rayDir = normalize(vec3(screenUV.sub(0.5).mul(1.15), float(-0.7)));
  const sunDot = max(dot(rayDir, sunDir), 0);
  const rays = pow(sunDot, float(14)).mul(underwaterMix).mul(godRayStrength);
  const final = vec4(withSnell.rgb.add(vec3(rays)), 1);

  const pipeline = new RenderPipeline(renderer);
  pipeline.outputNode = final;

  return {
    pipeline,
    scenePass,
    uniforms: { underwaterMix, underwaterColor, sunDir, godRayStrength },
    render() {
      pipeline.render();
    },
    setPreset(preset) {
      underwaterColor.value.set(preset.underwaterColor ?? 0x043a55);
      godRayStrength.value = preset.godRayStrength ?? 0.22;
    },
  };
}
