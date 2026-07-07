// Throttled GPU readback for buoyancy and camera underwater state.

import {
  readBuoyancyBuffer,
  sampleHeightFromBuffer,
  sampleSlopeFromBuffer,
} from './wave-sampler.js';

export class BuoyancySampler {
  /**
   * @param {import('./fft/ocean-simulator.js').OceanSimulator} simulator
   * @param {number} [interval] — readback every N frames
   */
  constructor(simulator, interval = 3) {
    this.simulator = simulator;
    this.interval = interval;
    this.tick = 0;
    this.buffer = null;
    this.pending = null;
  }

  /** Fire-and-forget readback; safe to call every frame. */
  requestReadback(renderer) {
    if (this.pending) return this.pending;
    if (++this.tick % this.interval !== 0) return null;

    this.pending = readBuoyancyBuffer(renderer, this.simulator, 0, this.buffer)
      .then((buffer) => {
        this.buffer = buffer;
        this.pending = null;
      })
      .catch(() => {
        this.pending = null;
      });

    return this.pending;
  }

  getHeight(x, z) {
    if (!this.buffer) return 0;
    return sampleHeightFromBuffer(x, z, this.buffer);
  }

  getSlope(x, z) {
    if (!this.buffer) return { dx: 0, dz: 0 };
    return sampleSlopeFromBuffer(x, z, this.buffer);
  }

  /** 0 = above surface, 1 = fully submerged (for post-process blend). */
  underwaterMix(cameraY, x, z, smooth = 1.2) {
    const surface = this.getHeight(x, z);
    const depth = surface - cameraY;
    const t = (depth + 0.25) / smooth;
    return Math.min(1, Math.max(0, t));
  }
}
