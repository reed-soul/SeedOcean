// Shared procedural caustics — seafloor and submerged objects.

import { Fn, sin, cos, vec2, vec3, float, saturate, dot } from 'three/tsl';

/** Animated caustic intensity in world XZ (0–1). */
export const causticsPattern = Fn(([worldXZ, t]) => {
  const uv = worldXZ.mul(0.065);
  const layer1 = sin(uv.x.mul(9).add(t.mul(0.7))).mul(sin(uv.y.mul(8).sub(t.mul(0.5))));
  const layer2 = sin(uv.x.mul(14).sub(t.mul(0.4))).mul(cos(uv.y.mul(11).add(t.mul(0.6))));
  return layer1.add(layer2).mul(0.5).add(0.5).pow(2).mul(2.2).saturate();
});

/** Sun-facing factor for caustic brightness. */
export const causticsSunLit = Fn(([sunDir]) => (
  saturate(dot(vec3(0, 1, 0), sunDir).mul(0.5).add(0.5))
));
