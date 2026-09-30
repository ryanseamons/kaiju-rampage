// Seeded composer: (seed, context) → a complete loopable score. Pure JS, deterministic.
// Borrowed shape from the tavern project's composer (scales + progression + motif + form),
// retuned for monster-movie music: Japanese pentatonic scales, taiko, march bass, brass stabs.
import { mulberry32 } from '../rng';

export type MusicContext = 'title' | 'tier1' | 'tier2' | 'tier3' | 'boss' | 'victory' | 'defeat';
export type Voice = 'taiko' | 'shime' | 'hat' | 'gong' | 'bass' | 'brass' | 'pad' | 'lead' | 'shamisen' | 'koto';

export interface NoteEv {
  v: Voice;
  midi: number[];
  vel: number;
  /** length in steps */
  dur: number;
}

export interface PieceInfo {
  context: MusicContext;
  seed: number;
  en: string;
  ja: string;
  key: string;
  scale: string;
  scaleJa: string;
  bpm: number;
  bars: number;
}

export interface Piece {
  info: PieceInfo;
  stepSec: number;
  stepsPerBar: number;
  /** bars[bar][step] */
  bars: NoteEv[][][];
  lead: 'pulse' | 'flute' | 'brass' | 'shamisen';
  squareBass: boolean;
}

type Rng = () => number;
const pick = <T>(r: Rng, xs: readonly T[]) => xs[Math.floor(r() * xs.length)];
const int = (r: Rng, lo: number, hi: number) => lo + Math.floor(r() * (hi - lo + 1));

const SCALES: Record<string, { steps: number[]; ja: string; en: string }> = {
  in: { steps: [0, 1, 5, 7, 8], en: 'in (miyako-bushi)', ja: '都節' },
  yo: { steps: [0, 2, 5, 7, 9], en: 'yo', ja: '民謡音階' },
  hirajoshi: { steps: [0, 2, 3, 7, 8], en: 'hirajoshi', ja: '平調子' },
  ryukyu: { steps: [0, 4, 5, 7, 11], en: 'ryukyu', ja: '琉球音階' },
  phrygian: { steps: [0, 1, 3, 5, 7, 8, 10], en: 'phrygian', ja: 'フリジア' },
  aeolian: { steps: [0, 2, 3, 5, 7, 8, 10], en: 'aeolian', ja: 'エオリア' },
  hminor: { steps: [0, 2, 3, 5, 7, 8, 11], en: 'harmonic minor', ja: '和声的短音階' },
  ionian: { steps: [0, 2, 4, 5, 7, 9, 11], en: 'ionian', ja: 'イオニア' },
};
const NOTE = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];

interface Style {
  bpm: [number, number];
  scales: string[];
  roots: number[]; // pitch classes
  bass: 'drone' | 'bounce' | 'march' | 'drive' | 'alarm' | 'fanfare';
  drums: 'heartbeat' | 'light' | 'march' | 'heavy' | 'boss' | 'roll' | 'none';
  chords: 'pad-koto' | 'shamisen' | 'stabs' | 'hits' | 'alarm' | 'fanfare' | 'pad';
  lead: Piece['lead'];
  leadDensity: number; // 0..1
  squareBass: boolean;
  gong: boolean;
  titles: { en: string[]; ja: string[] };
}

