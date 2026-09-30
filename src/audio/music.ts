// Music engine. Two sources behind one API:
//  - recorded tracks from public/music/tracks.json (licensed for the deployed site, kept out of the
//    repository), streamed through the music bus and rotated per context with crossfades;
//  - the procedural composer (lookahead scheduler: 25 ms tick, 0.2 s lookahead, as in the tavern
//    project) when there is no track list, e.g. in a fresh clone.
import { audio, onAudioReady, prefs, type Graph } from './core';
import { compose, type MusicContext, type Piece } from './composer';
import { Voices } from './instruments';
import { tracks, type TrackInfo } from './tracks';

const TICK_MS = 25;
const LOOKAHEAD = 0.2;
const FADE_SEC = 2.5;
/** Recorded tracks are mastered hot (normalised to -16 LUFS); this sits them level with the composer. */
const TRACK_LEVEL = 1;

export interface NowPlaying {
  context: MusicContext;
  kind: 'track' | 'composed';
  en: string;
  ja: string;
  /** Composer: key, scale and tempo. Track: artist. */
  meta: string;
  metaJa: string;
  progress: number;
}

interface Base {
  context: MusicContext;
  bus: GainNode;
  stopAt: number | null;
}
interface Composed extends Base {
  kind: 'composed';
  piece: Piece;
  voices: Voices;
  nextTime: number;
  step: number; // absolute step index
  startedAt: number;
}
interface Streamed extends Base {
  kind: 'track';
  track: TrackInfo;
  el: HTMLAudioElement;
  node: MediaElementAudioSourceNode;
  advancing: boolean;
}
type Playing = Composed | Streamed;

const sessionSeed = (Math.random() * 2 ** 31) >>> 0;
let current: Playing | null = null;
let fading: Playing[] = [];
let wanted: MusicContext | null = null;
let timer: number | null = null;
const listeners = new Set<(p: NowPlaying | null) => void>();

function seedFor(ctx: MusicContext) {
  // One tune per context per page load, so a run keeps a consistent soundtrack.
  return (sessionSeed ^ (['title', 'tier1', 'tier2', 'tier3', 'boss', 'victory', 'defeat'].indexOf(ctx) * 0x9e3779b1)) >>> 0;
}

