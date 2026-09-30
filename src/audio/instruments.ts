// Synth voices for the score. Everything is scheduled at an exact AudioContext time `t`
// into a destination node (the piece's bus), with an optional send to the shared reverb.
import type { Graph } from './core';

const mtof = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

function env(g: GainNode, t: number, peak: number, attack: number, hold: number, release: number) {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + attack);
  if (hold > 0) g.gain.setValueAtTime(Math.max(0.0002, peak), t + attack + hold);
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + hold + release);
}

function stopAll(t: number, ...nodes: (OscillatorNode | AudioBufferSourceNode)[]) {
  for (const n of nodes) n.stop(t);
}

export class Voices {
  private pulseWave: PeriodicWave;
  private plucks = new Map<string, AudioBuffer>();

  constructor(private g: Graph, private out: AudioNode) {
    // 25% duty pulse: the NES-style lead.
    const n = 32;
    const re = new Float32Array(n);
    const im = new Float32Array(n);
    const duty = 0.25;
    for (let k = 1; k < n; k++) im[k] = (2 / (k * Math.PI)) * Math.sin(k * Math.PI * duty);
    this.pulseWave = g.ctx.createPeriodicWave(re, im);
  }

  private get ctx() {
    return this.g.ctx;
  }

  private send(node: AudioNode, amount: number) {
    if (amount <= 0) return;
    const s = this.ctx.createGain();
    s.gain.value = amount;
    node.connect(s).connect(this.g.reverb);
  }

  private noiseSrc(t: number) {
    const s = this.ctx.createBufferSource();
    s.buffer = this.g.noise;
    s.start(t, Math.random() * 0.6);
    return s;
  }

  /** Big low drum: pitch-dropping sine body plus a noise slap. */
  taiko(t: number, vel: number) {
    const c = this.ctx;
    const o = c.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(110, t);
    o.frequency.exponentialRampToValueAtTime(48, t + 0.35);
    const g = c.createGain();
    env(g, t, 0.95 * vel, 0.004, 0, 0.55);
    o.connect(g).connect(this.out);
    o.start(t);
    this.send(g, 0.25);
    const n = this.noiseSrc(t);
    const f = c.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 900;
    const ng = c.createGain();
    env(ng, t, 0.45 * vel, 0.002, 0, 0.09);
    n.connect(f).connect(ng).connect(this.out);
    stopAll(t + 0.7, o, n);
  }

  /** Small tight drum (shime-daiko): high, dry tick. */
  shime(t: number, vel: number) {
    const c = this.ctx;
    const o = c.createOscillator();
    o.type = 'triangle';
    o.frequency.setValueAtTime(520, t);
    o.frequency.exponentialRampToValueAtTime(330, t + 0.05);
    const g = c.createGain();
    env(g, t, 0.35 * vel, 0.001, 0, 0.07);
    o.connect(g).connect(this.out);
    o.start(t);
    const n = this.noiseSrc(t);
    const f = c.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 2800;
    f.Q.value = 1.5;
    const ng = c.createGain();
    env(ng, t, 0.22 * vel, 0.001, 0, 0.04);
    n.connect(f).connect(ng).connect(this.out);
    stopAll(t + 0.15, o, n);
  }

  hat(t: number, vel: number) {
    const c = this.ctx;
    const n = this.noiseSrc(t);
    const f = c.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.value = 7000;
    const g = c.createGain();
    env(g, t, 0.13 * vel, 0.001, 0, 0.045);
    n.connect(f).connect(g).connect(this.out);
    stopAll(t + 0.1, n);
  }