const STYLES: Record<MusicContext, Style> = {
  title: {
    bpm: [66, 72], scales: ['in', 'hirajoshi'], roots: [2, 4, 9], bass: 'drone', drums: 'heartbeat', chords: 'pad-koto',
    lead: 'flute', leadDensity: 0.35, squareBass: false, gong: true,
    titles: { en: ['Theme', 'Omen', 'Footsteps', 'Legend'], ja: ['のテーマ', 'の予兆', 'の足音', 'の伝説'] },
  },
  tier1: {
    bpm: [112, 120], scales: ['yo', 'hirajoshi', 'ryukyu'], roots: [0, 2, 7, 9], bass: 'bounce', drums: 'light', chords: 'shamisen',
    lead: 'pulse', leadDensity: 0.55, squareBass: true, gong: false,
    titles: { en: ['Stomp', 'Scramble', 'Hatchling Hop', 'Mischief'], ja: ['ストンプ', '大騒ぎ', 'よちよち行進', 'いたずら'] },
  },
  tier2: {
    bpm: [126, 134], scales: ['in', 'phrygian', 'aeolian'], roots: [2, 4, 9, 11], bass: 'march', drums: 'march', chords: 'stabs',
    lead: 'pulse', leadDensity: 0.7, squareBass: false, gong: false,
    titles: { en: ['March', 'Advance', 'Siren Song', 'Parade'], ja: ['マーチ', '進撃', 'のサイレン', '大行進'] },
  },
  tier3: {
    bpm: [138, 146], scales: ['hminor', 'phrygian', 'in'], roots: [1, 2, 4, 6], bass: 'drive', drums: 'heavy', chords: 'hits',
    lead: 'brass', leadDensity: 0.6, squareBass: false, gong: true,
    titles: { en: ['Onslaught', 'Rampage', 'Skyline Collapse', 'Titanfall'], ja: ['猛攻', '大暴れ', '摩天楼崩壊', '巨神降臨'] },
  },
  boss: {
    bpm: [150, 156], scales: ['phrygian', 'in'], roots: [4, 6, 11], bass: 'alarm', drums: 'boss', chords: 'alarm',
    lead: 'pulse', leadDensity: 0.75, squareBass: false, gong: true,
    titles: { en: ['Showdown', 'Last Stand', 'Clash of Titans', 'Final Battle'], ja: ['決戦', '最後の砦', '巨大対決', '最終決戦'] },
  },
  victory: {
    bpm: [100, 104], scales: ['ionian', 'yo'], roots: [0, 2, 7], bass: 'fanfare', drums: 'roll', chords: 'fanfare',
    lead: 'brass', leadDensity: 0.5, squareBass: false, gong: true,
    titles: { en: ['Fanfare', 'Triumph', 'New Ruler'], ja: ['ファンファーレ', '凱歌', '新たな支配者'] },
  },
  defeat: {
    bpm: [62, 66], scales: ['in', 'hirajoshi'], roots: [2, 9], bass: 'drone', drums: 'none', chords: 'pad',
    lead: 'flute', leadDensity: 0.3, squareBass: false, gong: false,
    titles: { en: ['Requiem', 'Elegy', 'Low Tide'], ja: ['レクイエム', '哀歌', '引き潮'] },
  },
};

const PLACES = [
  ['Harbor', '港'], ['Neon Row', 'ネオン横丁'], ['Old Town', '旧市街'], ['Downtown', '中心街'], ['Shiokaze Bay', '潮風湾'], ['Midnight', '真夜中'],
] as const;
const CREATURES = [['Beast', '獣'], ['Kaiju', '怪獣'], ['Leviathan', '海獣'], ['Titan', '巨神'], ['Tidemaw', 'タイドモウ']] as const;

function makeTitle(r: Rng, style: Style) {
  const [pe, pj] = pick(r, PLACES);
  const [ce, cj] = pick(r, CREATURES);
  const i = Math.floor(r() * style.titles.en.length);
  const ge = style.titles.en[i];
  const gj = style.titles.ja[i];
  const en = r() < 0.5 ? `${ge} of the ${pe} ${ce}` : `${pe} ${ce} ${ge}`;
  const ja = `${pj}の${cj}${gj}`;
  return { en: en.replace('the Midnight', 'Midnight'), ja };
}

// Drum patterns over 16 steps: T taiko, s shime, h hat, x taiko accent.
const DRUMS: Record<Style['drums'], { taiko: number[]; shime: number[]; hat: number[] }> = {
  heartbeat: { taiko: [0, 3], shime: [], hat: [] },
  light: { taiko: [0, 8], shime: [4, 12, 14], hat: [2, 6, 10, 14] },
  march: { taiko: [0, 4, 8, 12], shime: [2, 6, 10, 14, 15], hat: [1, 3, 5, 7, 9, 11, 13, 15] },
  heavy: { taiko: [0, 3, 6, 8, 11, 14], shime: [4, 12], hat: [0, 2, 4, 6, 8, 10, 12, 14] },
  boss: { taiko: [0, 2, 4, 6, 8, 10, 12, 14], shime: [3, 7, 11, 13, 15], hat: [1, 3, 5, 7, 9, 11, 13, 15] },
  roll: { taiko: [0, 8], shime: [12, 13, 14, 15], hat: [4, 12] },
  none: { taiko: [], shime: [], hat: [] },
};

