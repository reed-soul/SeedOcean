// Throttled GPU readback for buoyancy and camera underwater state.

import { readCascadeBuffers, sampleOceanHeight, sampleFFTDisplacement } from './wave-sampler.js';

export class BuoyancySampler {
  /**
   * @param {import('./fft/ocean-simulator.js').OceanSimulator} simulator
   * @param {number} [interval] — readback every N frames
   */
  constructor(simulator, interval = 3) {
    this.simulator = simulator;
    this.interval = interval;
    this.tick = 0;
    this.buffers = null;
    this.pending = null;
  }

  /** Fire-and-forget readback; safe to call every frame. */
  requestReadback(renderer) {
    if (this.pending) return this.pending;
    if (++this.tick % this.interval !== 0) return null;

    this.pending = readCascadeBuffers(renderer, this.simulator)
      .then((buffers) => {
        this.buffers = buffers;
        this.pending = null;
      })
      .catch(() => {
        this.pending = null;
      });

    return this.pending;
  }

  getHeight(x, z) {
    if (!this.buffers) return 0;
    return sampleOceanHeight(x, z, this.simulator, this.buffers);
  }

  getDisplacement(x, z) {
    if (!this.buffers) return { x: 0, y: 0, z: 0 };
    return sampleFFTDisplacement(x, z, this.simulator, this.buffers);
  }

  /** 0 = above surface, 1 = fully submerged (for post-process blend). */
  underwaterMix(cameraY, x, z, smooth = 1.2) {
    const surface = this.getHeight(x, z);
    const depth = surface - cameraY;
    const t = (depth + 0.25) / smooth;
    return Math.min(1, Math.max(0, t));
  }
}
