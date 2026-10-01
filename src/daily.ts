// The daily rampage: a pure function from a UTC date to that day's content (stage, twists, featured
// enemy, boss), plus the run's bookkeeping (daily number, ranked attempt, share line).
// Everything rotates in shuffled cycles, so each stage, twist, enemy and boss turns up regularly.
import { mulberry32 } from './rng';

export const STAGES = ['bay', 'market', 'neon', 'harbor', 'snow', 'typhoon'] as const;
export const TWISTS = ['glass', 'blackout', 'starving', 'air', 'giant', 'firestorm'] as const;
export const THREATS = ['maser', 'drones', 'freeze', 'netheli', 'railgun', 'sub', 'riot'] as const;
export const BOSSES = ['guardian', 'tetsuryu', 'kumo', 'hikari'] as const;
export type StageId = (typeof STAGES)[number];
export type TwistId = (typeof TWISTS)[number];
export type ThreatId = (typeof THREATS)[number];
export type BossId = (typeof BOSSES)[number];

/** Content that exists in the game so far. A day only ever draws from these. */
export const AVAILABLE = {
  stages: ['bay'] as StageId[],
  twists: [] as TwistId[],
  threats: [] as ThreatId[],
  bosses: ['guardian'] as BossId[],
};

/** Daily #1. */
export const EPOCH = '2026-09-30';

export interface DailyConfig {
  key: string;
  number: number;
  stage: StageId;
  twists: TwistId[];
  threat: ThreatId | null;
  boss: BossId;
}

const DAY_MS = 86_400_000;
const dayIndex = (key: string) => Math.round((Date.parse(`${key}T00:00:00Z`) - Date.parse(`${EPOCH}T00:00:00Z`)) / DAY_MS);

/** Element i of a cycle that visits every item once per round, in a different shuffled order each round. */
function cycle<T>(items: readonly T[], i: number, salt: number): T {
  const n = items.length;
  const round = Math.floor(i / n), pos = ((i % n) + n) % n;
  const r = mulberry32((round * 2654435761) ^ salt);
  const order = items.map((_, k) => k);
  for (let k = n - 1; k > 0; k--) {
    const j = Math.floor(r() * (k + 1));
    [order[k], order[j]] = [order[j], order[k]];
  }
  return items[order[pos]];
}

/** Twists that would fight each other, so never paired. */
const CLASH: [TwistId, TwistId][] = [['giant', 'starving']];

export function dailyConfig(key: string, avail = AVAILABLE): DailyConfig {
  const i = dayIndex(key);
  const stage = avail.stages.length ? cycle(avail.stages, i, 0x51a6e) : 'bay';
  const twists: TwistId[] = [];
  if (avail.twists.length) {
    twists.push(cycle(avail.twists, i, 0x7a157));
    // A second twist about one day in three.
    const extra = cycle(avail.twists, i + 3, 0x2e7a1);
    const r = mulberry32(i * 7919 + 13)();
    if (r < 0.34 && extra !== twists[0] && !CLASH.some(([a, b]) => twists.includes(a) ? extra === b : twists.includes(b) && extra === a)) twists.push(extra);
  }
  const threat = avail.threats.length ? cycle(avail.threats, i, 0x7e2ea) : null;
  const boss = avail.bosses.length ? cycle(avail.bosses, i, 0xb055) : 'guardian';
  return { key, number: i + 1, stage, twists, threat, boss };
}

/** Milliseconds until the next UTC midnight (when the daily rolls over). */
export const msToReset = (now = Date.now()) => DAY_MS - (now % DAY_MS);

// ── Ranked attempt (one per day, per browser; the server enforces it too) ─────────
const ATTEMPTS_KEY = 'kaiju.dailyAttempts';
const TOKEN_KEY = 'kaiju.playerToken';

function readAttempts(): Record<string, true> {
  try {
    return JSON.parse(localStorage.getItem(ATTEMPTS_KEY) ?? '{}');
  } catch {
    return {};
  }
}
export const rankedUsed = (key: string) => !!readAttempts()[key];
export function markRanked(key: string) {
  try {
    const a = readAttempts();
    a[key] = true;
    // keep two weeks of history
    for (const k of Object.keys(a).sort().slice(0, -14)) delete a[k];
    localStorage.setItem(ATTEMPTS_KEY, JSON.stringify(a));
  } catch {
    /* private mode: every run is ranked, the server still dedupes */
  }
}
/** A random per-browser id the leaderboard uses to allow one ranked score per day. */
export function playerToken(): string {
  try {
    let t = localStorage.getItem(TOKEN_KEY);
    if (!t) {
      t = crypto.randomUUID();
      localStorage.setItem(TOKEN_KEY, t);
    }
    return t;
  } catch {
    return 'anon';
  }
}

/** The copyable result line, Wordle-style. */
export function shareLine(o: { number: number; stageName: string; score: number; grade: string; buildings: number; kills: number; victory: boolean; wave: number; ranked: boolean }) {
  const result = o.victory ? '👑 mech down' : `💀 wave ${o.wave}`;
  return [
    `Kaiju Rampage Daily #${o.number}${o.ranked ? '' : ' (practice)'} · ${o.stageName}`,
    `🏙️ ${o.buildings}  🪖 ${o.kills}  ${result}`,
    `${o.score.toLocaleString('en-US')} · ${o.grade}`,
    'kaiju.ryanseamons.com',
  ].join('\n');
}