/** Scale index (can be negative / above one octave) → MIDI. */
function deg(steps: number[], idx: number, base: number) {
  const n = steps.length;
  const o = Math.floor(idx / n);
  return base + 12 * o + steps[((idx % n) + n) % n];
}

export function compose(seed: number, context: MusicContext): Piece {
  const r = mulberry32(seed ^ (context.length * 2654435761));
  const style = STYLES[context];
  const scaleName = pick(r, style.scales);
  const sc = SCALES[scaleName];
  const n = sc.steps.length;
  const rootPc = pick(r, style.roots);
  const bassBase = 36 + rootPc; // around C2..B2
  const chordBase = 48 + rootPc;
  const leadBase = 60 + rootPc;
  const bpm = int(r, style.bpm[0], style.bpm[1]);
  const stepSec = 60 / bpm / 4;

  // Progression: 4 bar roots as scale indices, starting on the tonic.
  const progA = [0, ...Array.from({ length: 3 }, () => pick(r, n === 5 ? [1, 2, 3, 4, -1] : [3, 4, 5, 6, 2, -2]))];
  const progB = [pick(r, n === 5 ? [2, 3] : [3, 5]), pick(r, n === 5 ? [1, 4] : [4, 6]), pick(r, n === 5 ? [3, 2] : [5, 3]), n === 5 ? 4 : 4];
  const form = ['A', 'A', 'B', 'A'];

  // Motifs: 2-bar melodies (32 steps) as [step, dur, scaleIdx].
  const motif = (lift: number) => {
    const out: [number, number, number][] = [];
    let idx = lift + pick(r, [0, 2, 4]);
    let step = 0;
    while (step < 32) {
      const durs = style.leadDensity > 0.6 ? [2, 2, 2, 4, 1, 1, 3] : style.leadDensity > 0.45 ? [2, 4, 2, 4, 6] : [4, 6, 8, 4];
      const d = pick(r, durs);
      if (r() < style.leadDensity || step === 0) out.push([step, Math.min(d, 32 - step), idx]);
      idx += pick(r, [-1, 1, 1, -1, 2, -2, 0, 3]);
      idx = Math.max(lift - 2, Math.min(lift + n + 2, idx));
      step += d;
    }
    // land on the tonic / fifth-ish at the phrase end
    const last = out[out.length - 1];
    last[2] = lift + (r() < 0.5 ? 0 : n === 5 ? 3 : 4);
    return out;
  };
  const motifA = motif(0);
  const motifB = motif(n === 5 ? 2 : 3);

  const bars: NoteEv[][][] = [];
  const chordOf = (root: number) => [deg(sc.steps, root, chordBase), deg(sc.steps, root + 2, chordBase), deg(sc.steps, root + (n === 5 ? 3 : 4), chordBase)];

  form.forEach((section, si) => {
    const prog = section === 'B' ? progB : progA;
    const mot = section === 'B' ? motifB : motifA;
    for (let b = 0; b < 4; b++) {
      const steps: NoteEv[][] = Array.from({ length: 16 }, () => []);
      const root = prog[b];
      const chord = chordOf(root);
      const broot = deg(sc.steps, root, bassBase);
      const push = (s: number, ev: NoteEv) => steps[s].push(ev);
      const lastBar = b === 3;

      // drums
      const dp = DRUMS[style.drums];
      for (const s of dp.taiko) push(s, { v: 'taiko', midi: [0], vel: s === 0 ? 1 : 0.7, dur: 1 });
      for (const s of dp.shime) push(s, { v: 'shime', midi: [0], vel: 0.8, dur: 1 });
      for (const s of dp.hat) push(s, { v: 'hat', midi: [0], vel: 0.7, dur: 1 });
      if (lastBar && style.drums !== 'none' && style.drums !== 'heartbeat') for (let s = 12; s < 16; s++) push(s, { v: 'taiko', midi: [0], vel: 0.5 + (s - 12) * 0.15, dur: 1 });
      if (style.gong && b === 0 && (si === 0 || section === 'B')) push(0, { v: 'gong', midi: [0], vel: 1, dur: 16 });

      // bass
      const fifth = deg(sc.steps, root + (n === 5 ? 3 : 4), bassBase);
      switch (style.bass) {
        case 'drone':
          push(0, { v: 'bass', midi: [broot], vel: 0.5, dur: 16 });
          break;
        case 'bounce':
          [0, 4, 8, 12].forEach((s, i) => push(s, { v: 'bass', midi: [i % 2 ? fifth : broot], vel: 0.7, dur: 2 }));
          push(14, { v: 'bass', midi: [broot + 12], vel: 0.5, dur: 1 });
          break;
        case 'march':
          [0, 2, 4, 6, 8, 10, 12, 14].forEach((s, i) => push(s, { v: 'bass', midi: [i === 3 || i === 7 ? fifth : broot], vel: i % 2 ? 0.55 : 0.85, dur: 1.5 }));
          break;
        case 'drive':
          for (let s = 0; s < 16; s += 2) push(s, { v: 'bass', midi: [s % 8 === 6 ? broot + 12 : broot], vel: s % 4 ? 0.6 : 0.9, dur: 1.5 });
          break;
        case 'alarm':
          for (let s = 0; s < 16; s += 2) push(s, { v: 'bass', midi: [s === 14 ? broot + 1 : s % 4 ? broot + 12 : broot], vel: 0.85, dur: 1.2 });
          break;
        case 'fanfare':
          [0, 4, 8, 12].forEach((s, i) => push(s, { v: 'bass', midi: [i % 2 ? fifth : broot], vel: 0.7, dur: 3.5 }));
          break;
      }

      // chords
      switch (style.chords) {
        case 'pad-koto':
          push(0, { v: 'pad', midi: chord, vel: 0.9, dur: 16 });
          for (let s = 0; s < 16; s += 2) if (r() < 0.55) push(s, { v: 'koto', midi: [pick(r, chord) + 12], vel: 0.5 + r() * 0.3, dur: 2 });
          break;
        case 'pad':
          push(0, { v: 'pad', midi: chord, vel: 0.9, dur: 16 });
          for (const s of [0, 6, 10]) if (r() < 0.7) push(s, { v: 'koto', midi: [pick(r, chord)], vel: 0.55, dur: 4 });
          break;
        case 'shamisen':
          for (const s of [2, 6, 10, 14]) push(s, { v: 'shamisen', midi: [pick(r, chord) + 12], vel: 0.6, dur: 1 });
          break;
        case 'stabs':
          for (const s of [2, 6, 10, 14]) push(s, { v: 'brass', midi: chord, vel: 0.65, dur: 1 });
          break;
        case 'hits':
          push(0, { v: 'brass', midi: chord, vel: 0.9, dur: 4 });
          push(8, { v: 'brass', midi: chord, vel: 0.7, dur: 2 });
          push(0, { v: 'pad', midi: chord, vel: 0.7, dur: 16 });
          break;
        case 'alarm':
          for (const s of [0, 3, 6]) push(s, { v: 'brass', midi: chord, vel: 0.85, dur: 2 });
          push(10, { v: 'brass', midi: chord.map((m) => m + 1), vel: 0.75, dur: 3 });
          push(0, { v: 'pad', midi: chord, vel: 0.6, dur: 16 });
          break;
        case 'fanfare':
          push(0, { v: 'brass', midi: chord, vel: 0.8, dur: 12 });
          break;
      }

      // lead (2-bar motif across bars b, b+1; A' varies the second half on bar 3)
      const half = b % 2;
      for (const [s, d, idx] of mot) {
        const bar = Math.floor(s / 16);
        if (bar !== half) continue;
        let mi = idx;
        if (section === 'A' && si === 1 && b >= 2 && s > 20) mi += 1; // small variation on the repeat
        push(s % 16, { v: 'lead', midi: [deg(sc.steps, mi, leadBase)], vel: 0.8, dur: d });
      }
      bars.push(steps);
    }
  });

  const t = makeTitle(r, style);
  return {
    info: {
      context, seed, en: t.en, ja: t.ja, key: NOTE[rootPc], scale: sc.en, scaleJa: sc.ja, bpm, bars: bars.length,
    },
    stepSec,
    stepsPerBar: 16,
    bars,
    lead: style.lead,
    squareBass: style.squareBass,
  };
}
