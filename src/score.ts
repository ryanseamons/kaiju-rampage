// Score with a destruction combo: every kill or collapse inside the window extends the chain,
// and the multiplier climbs in steps of ×0.5 every 15 hits, up to ×5.
import { COMBO_WINDOW, comboMult } from './config';

export class Score {
  score = 0;
  combo = 0;
  comboT = 0;
  bestCombo = 0;
  /** Difficulty multiplier on every point. */
  diffMult = 1;

  /** Adds `base` × the current multiplier; `chain` also extends the combo. */
  add(base: number, chain = true) {
    if (chain) {
      this.combo++;
      this.comboT = COMBO_WINDOW;
      if (this.combo > this.bestCombo) this.bestCombo = this.combo;
    }
    this.score += Math.round(base * comboMult(this.combo) * this.diffMult);
  }

  /** Flat bonus (wave clears, crates): not multiplied, doesn't extend the chain. */
  bonus(n: number) {
    this.score += Math.round(n * this.diffMult);
  }

  update(dt: number) {
    if (this.comboT <= 0) return;
    this.comboT -= dt;
    if (this.comboT <= 0) this.combo = 0;
  }

  get mult() {
    return comboMult(this.combo);
  }
}
