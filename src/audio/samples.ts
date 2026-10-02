// Sample banks for the in-game effects. Each bank holds a few alternates; a play picks one that
// wasn't used last time, jitters its pitch, and respects a voice cap and a minimum gap so swarms
// don't turn into noise. Clips are peak-normalised at load, so a bank's `peak` is its real level.
//
// Kenney CC0 clips live in public/sfx/k/ (in the repository). Epidemic Sound clips (licensed) are
// listed in es-banks.json and streamed from the CDN (AUDIO_BASE); a bank whose files can't load
// just doesn't play, and the caller falls back to synthesis.
import esBanks from './es-banks.json';
import { AUDIO_BASE } from '../config';
import { audio, onAudioReady, prefs } from './core';

interface BankDef {
  files: string[];
  peak: number;
  /** Minimum ms between plays of this bank. */
  gap?: number;
  /** Max overlapping voices. */
  voices?: number;
  /** ± playback-rate jitter. */
  jitter?: number;
}

const k = (name: string, n: number) => Array.from({ length: n }, (_, i) => `sfx/k/${name}-${i}.mp3`);

const KENNEY: Record<string, BankDef> = {
  step: { files: k('step', 5), peak: 0.3, gap: 120, voices: 2, jitter: 0.06 },
  squish: { files: k('squish', 5), peak: 0.35, gap: 45, voices: 3 },
  car: { files: k('car', 5), peak: 0.4, gap: 50, voices: 3 },
  plank: { files: k('plank', 5), peak: 0.55, gap: 60, voices: 3 },
  debris: { files: k('debris', 5), peak: 0.6, gap: 70, voices: 3 },
  plate: { files: k('plate', 5), peak: 0.55, gap: 70, voices: 3 },
  punch: { files: k('punch', 5), peak: 0.8, gap: 80, voices: 2 },
  hurt: { files: k('hurt', 5), peak: 0.45, gap: 150, voices: 1 },
  slice: { files: k('slice', 3), peak: 0.22, gap: 90, voices: 2, jitter: 0.06 },
  glass: { files: k('glass', 4), peak: 0.2, gap: 40, voices: 3, jitter: 0 },
  powerup: { files: k('powerup', 2), peak: 0.35, gap: 200, voices: 1, jitter: 0 },
  evolve: { files: k('evolve', 1), peak: 0.4, gap: 400, voices: 1, jitter: 0 },
  item: { files: k('item', 1), peak: 0.35, gap: 200, voices: 1 },
  zap: { files: k('zap', 2), peak: 0.35, gap: 150, voices: 2 },
  latch: { files: k('latch', 1), peak: 0.45, gap: 200, voices: 1 },
};

interface Loaded {
  def: BankDef;
  bufs: { buf: AudioBuffer; gain: number }[];
  lastIdx: number;
  lastAt: number;
  active: number;
}

const banks = new Map<string, Loaded>();
let started = false;

async function loadBank(name: string, def: BankDef) {
  const g = audio();
  if (!g) return;
  const bufs = (
    await Promise.all(
      def.files.map(async (f) => {
        try {
          const r = await fetch(/^https?:/.test(f) ? f : `${import.meta.env.BASE_URL}${f}`);
          if (!r.ok) return null;
          const buf = await g.ctx.decodeAudioData(await r.arrayBuffer());
          let peak = 0;
          for (let ch = 0; ch < buf.numberOfChannels; ch++) {
            const d = buf.getChannelData(ch);
            for (let i = 0; i < d.length; i++) peak = Math.max(peak, Math.abs(d[i]));
          }
          return { buf, gain: def.peak / Math.max(0.05, peak) };
        } catch {
          return null;
        }
      }),
    )
  ).filter((b): b is { buf: AudioBuffer; gain: number } => !!b);
  if (bufs.length) banks.set(name, { def, bufs, lastIdx: -1, lastAt: 0, active: 0 });
}

async function preload() {
  if (started) return;
  started = true;
  await Promise.all(Object.entries(KENNEY).map(([n, d]) => loadBank(n, d)));
  // Licensed banks, streamed from the CDN (src/config.ts AUDIO_BASE).
  await Promise.all(Object.entries(esBanks as Record<string, BankDef>).map(([n, d]) => loadBank(`es.${n}`, { ...d, files: d.files.map((f) => `${AUDIO_BASE}sfx/${f}`) })));
}

onAudioReady(() => void preload());

export interface PlayOpts {
  /** Playback rate (pitch); multiplied with the jitter. */
  rate?: number;
  gain?: number;
  delay?: number;
}

export const samples = {
  has: (name: string) => banks.has(name),
  /** Plays one alternate from the bank. False if the bank isn't loaded or is throttled/full. */
  play(name: string, o: PlayOpts = {}): boolean {
    if (prefs.muted || !prefs.sfx) return false;
    const b = banks.get(name);
    const g = audio();
    if (!b || !g || g.ctx.state !== 'running') return false;
    const now = performance.now();
    if (now - b.lastAt < (b.def.gap ?? 60)) return true; // throttled counts as handled
    if (b.active >= (b.def.voices ?? 3)) return true;
    b.lastAt = now;
    let i = Math.floor(Math.random() * b.bufs.length);
    if (b.bufs.length > 1 && i === b.lastIdx) i = (i + 1) % b.bufs.length;
    b.lastIdx = i;
    const { buf, gain } = b.bufs[i];
    const src = g.ctx.createBufferSource();
    src.buffer = buf;
    const j = b.def.jitter ?? 0.04;
    src.playbackRate.value = (o.rate ?? 1) * (1 + (Math.random() * 2 - 1) * j);
    const gn = g.ctx.createGain();
    gn.gain.value = gain * (o.gain ?? 1);
    src.connect(gn).connect(g.sfx);
    b.active++;
    src.onended = () => {
      b.active--;
      gn.disconnect();
    };
    src.start(g.ctx.currentTime + (o.delay ?? 0));
    return true;
  },
  /** Loaded bank names (for tests). */
  loaded: () => [...banks.keys()],
};

(window as unknown as { __kaijuSamples: unknown }).__kaijuSamples = { loaded: samples.loaded, play: samples.play };
