// Shared Web Audio graph: one context, a master chain, and separate music / sfx buses.
//   sources → music bus ─┐
//   sources → sfx bus ───┼→ master (mute) → compressor → destination (+ recorder tap)
//   reverb send → convolver → music bus
const PREFS_KEY = 'kaiju.audio';

interface Prefs {
  muted: boolean;
  music: boolean;
  sfx: boolean;
}

function loadPrefs(): Prefs {
  const def: Prefs = { muted: false, music: true, sfx: true };
  try {
    const legacy = localStorage.getItem('kaiju.muted') === '1';
    const raw = localStorage.getItem(PREFS_KEY);
    return raw ? { ...def, ...JSON.parse(raw) } : { ...def, muted: legacy };
  } catch {
    return def;
  }
}

export const prefs: Prefs = loadPrefs();
if (new URLSearchParams(location.search).get('mute') === '1') prefs.muted = true;

function savePrefs() {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch {
    /* ignore */
  }
}

export interface Graph {
  ctx: AudioContext;
  master: GainNode;
  music: GainNode;
  sfx: GainNode;
  reverb: GainNode;
  tap: MediaStreamAudioDestinationNode | null;
  noise: AudioBuffer;
}

let graph: Graph | null = null;
const readyListeners = new Set<(g: Graph) => void>();

const MUSIC_LEVEL = 0.62;
const SFX_LEVEL = 0.9;

function impulse(ctx: BaseAudioContext, seconds: number, decay: number) {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
  }
  return buf;
}

function build(): Graph | null {
  try {
    const ctx = new AudioContext({ latencyHint: 'interactive' });
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16;
    comp.knee.value = 12;
    comp.ratio.value = 4;
    comp.attack.value = 0.004;
    comp.release.value = 0.22;
    const master = ctx.createGain();
    master.gain.value = prefs.muted ? 0 : 0.85;
    master.connect(comp).connect(ctx.destination);
    let tap: MediaStreamAudioDestinationNode | null = null;
    try {
      tap = ctx.createMediaStreamDestination();
      comp.connect(tap);
    } catch {
      tap = null;
    }
    const music = ctx.createGain();
    music.gain.value = prefs.music ? MUSIC_LEVEL : 0;
    music.connect(master);
    const sfx = ctx.createGain();
    sfx.gain.value = prefs.sfx ? SFX_LEVEL : 0;
    sfx.connect(master);
    const conv = ctx.createConvolver();
    conv.buffer = impulse(ctx, 2.6, 2.4);
    const reverb = ctx.createGain();
    reverb.gain.value = 0.55;
    reverb.connect(conv).connect(music);
    const noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const nd = noise.getChannelData(0);
    for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
    return { ctx, master, music, sfx, reverb, tap, noise };
  } catch {
    return null;
  }
}

/** The audio graph, created lazily. Returns null until something has asked for it. */
export function audio(): Graph | null {
  if (!graph) {
    graph = build();
    if (graph) for (const fn of readyListeners) fn(graph);
  }
  return graph;
}

/** Call from a user gesture (click / key): creates or resumes the context. */
export function unlock(): Graph | null {
  const g = audio();
  if (g && g.ctx.state === 'suspended') void g.ctx.resume();
  return g;
}

export const isRunning = () => !!graph && graph.ctx.state === 'running';

export function onAudioReady(fn: (g: Graph) => void) {
  readyListeners.add(fn);
  if (graph) fn(graph);
}

function ramp(p: AudioParam, v: number, sec = 0.25) {
  if (!graph) return;
  const t = graph.ctx.currentTime;
  p.cancelScheduledValues(t);
  p.setValueAtTime(p.value, t);
  p.linearRampToValueAtTime(v, t + sec);
}

export function setMuted(m: boolean) {
  prefs.muted = m;
  savePrefs();
  if (graph) ramp(graph.master.gain, m ? 0 : 0.85);
}
export const toggleMuted = () => (setMuted(!prefs.muted), prefs.muted);

export function setMusicOn(on: boolean) {
  prefs.music = on;
  savePrefs();
  if (graph) ramp(graph.music.gain, on ? MUSIC_LEVEL * duckLevel : 0, 0.4);
}
export function setSfxOn(on: boolean) {
  prefs.sfx = on;
  savePrefs();
  if (graph) ramp(graph.sfx.gain, on ? SFX_LEVEL : 0);
}

let duckLevel = 1;
/** Pull the music down under menus and news cards. */
export function duckMusic(on: boolean) {
  duckLevel = on ? 0.4 : 1;
  if (graph && prefs.music) ramp(graph.music.gain, MUSIC_LEVEL * duckLevel, 0.5);
}

/** Records the master output (for the Playwright music clips). Resolves with a webm Blob. */
export async function record(seconds: number): Promise<Blob | null> {
  const g = audio();
  if (!g?.tap || typeof MediaRecorder === 'undefined') return null;
  const mime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : 'audio/webm';
  const rec = new MediaRecorder(g.tap.stream, { mimeType: mime, audioBitsPerSecond: 128_000 });
  const chunks: Blob[] = [];
  rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  const done = new Promise<Blob>((res) => (rec.onstop = () => res(new Blob(chunks, { type: mime }))));
  rec.start(250);
  await new Promise((r) => setTimeout(r, seconds * 1000));
  rec.stop();
  return done;
}
