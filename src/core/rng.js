// SplitMix32 — same family as SeedThree; deterministic per-seed wave phase offsets.

export class Rng {
  constructor(seed = 1) {
    this.state = seed >>> 0 || 1;
  }

  next() {
    this.state = (this.state + 0x9e3779b9) >>> 0;
    let z = this.state;
    z = Math.imul(z ^ (z >>> 16), 0x85ebca6b) >>> 0;
    z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35) >>> 0;
    return (z ^ (z >>> 16)) >>> 0;
  }

  float() {
    return this.next() / 0x100000000;
  }

  range(min, max) {
    return min + this.float() * (max - min);
  }
}
