// Seeded gameplay randomness, split into independent streams so one kind of decision can't shift
// another: what spawns (and when) doesn't change because a player picked up more hearts, and vice
// versa. Seeded from the run seed at startRun, so the daily rampage gives everyone the same city,
// the same army and the same offers. Cosmetic randomness (dust, sparks, rubble) stays on Math.random.
import { mulberry32 } from './rng';

class Stream {
  private r = mulberry32((Math.random() * 2 ** 32) >>> 0);
  sow(seed: number) {
    this.r = mulberry32(seed >>> 0);
  }
  frac() {
    return this.r();
  }
  between(lo: number, hi: number) {
    return lo + Math.floor(this.r() * (hi - lo + 1));
  }
  float(lo: number, hi: number) {
    return lo + this.r() * (hi - lo);
  }
  pick<T>(xs: readonly T[]): T {
    return xs[Math.floor(this.r() * xs.length)];
  }
}

export const rng = {
  /** Spawn kinds, spawn points, set-piece timing. */
  spawn: new Stream(),
  /** Enemy behaviour: fire cadence, aim noise, orbit directions, boss attack choice. */
  ai: new Stream(),
  /** Hearts, items and crates. */
  drop: new Stream(),
  /** The world acting on its own: lightning, fire spreading. Kept apart so it can't shift spawns or drops. */
  world: new Stream(),
  sowAll(seed: number) {
    rng.spawn.sow(seed ^ 0x51ed270b);
    rng.ai.sow(seed ^ 0x2c1b3c6d);
    rng.drop.sow(seed ^ 0x6a09e667);
    rng.world.sow(seed ^ 0x3c6ef372);
  },
};
