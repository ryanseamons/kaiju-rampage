// Procedural WebAudio sound effects (no audio files). Throttled so swarms don't clip.
import { MUTED } from './config';

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let muted = MUTED || (() => { try { return localStorage.getItem('kaiju.muted') === '1'; } catch { return false; } })();
const MASTER_GAIN = 0.28;
let noiseBuf: AudioBuffer | null = null;
const last = new Map<string, number>();

function ac(): AudioContext | null {
  if (muted) return null;
  if (!ctx) {
    try {
      ctx = new AudioContext();
      master = ctx.createGain();
      master.gain.value = MASTER_GAIN;
      master.connect(ctx.destination);
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    } catch {
      return null;
    }
  }
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
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
  const a = ac();
  if (!a || !master || !noiseBuf) return;
  const t = a.currentTime;
  const src = a.createBufferSource();
  src.buffer = noiseBuf;
  const f = a.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.setValueAtTime(freq, t);
  if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t + dur);
  f.Q.value = q;
  const g = a.createGain();
  env(g, t, peak, dur);
  src.connect(f).connect(g).connect(master);
  src.start(t, Math.random() * 0.5);
  src.stop(t + dur + 0.05);
}

function tone(type: OscillatorType, f0: number, f1: number, dur: number, peak: number, delay = 0) {
  const a = ac();
  if (!a || !master) return;
  const t = a.currentTime + delay;
  const o = a.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(f0, t);
  o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
  const g = a.createGain();
  env(g, t, peak, dur);
  o.connect(g).connect(master);
  o.start(t);
  o.stop(t + dur + 0.05);
}

export const sfx = {
  unlock: () => ac(),
  isMuted: () => muted,
  /** Returns the new muted state. Persisted so a muted player stays muted next run. */
  toggleMute: () => {
    muted = !muted;
    try {
      localStorage.setItem('kaiju.muted', muted ? '1' : '0');
    } catch {
      /* ignore */
    }
    if (master) master.gain.value = muted ? 0 : MASTER_GAIN;
    if (!muted) music.restart();
    return muted;
  },
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

// ── Music: a minimal procedural loop (bass pulse + soft hat + low drone), tempo scaled by tier. ──
// Deliberately quiet and simple; it has not been auditioned by a human (see NOTES.md).
const BPM = [84, 100, 118];
const BASS = [0, 0, 7, 0, 3, 0, 7, 5]; // semitone steps over a D1 root, 8th notes
const musicState = { wanted: false, on: false, tier: 1 as 1 | 2 | 3, boss: false, ducked: false, next: 0, step: 0 };
let musicGain: GainNode | null = null;
let musicTimer: number | null = null;
let drone: OscillatorNode[] = [];

function musicVolume() {
  return musicState.ducked ? 0.35 : 1;
}

function scheduleStep(a: AudioContext, t: number) {
  if (!musicGain) return;
  const st = musicState;
  const root = 36.7 * (st.boss ? 1.19 : 1); // D1, up a minor third for the boss
  const semi = BASS[st.step % BASS.length];
  const freq = root * Math.pow(2, semi / 12);
  // bass pulse
  const o = a.createOscillator();
  o.type = st.tier === 1 ? 'triangle' : 'sawtooth';
  o.frequency.value = freq;
  const f = a.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.value = 180 + st.tier * 90;
  const g = a.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.9 * musicVolume(), t + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.28);
  o.connect(f).connect(g).connect(musicGain);
  o.start(t);
  o.stop(t + 0.32);
  // soft hat on off-beats from tier 2, every 8th in boss mode
  if (noiseBuf && (st.boss || (st.tier >= 2 && st.step % 2 === 1))) {
    const n = a.createBufferSource();
    n.buffer = noiseBuf;
    const hf = a.createBiquadFilter();
    hf.type = 'highpass';
    hf.frequency.value = 6000;
    const hg = a.createGain();
    hg.gain.setValueAtTime(0.0001, t);
    hg.gain.exponentialRampToValueAtTime(0.12 * musicVolume(), t + 0.005);
    hg.gain.exponentialRampToValueAtTime(0.0001, t + 0.06);
    n.connect(hf).connect(hg).connect(musicGain);
    n.start(t, Math.random());
    n.stop(t + 0.08);
  }
  st.step++;
}

function musicTick() {
  const a = ac();
  if (!a || !musicState.on) return;
  const stepLen = 60 / (musicState.boss ? 132 : BPM[musicState.tier - 1]) / 2; // 8th notes
  if (musicState.next < a.currentTime) musicState.next = a.currentTime + 0.05;
  while (musicState.next < a.currentTime + 0.25) {
    scheduleStep(a, musicState.next);
    musicState.next += stepLen;
  }
  if (musicGain) musicGain.gain.setTargetAtTime(0.09 * musicVolume(), a.currentTime, 0.1);
}

export const music = {
  start(tier: 1 | 2 | 3, boss: boolean) {
    musicState.tier = tier;
    musicState.boss = boss;
    musicState.wanted = true;
    const a = ac();
    if (!a || !master) return;
    if (!musicGain) {
      musicGain = a.createGain();
      musicGain.gain.value = 0.09;
      musicGain.connect(master);
    }
    if (!musicState.on) {
      musicState.on = true;
      musicState.next = 0;
      musicState.step = 0;
      // two detuned saws through a low-pass = the drone
      drone = [0, 3].map((cents) => {
        const o = a.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = 36.7;
        o.detune.value = cents;
        const f = a.createBiquadFilter();
        f.type = 'lowpass';
        f.frequency.value = 120;
        const g = a.createGain();
        g.gain.value = 0.25;
        o.connect(f).connect(g).connect(musicGain!);
        o.start();
        return o;
      });
      musicTimer = window.setInterval(musicTick, 100);
    }
  },
  duck(on: boolean) {
    musicState.ducked = on;
  },
  stop() {
    musicState.on = false;
    musicState.wanted = false;
    if (musicTimer !== null) clearInterval(musicTimer);
    musicTimer = null;
    for (const o of drone) o.stop();
    drone = [];
  },
  /** After un-muting: the context may only now exist, so rebuild the loop at the current settings. */
  restart() {
    if (!musicState.wanted) return;
    music.stop();
    music.start(musicState.tier, musicState.boss);
  },
};
