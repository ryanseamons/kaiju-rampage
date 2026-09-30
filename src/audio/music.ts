// Music engine: plays composed pieces with a lookahead scheduler and crossfades between contexts.
// Timing runs on AudioContext time (25 ms tick, 0.2 s lookahead), as in the tavern project.
import { audio, onAudioReady, prefs, type Graph } from './core';
import { compose, type MusicContext, type Piece, type PieceInfo } from './composer';
import { Voices } from './instruments';

const TICK_MS = 25;
const LOOKAHEAD = 0.2;
const FADE_SEC = 2.5;

interface Playing {
  piece: Piece;
  bus: GainNode;
  voices: Voices;
  nextTime: number;
  step: number; // absolute step index
  startedAt: number;
  stopAt: number | null;
}

const sessionSeed = (Math.random() * 2 ** 31) >>> 0;
let current: Playing | null = null;
let fading: Playing[] = [];
let wanted: MusicContext | null = null;
let timer: number | null = null;
const listeners = new Set<(p: PieceInfo | null) => void>();

function seedFor(ctx: MusicContext) {
  // One tune per context per page load, so a run keeps a consistent soundtrack.
  return (sessionSeed ^ (['title', 'tier1', 'tier2', 'tier3', 'boss', 'victory', 'defeat'].indexOf(ctx) * 0x9e3779b1)) >>> 0;
}

function schedule(p: Playing, until: number) {
  const { piece, voices } = p;
  const stepsPerLoop = piece.bars.length * piece.stepsPerBar;
  while (p.nextTime < until) {
    const i = p.step % stepsPerLoop;
    const bar = piece.bars[Math.floor(i / piece.stepsPerBar)];
    const evs = bar[i % piece.stepsPerBar];
    const t = p.nextTime;
    for (const e of evs) {
      const dur = e.dur * piece.stepSec;
      switch (e.v) {
        case 'taiko': voices.taiko(t, e.vel); break;
        case 'shime': voices.shime(t, e.vel); break;
        case 'hat': voices.hat(t, e.vel); break;
        case 'gong': voices.gong(t, e.vel); break;
        case 'bass': voices.bass(t, e.midi[0], dur, e.vel, piece.squareBass); break;
        case 'brass': voices.brass(t, e.midi, dur, e.vel, dur > 1.2); break;
        case 'pad': voices.pad(t, e.midi, dur, e.vel); break;
        case 'koto': voices.pluck(t, e.midi[0], e.vel, 'koto'); break;
        case 'shamisen': voices.pluck(t, e.midi[0], e.vel, 'shamisen'); break;
        case 'lead':
          if (piece.lead === 'pulse') voices.pulse(t, e.midi[0], dur, e.vel);
          else if (piece.lead === 'flute') voices.flute(t, e.midi[0], dur, e.vel);
          else if (piece.lead === 'brass') voices.brass(t, [e.midi[0], e.midi[0] - 12], dur, e.vel * 0.9, false);
          else voices.pluck(t, e.midi[0], e.vel, 'shamisen');
          break;
      }
    }
    p.nextTime += piece.stepSec;
    p.step++;
  }
}

function tick() {
  const g = audio();
  if (!g || g.ctx.state !== 'running') return;
  const now = g.ctx.currentTime;
  if (current) schedule(current, now + LOOKAHEAD);
  fading = fading.filter((f) => {
    if (f.stopAt !== null && now >= f.stopAt) {
      f.bus.disconnect();
      return false;
    }
    schedule(f, Math.min(now + LOOKAHEAD, f.stopAt ?? Infinity));
    return true;
  });
}

function startPiece(g: Graph, ctx: MusicContext) {
  const piece = compose(seedFor(ctx), ctx);
  const bus = g.ctx.createGain();
  const now = g.ctx.currentTime;
  bus.gain.setValueAtTime(0.0001, now);
  bus.gain.linearRampToValueAtTime(1, now + (current ? FADE_SEC : 1.2));
  bus.connect(g.music);
  const p: Playing = { piece, bus, voices: new Voices(g, bus), nextTime: now + 0.08, step: 0, startedAt: now + 0.08, stopAt: null };
  if (current) {
    const old = current;
    old.bus.gain.cancelScheduledValues(now);
    old.bus.gain.setValueAtTime(old.bus.gain.value, now);
    old.bus.gain.linearRampToValueAtTime(0.0001, now + FADE_SEC);
    old.stopAt = now + FADE_SEC;
    fading.push(old);
  }
  current = p;
  console.info('[music]', JSON.stringify({ type: 'piece', ...piece.info }));
  for (const fn of listeners) fn(piece.info);
  if (timer === null) timer = window.setInterval(tick, TICK_MS);
}

export const music = {
  /** Switch to the tune for this context (crossfade). Safe to call before audio is unlocked. */
  play(ctx: MusicContext) {
    wanted = ctx;
    const g = audio();
    if (!g || !prefs.music) return;
    if (current?.piece.info.context === ctx) return;
    startPiece(g, ctx);
  },
  stop() {
    wanted = null;
    const g = audio();
    if (!g || !current) return;
    const now = g.ctx.currentTime;
    current.bus.gain.cancelScheduledValues(now);
    current.bus.gain.setValueAtTime(current.bus.gain.value, now);
    current.bus.gain.linearRampToValueAtTime(0.0001, now + 1);
    current.stopAt = now + 1;
    fading.push(current);
    current = null;
    for (const fn of listeners) fn(null);
  },
  /** Re-apply the wanted context (after unlocking audio or turning music back on). */
  resume() {
    if (wanted) {
      const w = wanted;
      if (current?.piece.info.context !== w) music.play(w);
    }
  },
  nowPlaying(): (PieceInfo & { progress: number }) | null {
    const g = audio();
    if (!current || !g) return null;
    const loop = current.piece.bars.length * current.piece.stepsPerBar * current.piece.stepSec;
    const progress = ((g.ctx.currentTime - current.startedAt) % loop) / loop;
    return { ...current.piece.info, progress: Math.max(0, progress) };
  },
  onChange(fn: (p: PieceInfo | null) => void) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
  get wanted() {
    return wanted;
  },
};

onAudioReady(() => music.resume());

// Test/dev surface: lets Playwright force a context and record clips.
(window as unknown as { __kaijuMusic: unknown }).__kaijuMusic = {
  play: (c: MusicContext) => music.play(c),
  now: () => music.nowPlaying(),
};