  /** Temple gong: inharmonic partials with a slow shimmer. */
  gong(t: number, vel: number) {
    const c = this.ctx;
    const g = c.createGain();
    env(g, t, 0.28 * vel, 0.02, 0, 3.6);
    g.connect(this.out);
    this.send(g, 0.8);
    const oscs: OscillatorNode[] = [];
    for (const [f, a] of [[82, 1], [123, 0.7], [171, 0.5], [229, 0.35], [311, 0.25]] as const) {
      const o = c.createOscillator();
      o.type = 'sine';
      o.frequency.setValueAtTime(f * 1.02, t);
      o.frequency.exponentialRampToValueAtTime(f, t + 1.5);
      const og = c.createGain();
      og.gain.value = a;
      o.connect(og).connect(g);
      o.start(t);
      oscs.push(o);
    }
    stopAll(t + 4, ...oscs);
  }

  /** Bass: saw or square through a plucky low-pass. */
  bass(t: number, midi: number, dur: number, vel: number, square = false) {
    const c = this.ctx;
    const o = c.createOscillator();
    o.type = square ? 'square' : 'sawtooth';
    o.frequency.value = mtof(midi);
    const f = c.createBiquadFilter();
    f.type = 'lowpass';
    f.Q.value = 6;
    f.frequency.setValueAtTime(900 + 1400 * vel, t);
    f.frequency.exponentialRampToValueAtTime(180, t + Math.min(0.3, dur));
    const g = c.createGain();
    env(g, t, 0.42 * vel, 0.005, Math.max(0, dur - 0.08), 0.08);
    o.connect(f).connect(g).connect(this.out);
    o.start(t);
    o.stop(t + dur + 0.12);
  }

  /** Brass section: two detuned saws per note with a swelling filter (tokusatsu stabs). */
  brass(t: number, midis: number[], dur: number, vel: number, swell = false) {
    const c = this.ctx;
    const f = c.createBiquadFilter();
    f.type = 'lowpass';
    f.Q.value = 2;
    const top = 1400 + 2600 * vel;
    if (swell) {
      f.frequency.setValueAtTime(300, t);
      f.frequency.linearRampToValueAtTime(top, t + dur * 0.7);
    } else {
      f.frequency.setValueAtTime(top, t);
      f.frequency.exponentialRampToValueAtTime(700, t + Math.min(0.45, dur));
    }
    const g = c.createGain();
    env(g, t, (0.16 * vel) / Math.sqrt(midis.length), swell ? dur * 0.6 : 0.012, swell ? dur * 0.25 : Math.max(0, dur - 0.1), swell ? 0.5 : 0.14);
    f.connect(g).connect(this.out);
    this.send(g, 0.35);
    const oscs: OscillatorNode[] = [];
    for (const m of midis)
      for (const det of [-9, 8]) {
        const o = c.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = mtof(m);
        o.detune.value = det;
        o.connect(f);
        o.start(t);
        oscs.push(o);
      }
    stopAll(t + dur + 0.7, ...oscs);
  }

  /** Chiptune lead: 25% pulse with delayed vibrato. */
  pulse(t: number, midi: number, dur: number, vel: number) {
    const c = this.ctx;
    const o = c.createOscillator();
    o.setPeriodicWave(this.pulseWave);
    o.frequency.value = mtof(midi);
    const lfo = c.createOscillator();
    lfo.frequency.value = 5.5;
    const lg = c.createGain();
    lg.gain.setValueAtTime(0, t);
    lg.gain.linearRampToValueAtTime(dur > 0.25 ? 14 : 0, t + Math.min(0.3, dur));
    lfo.connect(lg).connect(o.detune);
    const g = c.createGain();
    env(g, t, 0.13 * vel, 0.006, Math.max(0, dur - 0.06), 0.07);
    o.connect(g).connect(this.out);
    this.send(g, 0.2);
    o.start(t);
    lfo.start(t);
    stopAll(t + dur + 0.1, o, lfo);
  }

