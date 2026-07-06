// Per-cascade field maps: displacement + derivatives + a ping-pong foam field.
//
// Foam is a persistent, advected StorageTexture pair. Each frame:
//   1. `assemble` writes displacement/derivatives and stores the Jacobian-based
//      breaking intensity into displacement.w (the per-cell foam *source*).
//   2. `advect` reads the *previous* frame's foam from `foamFront`, back-traces
//      it by the horizontal displacement, decays it, adds the new breaking
//      source, and writes into `foamBack`.
//   3. The pair swaps so `foamFront` always holds the freshest state.
// `surface-material.js` samples `foamFront` for foam coverage.

import { StorageTexture, HalfFloatType, RepeatWrapping } from 'three/webgpu';
import {
  Fn, instanceIndex, uint, uvec2, vec4, vec2, float, max, min,
  texture, textureStore,
} from 'three/tsl';

function mapTexture(N) {
  const tex = new StorageTexture(N, N);
  tex.type = HalfFloatType;
  tex.wrapS = RepeatWrapping;
  tex.wrapT = RepeatWrapping;
  return tex;
}

export function createCascadeMaps(cascade, { N, lambda, dt, foamDecay }) {
  const displacement = mapTexture(N);
  const derivatives = mapTexture(N);

  // Foam ping-pong pair. `foamFront` is the one to sample; `foamBack` is the
  // one advect writes to. They swap each frame.
  const foamA = mapTexture(N);
  const foamB = mapTexture(N);
  let foamFront = foamA;
  let foamBack = foamB;

  // Assemble: write field maps + stash breaking intensity in displacement.w.
  const assemble = Fn(() => {
    const id = instanceIndex;
    const coord = uvec2(id.mod(uint(N)), id.div(uint(N)));
    const DxDz = cascade.DxDz.element(id);
    const DyDxz = cascade.DyDxz.element(id);
    const DyxDyz = cascade.DyxDyz.element(id);
    const DxxDzz = cascade.DxxDzz.element(id);

    const jxx = float(1).add(lambda.mul(DxxDzz.x));
    const jzz = float(1).add(lambda.mul(DxxDzz.y));
    const jxz = lambda.mul(DyDxz.y);
    const J = jxx.mul(jzz).sub(jxz.mul(jxz));

    // Breaking source: foam is generated where the flow is compressive (J < 1).
    const breaking = float(1).sub(min(J, float(1)));

    textureStore(displacement, coord, vec4(DxDz.x.mul(lambda), DyDxz.x, DxDz.y.mul(lambda), breaking)).toWriteOnly();
    textureStore(derivatives, coord, vec4(DyxDyz.x, DyxDyz.y, DxxDzz.x.mul(lambda), DxxDzz.y.mul(lambda))).toWriteOnly();
  })().compute(N * N);

  // Advect: half-Lagrangian back-trace by horizontal displacement, decay, add source.
  // `foamDecay` here is the *persistence* (0 = vanish instantly, 1 = hold almost forever);
  // the effective per-frame retention is mixed from this uniform.
  const advect = Fn(() => {
    const id = instanceIndex;
    const coord = uvec2(id.mod(uint(N)), id.div(uint(N)));
    const uv = vec2(coord).div(float(N));

    // Horizontal displacement at this cell (already written by assemble).
    const disp = texture(displacement, uv);
    const dx = disp.x;
    const dz = disp.z;
    const breaking = disp.w;

    // Back-trace: where did the foam at this cell come from?
    const Nf = float(N);
    const backUV = vec2(uv.x.sub(dx.div(Nf)), uv.y.sub(dz.div(Nf)));
    const prev = texture(foamFront, backUV);

    // retention in [0,1): closer to 1 = foam persists longer.
    const retention = foamDecay;
    const next = prev.x.mul(retention).add(breaking.mul(float(1).sub(retention)).mul(float(2)));
    textureStore(foamBack, coord, vec4(max(next, float(0)))).toWriteOnly();
  })().compute(N * N);

  return {
    displacement,
    derivatives,
    assemble,
    advect,
    get foam() { return foamFront; },
    swapFoam() {
      const tmp = foamFront;
      foamFront = foamBack;
      foamBack = tmp;
    },
  };
}
