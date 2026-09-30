// Procedural WebAudio sound effects (no audio files). Throttled so swarms don't clip.
import { audio, prefs, toggleMuted, unlock } from './audio/core';

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
  crunch: () => throttle('crunch', 40) && noise(0.12, 2200, 0.35, 1, 400),
  collapse: (big: boolean) => {
    if (!throttle('collapse', 70)) return;
    noise(big ? 0.9 : 0.45, big ? 900 : 1500, big ? 0.9 : 0.6, 0.7, 80);
    tone('sine', big ? 90 : 140, 30, big ? 0.6 : 0.3, 0.5);
  },
  stomp: () => {
    tone('sine', 110, 25, 0.5, 0.9);
    noise(0.6, 600, 0.8, 1, 60);
  },
  swipe: () => throttle('swipe', 90) && noise(0.08, 5000, 0.12, 2, 1500),
  shot: () => throttle('shot', 70) && tone('square', 900, 300, 0.05, 0.05),
  cannon: () => throttle('cannon', 120) && (noise(0.25, 1200, 0.4, 1, 200), tone('sine', 160, 50, 0.2, 0.3)),
  hurt: () => throttle('hurt', 150) && tone('sawtooth', 220, 90, 0.15, 0.2),
  pickup: () => throttle('pickup', 45) && tone('square', 660 + Math.random() * 300, 1400, 0.06, 0.06),
  breath: () => throttle('breath', 300) && noise(0.5, 3000, 0.25, 4, 800),
  levelup: () => [523, 659, 784, 1046].forEach((f, i) => tone('square', f, f, 0.12, 0.12, i * 0.07)),
  roar: () => {
    tone('sawtooth', 180, 60, 1.0, 0.35);
    tone('sawtooth', 120, 45, 1.1, 0.3, 0.05);
    noise(1.0, 1800, 0.4, 1, 200);
  },
  news: () => [880, 660, 988].forEach((f, i) => tone('triangle', f, f, 0.18, 0.18, i * 0.16)),
  alarm: () => [0, 0.35, 0.7].forEach((d) => tone('square', 520, 380, 0.3, 0.1, d)),
};