  /** Breathy flute (shakuhachi-ish): triangle bent up into pitch, plus breath noise. */
  flute(t: number, midi: number, dur: number, vel: number) {
    const c = this.ctx;
    const o = c.createOscillator();
    o.type = 'triangle';
    const f0 = mtof(midi);
    o.frequency.setValueAtTime(f0 * 0.94, t);
    o.frequency.exponentialRampToValueAtTime(f0, t + 0.12);
    const lfo = c.createOscillator();
    lfo.frequency.value = 4.2;
    const lg = c.createGain();
    lg.gain.setValueAtTime(0, t);
    lg.gain.linearRampToValueAtTime(18, t + dur * 0.8);
    lfo.connect(lg).connect(o.detune);
    const g = c.createGain();
    env(g, t, 0.2 * vel, 0.09, Math.max(0, dur - 0.2), 0.35);
    o.connect(g).connect(this.out);
    this.send(g, 0.6);
    const n = this.noiseSrc(t);
    const bf = c.createBiquadFilter();
    bf.type = 'bandpass';
    bf.frequency.value = f0 * 2;
    bf.Q.value = 3;
    const ng = c.createGain();
    env(ng, t, 0.05 * vel, 0.05, Math.max(0, dur - 0.2), 0.3);
    n.connect(bf).connect(ng).connect(this.out);
    o.start(t);
    lfo.start(t);
    stopAll(t + dur + 0.5, o, lfo, n);
  }

  /** Soft string pad under the chords. */
  pad(t: number, midis: number[], dur: number, vel: number) {
    const c = this.ctx;
    const f = c.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 1100;
    const g = c.createGain();
    env(g, t, (0.08 * vel) / Math.sqrt(midis.length), Math.min(0.8, dur * 0.4), dur * 0.4, 0.9);
    f.connect(g).connect(this.out);
    this.send(g, 0.5);
    const oscs: OscillatorNode[] = [];
    for (const m of midis)
      for (const det of [-6, 6]) {
        const o = c.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = mtof(m);
        o.detune.value = det;
        o.connect(f);
        o.start(t);
        oscs.push(o);
      }
    stopAll(t + dur + 1, ...oscs);
  }

  /** Karplus–Strong string rendered once per pitch: 'shamisen' is bright and short, 'koto' longer and softer. */
  private pluckBuffer(midi: number, kind: 'shamisen' | 'koto') {
    const key = `${kind}:${midi}`;
    const hit = this.plucks.get(key);
    if (hit) return hit;
    const sr = 22050;
    const secs = kind === 'koto' ? 1.8 : 0.9;
    const len = Math.floor(sr * secs);
    const buf = this.ctx.createBuffer(1, len, sr);
    const d = buf.getChannelData(0);
    const period = Math.max(2, Math.round(sr / mtof(midi)));
    const line = new Float32Array(period);
    for (let i = 0; i < period; i++) line[i] = Math.random() * 2 - 1;
    const damp = kind === 'koto' ? 0.996 : 0.985;
    const bright = kind === 'shamisen' ? 0.8 : 0.5;
    let idx = 0;
    for (let i = 0; i < len; i++) {
      const cur = line[idx];
      const nxt = line[(idx + 1) % period];
      line[idx] = damp * (bright * cur + (1 - bright) * nxt);
      d[i] = cur;
      idx = (idx + 1) % period;
    }
    this.plucks.set(key, buf);
    return buf;
  }

  pluck(t: number, midi: number, vel: number, kind: 'shamisen' | 'koto') {
    const c = this.ctx;
    const s = c.createBufferSource();
    s.buffer = this.pluckBuffer(midi, kind);
    const g = c.createGain();
    g.gain.value = (kind === 'koto' ? 0.3 : 0.34) * vel;
    const f = c.createBiquadFilter();
    f.type = kind === 'shamisen' ? 'highpass' : 'lowpass';
    f.frequency.value = kind === 'shamisen' ? 180 : 3200;
    s.connect(f).connect(g).connect(this.out);
    this.send(g, kind === 'koto' ? 0.45 : 0.2);
    s.start(t);
  }
}
