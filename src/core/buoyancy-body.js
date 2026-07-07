// Multi-body buoyancy — spring-damper height tracking with pitch/roll from wave slope.

import * as THREE from 'three/webgpu';

const DEFAULT_SAMPLES = [
  [0, 0],
  [1.4, 0],
  [-1.4, 0],
  [0, 1.1],
  [0, -1.1],
];

export class BuoyancyBody {
  /**
   * @param {THREE.Object3D} object
   * @param {object} [opts]
   */
  constructor(object, opts = {}) {
    this.object = object;
    this.buoyancyOffset = opts.buoyancyOffset ?? 0;
    this.springK = opts.springK ?? 22;
    this.damping = opts.damping ?? 5;
    this.angularK = opts.angularK ?? 10;
    this.angularDamping = opts.angularDamping ?? 4;
    this.maxTilt = opts.maxTilt ?? 0.32;
    this.samples = opts.samples ?? DEFAULT_SAMPLES;
    // Lateral drag coefficient — how strongly the current grips this body.
    // Higher for wide flat hulls (boat), lower for tall thin posts (buoy).
    this.currentDrag = opts.currentDrag ?? 1;
    this.velocity = new THREE.Vector3();
    this.angularVelocity = new THREE.Vector2();
    this._prevPos = object.position.clone();
    this._frameVel = new THREE.Vector3();
  }

  /** World-space velocity from last position delta (for wake stamping). */
  sampleVelocity(dt) {
    const o = this.object.position;
    this._frameVel.set(
      (o.x - this._prevPos.x) / Math.max(dt, 1e-4),
      0,
      (o.z - this._prevPos.z) / Math.max(dt, 1e-4),
    );
    this._prevPos.copy(o);
    return this._frameVel;
  }
}

export class BuoyancySystem {
  /** @param {import('./buoyancy.js').BuoyancySampler} sampler */
  constructor(sampler) {
    this.sampler = sampler;
    this.bodies = [];
    // River current — applied as a horizontal force on every body. Default
    // (0,0,0) is open water with no drift; preset.flow populates this.
    this.current = new THREE.Vector3();
  }

  add(body) {
    this.bodies.push(body);
    return body;
  }

  /** Set the global current direction (unit, XZ) and speed (m/s). */
  setCurrent(dirX, dirZ, speed) {
    const len = Math.hypot(dirX, dirZ) || 1;
    this.current.set(dirX / len, 0, dirZ / len).multiplyScalar(speed);
  }

  update(dt) {
    const clampDt = Math.min(dt, 0.05);
    const hasCurrent = this.current.lengthSq() > 1e-6;
    for (const body of this.bodies) {
      const obj = body.object;
      const cosY = Math.cos(obj.rotation.y);
      const sinY = Math.sin(obj.rotation.y);
      const heights = [];

      for (const [lx, lz] of body.samples) {
        const wx = obj.position.x + lx * cosY - lz * sinY;
        const wz = obj.position.z + lx * sinY + lz * cosY;
        heights.push(this.sampler.getHeight(wx, wz));
      }

      const avg = heights.reduce((a, b) => a + b, 0) / heights.length;
      const targetY = avg + body.buoyancyOffset;
      const ay = body.springK * (targetY - obj.position.y) - body.damping * body.velocity.y;
      body.velocity.y += ay * clampDt;
      obj.position.y += body.velocity.y * clampDt;

      // Horizontal current: push the body downstream. We integrate directly on
      // position (no horizontal momentum state) and damp toward the current
      // velocity — a simple drag model that reads as "the river carries you"
      // without needing full rigid-body physics. currentDrag scales grip.
      if (hasCurrent) {
        const k = body.currentDrag * clampDt;
        // Target horizontal velocity = current velocity. Lerp position toward
        // where the current would carry it this frame.
        obj.position.x += this.current.x * k;
        obj.position.z += this.current.z * k;
      }

      const front = heights[3] ?? heights[0];
      const back = heights[4] ?? heights[0];
      const left = heights[1] ?? heights[0];
      const right = heights[2] ?? heights[0];

      const targetPitch = Math.atan2(back - front, 2.8);
      const targetRoll = Math.atan2(left - right, 2.8);

      body.angularVelocity.x += (targetPitch - obj.rotation.x) * body.angularK * clampDt;
      body.angularVelocity.y += (targetRoll - obj.rotation.z) * body.angularK * clampDt;
      body.angularVelocity.multiplyScalar(Math.max(0, 1 - body.angularDamping * clampDt));

      obj.rotation.x = THREE.MathUtils.clamp(
        obj.rotation.x + body.angularVelocity.x * clampDt,
        -body.maxTilt,
        body.maxTilt,
      );
      obj.rotation.z = THREE.MathUtils.clamp(
        obj.rotation.z + body.angularVelocity.y * clampDt,
        -body.maxTilt,
        body.maxTilt,
      );
    }
  }

  getBody(object) {
    return this.bodies.find((b) => b.object === object);
  }
}
