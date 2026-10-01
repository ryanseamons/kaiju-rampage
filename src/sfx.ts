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


/** A held tone/noise with an attack-sustain-release envelope (for the breath beam). */
function held(make: (a: AudioContext, t: number, end: number) => AudioNode, dur: number, peak: number) {
  const g0 = ac();
  if (!g0) return;
  const a = g0.ctx, t = a.currentTime, end = t + dur;
  const g = a.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + 0.06);
  g.gain.setValueAtTime(peak, Math.max(t + 0.07, end - 0.18));
  g.gain.exponentialRampToValueAtTime(0.0001, end);
  make(a, t, end).connect(g).connect(g0.out);
}

// Helicopter rotor: one looping voice whose level follows the nearest helicopter.
let rotor: { gain: GainNode; level: number } | null = null;
function rotorVoice() {
  if (rotor) return rotor;
  const g0 = ac();
  if (!g0) return null;
  const a = g0.ctx;
  const src = a.createBufferSource();
  src.buffer = g0.noise;
  src.loop = true;
  const bp = a.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = 260;
  bp.Q.value = 1.4;
  const chop = a.createGain();
  chop.gain.value = 0.5;
  const lfo = a.createOscillator();
  lfo.type = 'square';
  lfo.frequency.value = 13; // blade passes per second
  const lfoAmt = a.createGain();
  lfoAmt.gain.value = 0.5;
  lfo.connect(lfoAmt).connect(chop.gain);
  const gain = a.createGain();
  gain.gain.value = 0;
  src.connect(bp).connect(chop).connect(gain).connect(g0.out);
  src.start();
  lfo.start();
  return (rotor = { gain, level: 0 });
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
  /** A footfall: light steps as a hatchling, ground-shaking thuds at City-Ender size. */
  step: () => {
    if (tierIdx === 0) return void samples.play('step', { rate: 1.1, gain: 0.6 });
    samples.play('step', { rate: 0.6 - tierIdx * 0.1, gain: 0.8 });
    samples.play('punch', { rate: 0.55 - tierIdx * 0.08, gain: 0.25 + tierIdx * 0.12 });
    tone('sine', 70 - tierIdx * 12, 28, 0.25 + tierIdx * 0.1, 0.18 + tierIdx * 0.12);
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
  /** Atomic breath: a charged hum and crackle held for the whole beam, over a roar. */
  breath: (dur = 0.55, gamma = false) => {
    if (!throttle('breath', 300)) return;
    samples.play('es.roar', { rate: (gamma ? 0.8 : 0.95) * deep(0.06), gain: 0.55 }) || samples.play('zap', { rate: 0.5, gain: 0.6 });
    const base = (gamma ? 55 : 70) * deep(0.1);
    held((a, t, end) => {
      const o = a.createOscillator(), o2 = a.createOscillator();
      o.type = 'sawtooth';
      o2.type = 'sawtooth';
      o.frequency.setValueAtTime(base, t);
      o2.frequency.setValueAtTime(base * 2.01, t);
      o.frequency.linearRampToValueAtTime(base * 1.15, end);
      const lp = a.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.setValueAtTime(400, t);
      lp.frequency.exponentialRampToValueAtTime(gamma ? 2400 : 1600, t + 0.12);
      lp.Q.value = 6;
      const mix = a.createGain();
      o.connect(mix);
      o2.connect(mix);
      mix.connect(lp);
      o.start(t);
      o2.start(t);
      o.stop(end + 0.05);
      o2.stop(end + 0.05);
      return lp;
    }, dur + 0.15, gamma ? 0.2 : 0.16);
    held((a, t, end) => {
      const n = a.createBufferSource();
      const g0 = ac()!;
      n.buffer = g0.noise;
      n.loop = true;
      const bp = a.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = gamma ? 2600 : 1800;
      bp.Q.value = 1.2;
      n.connect(bp);
      n.start(t, Math.random() * 0.5);
      n.stop(end + 0.05);
      return bp;
    }, dur + 0.15, 0.22);
  },
  /** Spine volley launch, and a tick when a spine lands. */
  spines: () => {
    if (!throttle('spines', 120)) return;
    if (!samples.play('slice', { rate: 1.9, gain: 0.45 })) noise(0.06, 6000, 0.1, 2, 2000);
    tone('triangle', 1100, 380, 0.08, 0.05);
  },
  spineHit: () => throttle('spineHit', 60) && (samples.play('squish', { rate: 1.6, gain: 0.35 }) || noise(0.05, 3000, 0.1)),
  /** Tail spin: a heavy whoosh and a thump. */
  tail: () => {
    if (!throttle('tail', 200)) return;
    noise(0.38, 300, 0.35, 1.2, 2400);
    samples.play('punch', { rate: 0.75 * deep(0.08), gain: 0.5 });
  },
  /** Fallout aura burning something: a few Geiger clicks. */
  aura: (hits: number) => {
    if (!hits || !throttle('aura', 450)) return;
    const g0 = ac();
    if (!g0) return;
    for (let i = 0; i < Math.min(5, 1 + hits); i++) {
      const at = Math.random() * 0.4;
      tone('square', 2400 + Math.random() * 1200, 1800, 0.018, 0.14, at);
    }
  },
  /** A hit that doesn't kill: metal for vehicles and machines, a soft knock for infantry. */
  hit: (metal: boolean) => {
    if (metal) {
      if (throttle('hitMetal', 70)) samples.play('plate', { rate: 1.5, gain: 0.25 });
    } else if (throttle('hitSoft', 60)) samples.play('punch', { rate: 1.7, gain: 0.18 });
  },
  /** Claws or weapons finishing off infantry (crushing has its own crunch). */
  kill: () => throttle('kill', 40) && samples.play('squish', { rate: 1.2 * deep(0.05), gain: 0.45 }),
  /** A building taking damage before it falls. */
  buildingHit: (tower: boolean) => {
    if (!throttle('bhit', 90)) return;
    samples.play(tower ? 'debris' : 'plank', { rate: tower ? 1.25 : 1.35, gain: tower ? 0.3 : 0.28 });
  },
  /** Heart pickup: a warm two-note chime. */
  heart: () => {
    if (!samples.play('glass', { rate: 0.75, gain: 0.8 })) tone('sine', 660, 660, 0.12, 0.1);
    tone('sine', 784, 784, 0.18, 0.09, 0.07);
    tone('sine', 1046, 1046, 0.22, 0.07, 0.14);
  },
  /** Wave start: a taiko-style hit under the banner. */
  waveStart: () => {
    tone('sine', 90, 38, 0.55, 0.55);
    noise(0.18, 700, 0.35, 1, 120);
    samples.play('punch', { rate: 0.55, gain: 0.35 });
  },
  /** Typhoon lightning: a crack, then a long rumble. */
  thunder: () => {
    if (!samples.play('es.explosionBig', { rate: 0.55, gain: 0.7 })) noise(0.15, 6000, 0.6, 1, 2000);
    noise(2.2, 400, 0.5, 0.8, 60);
    tone('sine', 60, 28, 1.6, 0.3, 0.05);
  },
  /** Mech and walker footfalls. */
  mechStep: (big: boolean) => {
    if (!throttle('mechStep', 250)) return;
    samples.play('punch', { rate: big ? 0.42 : 0.5, gain: big ? 0.6 : 0.45 });
    samples.play('plate', { rate: 0.5, gain: 0.2 });
    tone('sine', big ? 55 : 65, 30, 0.35, big ? 0.35 : 0.25);
  },
  /** Helicopter rotor level, 0..1 (0 = silent). Call every frame or two. */
  setRotor: (level: number) => {
    const r = level > 0.001 || rotor ? rotorVoice() : null;
    if (!r) return;
    const g0 = ac();
    const lv = Math.max(0, Math.min(1, level));
    if (!g0) return;
    if (Math.abs(lv - r.level) < 0.01) return;
    r.level = lv;
    const t = g0.ctx.currentTime;
    r.gain.gain.cancelScheduledValues(t);
    r.gain.gain.setTargetAtTime(lv * 0.75, t, 0.15);
  },
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

// Test surface: tests/sfx.spec.ts records each effect from the master bus.
(window as unknown as { __kaijuSfx: unknown }).__kaijuSfx = sfx;
