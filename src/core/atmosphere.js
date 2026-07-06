// Atmosphere extensions — wind-blown sea spray at breaking crests + a screen
// rain layer. Both are CPU-driven THREE.Points for portability (no extra GPU
// compute passes) and zero-cost when their intensity is zero.

import * as THREE from 'three/webgpu';

const SPRAY_MAX = 4000;
const RAIN_MAX = 6000;

/**
 * @param {object} opts
 * @param {number} [opts.sprayIntensity=0]   0..1
 * @param {number} [opts.rainIntensity=0]    0..1
 * @param {number} [opts.windDirection=0]    degrees (drives spray drift)
 * @param {number} [opts.windSpeed=10]       m/s (drives spray + rain slant)
 */
export function buildAtmosphere({
  sprayIntensity = 0,
  rainIntensity = 0,
  windDirection = 0,
  windSpeed = 10,
} = {}) {
  const group = new THREE.Group();
  group.name = 'SeedOcean_Atmosphere';

  // ---- Spray (world-space points) ----
  const sprayPos = new Float32Array(SPRAY_MAX * 3);
  const sprayVel = new Float32Array(SPRAY_MAX * 3);
  const sprayLife = new Float32Array(SPRAY_MAX);
  let sprayCount = 0;

  const sprayGeo = new THREE.BufferGeometry();
  sprayGeo.setAttribute('position', new THREE.BufferAttribute(sprayPos, 3));
  sprayGeo.setDrawRange(0, 0);

  const sprayMat = new THREE.PointsMaterial({
    size: 0.18,
    color: 0xeaf4ff,
    transparent: true,
    opacity: 0.55,
    depthWrite: false,
    sizeAttenuation: true,
  });
  const spray = new THREE.Points(sprayGeo, sprayMat);
  spray.frustumCulled = false;
  group.add(spray);

  // ---- Rain (camera-aligned sheet) ----
  const rainPos = new Float32Array(RAIN_MAX * 3);
  for (let i = 0; i < RAIN_MAX; i++) {
    rainPos[i * 3] = (Math.random() - 0.5) * 120;
    rainPos[i * 3 + 1] = Math.random() * 60;
    rainPos[i * 3 + 2] = (Math.random() - 0.5) * 120;
  }
  const rainGeo = new THREE.BufferGeometry();
  rainGeo.setAttribute('position', new THREE.BufferAttribute(rainPos, 3));

  const rainMat = new THREE.PointsMaterial({
    size: 0.12,
    color: 0xaabbc8,
    transparent: true,
    opacity: 0.35,
    depthWrite: false,
    sizeAttenuation: true,
  });
  const rain = new THREE.Points(rainGeo, rainMat);
  rain.frustumCulled = false;
  group.add(rain);

  const wind = new THREE.Vector3();
  const _v = new THREE.Vector3();
  const _camOrigin = new THREE.Vector3();

  const state = {
    sprayIntensity,
    rainIntensity,
    windDirection,
    windSpeed,
  };

  function applyPreset(preset) {
    state.sprayIntensity = preset.sprayIntensity ?? 0;
    state.rainIntensity = preset.rainIntensity ?? 0;
    spray.visible = state.sprayIntensity > 0;
    rain.visible = state.rainIntensity > 0;
  }

  function updateWind() {
    const a = (state.windDirection * Math.PI) / 180;
    wind.set(Math.cos(a), 0, Math.sin(a)).multiplyScalar(state.windSpeed * 0.15);
  }
  updateWind();

  /**
   * @param {number} dt
   * @param {object} ctx
   * @param {THREE.Camera} ctx.camera
   * @param {{getHeight:(x:number,z:number)=>number}} [ctx.sampler]  wave height source
   * @param {{stamp:(x:number,z:number,vx:number,vz:number,r?:number,s?:number)=>void}} [ctx.wake]  for rain ripples
   */
  function update(dt, { camera, sampler, wake }) {
    updateWind();
    _camOrigin.copy(camera.position);

    // ---- Spray: emit at random near-crest points, advect, kill on splashdown ----
    if (state.sprayIntensity > 0) {
      const emit = Math.floor(state.sprayIntensity * 120 * dt);
      for (let e = 0; e < emit && sprayCount < SPRAY_MAX; e++) {
        const i = sprayCount++;
        // Spawn around the camera, biased downwind.
        const r = 8 + Math.random() * 40;
        const ang = Math.atan2(wind.z, wind.x) + (Math.random() - 0.5) * 1.2;
        const x = _camOrigin.x + Math.cos(ang) * r;
        const z = _camOrigin.z + Math.sin(ang) * r;
        const y = sampler ? sampler.getHeight(x, z) + 0.2 : 0.2;
        sprayPos[i * 3] = x;
        sprayPos[i * 3 + 1] = Math.max(y, 0.1);
        sprayPos[i * 3 + 2] = z;
        sprayVel[i * 3] = wind.x * 0.5 + (Math.random() - 0.5) * 2;
        sprayVel[i * 3 + 1] = 2 + Math.random() * 3;
        sprayVel[i * 3 + 2] = wind.z * 0.5 + (Math.random() - 0.5) * 2;
        sprayLife[i] = 0.8 + Math.random() * 0.8;
      }
      for (let i = 0; i < sprayCount; i++) {
        sprayLife[i] -= dt;
        if (sprayLife[i] <= 0) {
          // Recycle: swap with last live particle.
          const last = --sprayCount;
          if (i !== last) {
            for (let k = 0; k < 3; k++) {
              sprayPos[i * 3 + k] = sprayPos[last * 3 + k];
              sprayVel[i * 3 + k] = sprayVel[last * 3 + k];
            }
            sprayLife[i] = sprayLife[last];
          }
          i--; // recheck the swapped-in particle
          continue;
        }
        sprayVel[i * 3 + 1] -= 9.8 * dt;       // gravity
        sprayPos[i * 3] += sprayVel[i * 3] * dt;
        sprayPos[i * 3 + 1] += sprayVel[i * 3 + 1] * dt;
        sprayPos[i * 3 + 2] += sprayVel[i * 3 + 2] * dt;
      }
      sprayGeo.setDrawRange(0, sprayCount);
      sprayGeo.attributes.position.needsUpdate = true;
    }

    // ---- Rain: recenter the sheet on the camera, fall + slant ----
    if (state.rainIntensity > 0) {
      const visible = Math.floor(RAIN_MAX * state.rainIntensity);
      const fall = (12 + state.windSpeed * 0.4) * dt;
      const slantX = wind.x * 0.2 * dt;
      const slantZ = wind.z * 0.2 * dt;
      for (let i = 0; i < visible; i++) {
        rainPos[i * 3] += slantX;
        rainPos[i * 3 + 1] -= fall;
        rainPos[i * 3 + 2] += slantZ;
        // Wrap relative to camera.
        const rx = rainPos[i * 3] - _camOrigin.x;
        const rz = rainPos[i * 3 + 2] - _camOrigin.z;
        if (rx < -60) rainPos[i * 3] += 120;
        else if (rx > 60) rainPos[i * 3] -= 120;
        if (rz < -60) rainPos[i * 3 + 2] += 120;
        else if (rz > 60) rainPos[i * 3 + 2] -= 120;
        if (rainPos[i * 3 + 1] < _camOrigin.y - 8) {
          rainPos[i * 3 + 1] = _camOrigin.y + 35 + Math.random() * 20;
          // Splash ripple into the wake field (cheap visual feedback on the surface).
          if (wake && Math.random() < 0.15) {
            wake.stamp(rainPos[i * 3], rainPos[i * 3 + 2], 0, 0, 0.6, 0.25);
          }
        }
      }
      rainGeo.setDrawRange(0, visible);
      rainGeo.attributes.position.needsUpdate = true;
    }
  }

  function dispose() {
    sprayGeo.dispose();
    sprayMat.dispose();
    rainGeo.dispose();
    rainMat.dispose();
  }

  return {
    group,
    state,
    applyPreset,
    update,
    dispose,
  };
}
