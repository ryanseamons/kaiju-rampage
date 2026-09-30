// Button hover + press sounds, borrowed from Voyage's "Suggested Mix": a soft felt tap on hover
// (Kenney Impact Sounds, CC0) and Kenney UI Audio click_002 on press (CC0). Guards, as in Voyage:
// hover only on hover-capable pointers, one hover voice at a time, a global minimum interval,
// and ±2% pitch jitter. Both clips are peak-normalised on load so levels are predictable.
import { audio, prefs } from './core';

type Kind = 'hover' | 'press';
const FILES: Record<Kind, string> = { hover: 'sfx/hover.mp3', press: 'sfx/press.mp3' };
/** Target peak after normalisation, into the sfx bus. Hover stays well under press. */
const PEAK: Record<Kind, number> = { hover: 0.22, press: 0.42 };
const HOVER_GAP_MS = 90;

const buffers: Partial<Record<Kind, { buf: AudioBuffer; gain: number }>> = {};
let loading: Promise<void> | null = null;
let lastHover = 0;
let hoverVoice: AudioBufferSourceNode | null = null;

export const canHover = typeof window !== 'undefined' && !!window.matchMedia?.('(hover: hover)').matches;

function load() {
  const g = audio();
  if (!g || loading) return loading;
  loading = Promise.all(
    (Object.keys(FILES) as Kind[]).map(async (k) => {
      const res = await fetch(`${import.meta.env.BASE_URL}${FILES[k]}`);
      const buf = await g.ctx.decodeAudioData(await res.arrayBuffer());
      let peak = 0;
      for (let ch = 0; ch < buf.numberOfChannels; ch++) for (const v of buf.getChannelData(ch)) peak = Math.max(peak, Math.abs(v));
      buffers[k] = { buf, gain: PEAK[k] / Math.max(0.05, peak) };
    }),
  )
    .then(() => undefined)
    .catch(() => {
      loading = null;
    });
  return loading;
}

function play(kind: Kind) {
  if (prefs.muted || !prefs.sfx) return;
  const g = audio();
  if (!g || g.ctx.state !== 'running') return;
  const b = buffers[kind];
  if (!b) {
    void load();
    return;
  }
  const src = g.ctx.createBufferSource();
  src.buffer = b.buf;
  src.playbackRate.value = 1 + (Math.random() * 2 - 1) * 0.02;
  const gain = g.ctx.createGain();
  gain.gain.value = b.gain;
  src.connect(gain).connect(g.sfx);
  if (kind === 'hover') {
    try {
      hoverVoice?.stop();
    } catch {
      /* already ended */
    }
    hoverVoice = src;
  }
  src.start();
}

export const uiSound = {
  /** Call once audio exists (after the first gesture) so the first hover isn't silent. */
  preload: () => void load(),
  /** Pointer or keyboard moved onto a button. */
  hover(fromPointer = true) {
    if (fromPointer && !canHover) return; // taps fire pointerover too; don't double up on touch
    const now = performance.now();
    if (now - lastHover < HOVER_GAP_MS) return;
    lastHover = now;
    play('hover');
  },
  press: () => play('press'),
};