function schedule(p: Composed, until: number) {
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

function release(p: Playing) {
  p.bus.disconnect();
  if (p.kind === 'track') {
    p.el.pause();
    p.node.disconnect();
    p.el.removeAttribute('src');
    p.el.load();
  }
}

function tick() {
  const g = audio();
  if (!g || g.ctx.state !== 'running') return;
  const now = g.ctx.currentTime;
  if (current?.kind === 'composed') schedule(current, now + LOOKAHEAD);
  else if (current?.kind === 'track') {
    const p = current, el = p.el;
    // Autoplay can refuse play() before the first gesture; retry once audio is running.
    if (el.paused && !el.ended && el.readyState >= 2) void el.play().catch(() => {});
    // Roll into the next track for this context shortly before the end, so the fade overlaps it.
    if (!p.advancing && el.duration > 0 && el.duration - el.currentTime < FADE_SEC + 0.3) {
      p.advancing = true;
      start(g, p.context);
    }
  }
  fading = fading.filter((f) => {
    if (f.stopAt !== null && now >= f.stopAt) {
      release(f);
      return false;
    }
    if (f.kind === 'composed') schedule(f, Math.min(now + LOOKAHEAD, f.stopAt ?? Infinity));
    return true;
  });
}

function fadeOut(p: Playing, g: Graph, sec: number) {
  const now = g.ctx.currentTime;
  p.bus.gain.cancelScheduledValues(now);
  p.bus.gain.setValueAtTime(p.bus.gain.value, now);
  p.bus.gain.linearRampToValueAtTime(0.0001, now + sec);
  p.stopAt = now + sec;
  fading.push(p);
}

function newBus(g: Graph, level: number) {
  const bus = g.ctx.createGain();
  const now = g.ctx.currentTime;
  bus.gain.setValueAtTime(0.0001, now);
  bus.gain.linearRampToValueAtTime(level, now + (current ? FADE_SEC : 1.2));
  bus.connect(g.music);
  return bus;
}

function composedFor(g: Graph, ctx: MusicContext): Composed {
  const piece = compose(seedFor(ctx), ctx);
  const bus = newBus(g, 1);
  const now = g.ctx.currentTime;
  return { kind: 'composed', context: ctx, piece, bus, voices: new Voices(g, bus), nextTime: now + 0.08, step: 0, startedAt: now + 0.08, stopAt: null };
}

function streamedFor(g: Graph, ctx: MusicContext, track: TrackInfo): Streamed {
  const el = new Audio();
  el.crossOrigin = 'anonymous';
  el.preload = 'auto';
  el.src = tracks.url(track);
  const node = g.ctx.createMediaElementSource(el);
  const bus = newBus(g, TRACK_LEVEL);
  node.connect(bus);
  const p: Streamed = { kind: 'track', context: ctx, track, el, node, bus, stopAt: null, advancing: false };
  el.addEventListener('error', () => {
    if (current === p) {
      console.warn('[music] track failed', track.id);
      tracks.drop(track);
      current = null;
      release(p);
      start(g, ctx);
    }
  });
  void el.play().catch(() => {});
  return p;
}

function start(g: Graph, ctx: MusicContext, forced?: TrackInfo) {
  const track = forced ?? tracks.next(ctx);
  const p = track ? streamedFor(g, ctx, track) : composedFor(g, ctx);
  if (current) fadeOut(current, g, FADE_SEC);
  current = p;
  const info = describe(p, g);
  console.info('[music]', JSON.stringify({ type: p.kind, context: ctx, title: info.en }));
  for (const fn of listeners) fn(info);
  if (timer === null) timer = window.setInterval(tick, TICK_MS);
}

function describe(p: Playing, g: Graph): NowPlaying {
  if (p.kind === 'track') {
    const d = p.el.duration;
    return {
      context: p.context, kind: 'track', en: p.track.title, ja: p.track.title,
      meta: p.track.artist, metaJa: p.track.artist,
      progress: d > 0 ? Math.min(1, p.el.currentTime / d) : 0,
    };
  }
  const i = p.piece.info;
  const loop = p.piece.bars.length * p.piece.stepsPerBar * p.piece.stepSec;
  const progress = ((g.ctx.currentTime - p.startedAt) % loop) / loop;
  return {
    context: p.context, kind: 'composed', en: i.en, ja: i.ja,
    meta: `${i.key} ${i.scale} · ${i.bpm} bpm`, metaJa: `${i.key} ${i.scaleJa} · ${i.bpm} bpm`,
    progress: Math.max(0, progress),
  };
}

export const music = {
  /** Switch to the music for this context (crossfade). Safe to call before audio is unlocked. */
  play(ctx: MusicContext) {
    wanted = ctx;
    const g = audio();
    if (!g || !prefs.music) return;
    if (current?.context === ctx) return;
    if (tracks.ready === null) {
      // First call: fetch the track list, then start whatever is wanted by then.
      void tracks.load().then(() => wanted && music.play(wanted));
      return;
    }
    start(g, ctx);
  },
  /** Sound Test: crossfade to one specific recorded track (it then rotates on within its first stage). */
  async playTrack(id: string) {
    await tracks.load();
    const t = tracks.all().find((x) => x.id === id);
    const g = audio();
    if (!t || !g) return;
    wanted = t.contexts[0];
    start(g, t.contexts[0], t);
  },
  /** The recorded track playing now, if any. */
  currentTrackId(): string | null {
    return current?.kind === 'track' ? current.track.id : null;
  },
  stop() {
    wanted = null;
    const g = audio();
    if (!g || !current) return;
    fadeOut(current, g, 1);
    current = null;
    for (const fn of listeners) fn(null);
  },
  /** Re-apply the wanted context (after unlocking audio or turning music back on). */
  resume() {
    if (wanted && current?.context !== wanted) music.play(wanted);
  },
  nowPlaying(): NowPlaying | null {
    const g = audio();
    return current && g ? describe(current, g) : null;
  },
  onChange(fn: (p: NowPlaying | null) => void) {
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
  /** Skip the current track to a few seconds before its end (tests the rotation). */
  skipToEnd: () => {
    if (current?.kind === 'track' && current.el.duration > 0) current.el.currentTime = current.el.duration - 4;
  },
};
