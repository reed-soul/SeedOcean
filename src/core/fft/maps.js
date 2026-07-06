import { StorageTexture, HalfFloatType, RepeatWrapping } from 'three/webgpu';
import {
  Fn, instanceIndex, uint, uvec2, vec4, float, max, min, attributeArray, textureStore,
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
  const turbulence = attributeArray(N * N, 'float');
  turbulence.value.array.fill(1.0);
  turbulence.value.needsUpdate = true;

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

    const prev = turbulence.element(id);
    const turb = min(J, prev.add(dt.mul(foamDecay).div(max(J, float(0.5)))));
    turbulence.element(id).assign(turb);

    textureStore(displacement, coord, vec4(DxDz.x.mul(lambda), DyDxz.x, DxDz.y.mul(lambda), turb)).toWriteOnly();
    textureStore(derivatives, coord, vec4(DyxDyz.x, DyxDyz.y, DxxDzz.x.mul(lambda), DxxDzz.y.mul(lambda))).toWriteOnly();
  })().compute(N * N);

  return { displacement, derivatives, turbulence, assemble };
}
