// In-game sound effects: recorded samples (src/audio/samples.ts) layered with, or falling back to,
// procedural WebAudio synthesis. Licensed Epidemic banks ('es.*') win when deployed; Kenney CC0 banks
// cover the rest. Everything is throttled so swarms don't clip.
import { audio, prefs, toggleMuted, unlock } from './audio/core';
import { samples } from './audio/samples';

/** 0, 1, 2: the kaiju's size tier. Bigger kaiju, deeper crunches. */
let tierIdx = 0;
const deep = (per = 0.12) => 1 - tierIdx * per;
let pickupChain = 0;
let pickupAt = 0;

const last = new Map<string, number>();

/** The shared context and the sfx bus, or null before audio exists / while muted. */
function ac(): { ctx: AudioContext; out: GainNode; noise: AudioBuffer } | null {
  if (prefs.muted) return null;
  const g = audio();
  if (!g) return null;
  if (g.ctx.state === 'suspended') void g.ctx.resume();
  return { ctx: g.ctx, out: g.sfx, noise: g.noise };
}

function throttle(name: string, ms: number) {
  const now = performance.now();
  if ((last.get(name) ?? 0) + ms > now) return false;
  last.set(name, now);
  return true;
}

function env(g: GainNode, t: number, peak: number, dur: number) {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
}

function noise(dur: number, freq: number, peak: number, q = 0.8, sweepTo?: number) {
  const g0 = ac();
  if (!g0) return;
  const a = g0.ctx;
  const t = a.currentTime;
  const src = a.createBufferSource();
  src.buffer = g0.noise;
  const f = a.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.setValueAtTime(freq, t);
  if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t + dur);
  f.Q.value = q;
  const g = a.createGain();
  env(g, t, peak, dur);
  src.connect(f).connect(g).connect(g0.out);
  src.start(t, Math.random() * 0.5);
  src.stop(t + dur + 0.05);
}

function tone(type: OscillatorType, f0: number, f1: number, dur: number, peak: number, delay = 0) {
  const g0 = ac();
  if (!g0) return;
  const a = g0.ctx;
  const t = a.currentTime + delay;
  const o = a.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(f0, t);
  o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
  const g = a.createGain();
  env(g, t, peak, dur);
  o.connect(g).connect(g0.out);
  o.start(t);
  o.stop(t + dur + 0.05);
}

export const sfx = {
  unlock: () => unlock(),
  isMuted: () => prefs.muted,
  /** Mutes everything (music and effects). Returns the new state; remembered between runs. */
  toggleMute: () => toggleMuted(),
  setTier: (i: number) => (tierIdx = i),
  /** Small things underfoot. */
  crunch: (kind: 'car' | 'tree' | 'soldier' = 'car') => {
    const hit = kind === 'soldier' ? samples.play('squish', { rate: deep(0.08) }) : kind === 'tree' ? samples.play('plank', { rate: 1.3, gain: 0.5 }) : samples.play('es.car', { rate: deep(0.06), gain: 0.8 }) || samples.play('car', { rate: deep(0.1) });
    if (!hit && throttle('crunch', 40)) noise(0.12, 2200, 0.35, 1, 400);
  },
  collapse: (big: boolean) => {
    if (!throttle(big ? 'collapseBig' : 'collapse', big ? 120 : 70)) return;
    const es = samples.play(big ? 'es.collapseBig' : 'es.collapse', { rate: deep(0.05), gain: big ? 1 : 0.8 });
    if (!es) {
      samples.play('debris', { rate: (big ? 0.75 : 0.95) * deep(0.08) });
      samples.play('plank', { rate: (big ? 0.7 : 0.9) * deep(0.08), gain: big ? 0.8 : 0.6 });
    }
    // sub-bass weight under the sample
    tone('sine', big ? 90 : 140, 30, big ? 0.6 : 0.3, big ? 0.5 : 0.35);
    if (!samples.has('debris')) noise(big ? 0.9 : 0.45, big ? 900 : 1500, big ? 0.9 : 0.6, 0.7, 80);
  },
  /** Vehicles and machines going up. */
  explode: (big: boolean) => {
    if (!throttle(big ? 'explodeBig' : 'explode', big ? 150 : 80)) return;
    if (!samples.play(big ? 'es.explosionBig' : 'es.explosion', { rate: big ? 0.85 : 1 })) {
      samples.play('plate', { rate: big ? 0.6 : 0.8 });
      noise(big ? 0.9 : 0.45, big ? 900 : 1500, big ? 0.9 : 0.6, 0.7, 80);
    }
    tone('sine', big ? 80 : 120, 28, big ? 0.7 : 0.35, 0.5);
  },
  stomp: () => {
    if (!samples.play('es.stomp', { rate: deep(0.06) })) samples.play('punch', { rate: 0.65 * deep(0.08) });
    tone('sine', 110, 25, 0.5, 0.9);
    noise(0.6, 600, 0.5, 1, 60);
  },
  swipe: () => {
    if (!samples.play('slice', { rate: 0.85 * deep(0.1) }) && throttle('swipe', 90)) noise(0.08, 5000, 0.12, 2, 1500);
  },
  shot: () => {
    if (!samples.play('es.rifle', { rate: 1.1 }) && throttle('shot', 70)) tone('square', 900, 300, 0.05, 0.05);
  },
  cannon: () => {
    if (!throttle('cannon', 120)) return;
    if (!samples.play('es.cannon')) {
      samples.play('plate', { rate: 0.7, gain: 0.7 });
      noise(0.25, 1200, 0.4, 1, 200);
    }
    tone('sine', 160, 50, 0.2, 0.3);
  },
  hurt: () => {
    if (!samples.play('hurt', { rate: 0.8 * deep(0.06) }) && throttle('hurt', 150)) tone('sawtooth', 220, 90, 0.15, 0.2);
  },
  /** XP crystals: a glassy tick that climbs in pitch while you hoover up a stream of them. */
  pickup: () => {
    const now = performance.now();
    pickupChain = now - pickupAt < 450 ? Math.min(pickupChain + 1, 16) : 0;
    pickupAt = now;
    if (!samples.play('glass', { rate: 1 + pickupChain * 0.045 }) && throttle('pickup', 45)) tone('square', 660 + Math.random() * 300, 1400, 0.06, 0.06);
  },
  breath: () => throttle('breath', 300) && noise(0.5, 3000, 0.25, 4, 800),
  levelup: () => {
    if (!samples.play('powerup')) [523, 659, 784, 1046].forEach((f, i) => tone('square', f, f, 0.12, 0.12, i * 0.07));
  },
  /** `big`: the tier-up roar. */
  roar: (big = false) => {
    if (samples.play(big ? 'es.roarBig' : 'es.roar', { rate: deep(0.07) }) || samples.play('es.roar', { rate: deep(0.07) })) return;
    tone('sawtooth', 180, 60, 1.0, 0.35);
    tone('sawtooth', 120, 45, 1.1, 0.3, 0.05);
    noise(1.0, 1800, 0.4, 1, 200);
  },
  news: () => [880, 660, 988].forEach((f, i) => tone('triangle', f, f, 0.18, 0.18, i * 0.16)),
  alarm: () => {
    if (!throttle('alarm', 1500)) return;
    if (!samples.play('es.siren')) [0, 0.35, 0.7].forEach((d) => tone('square', 520, 380, 0.3, 0.1, d));
  },
  jet: () => {
    if (!samples.play('es.jet')) (noise(1.4, 5000, 0.5, 0.7, 300), tone('sawtooth', 900, 200, 1.2, 0.08));
  },
  charge: () => {
    if (!throttle('charge', 400)) return;
    if (!samples.play('es.charge')) tone('sawtooth', 120, 900, 1.6, 0.06);
  },
  zap: () => {
    if (!samples.play('zap', { rate: 0.8 })) (noise(0.3, 8000, 0.45, 3, 1200), tone('square', 1500, 200, 0.25, 0.12));
  },
  crate: () => {
    samples.play('latch');
    [392, 523, 659, 784, 1046].forEach((f, i) => tone('triangle', f, f, 0.14, 0.11, 0.08 + i * 0.06));
  },
  evolve: () => {
    samples.play('evolve');
    [262, 330, 392, 523, 659, 784, 1046].forEach((f, i) => tone('square', f, f * 1.01, 0.18, 0.08, i * 0.07));
  },
  item: () => {
    if (!samples.play('item')) tone('sine', 500, 1600, 0.25, 0.16);
  },
  combo: (n: number) => throttle('combo', 120) && tone('square', 400 + Math.min(n, 60) * 18, 800 + Math.min(n, 60) * 30, 0.06, 0.05),
};
