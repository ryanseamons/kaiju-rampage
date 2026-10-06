// Difficulty: a live setting (picked on the title screen, remembered per browser, `?difficulty=` for
// tests). Easy started as the original tuning (every multiplier 1) and was nudged up on 2026-10-06
// because it played too easy. The daily rampage is always Medium,
// so everyone plays today's city on the same terms.
import { DAILY } from './config';

export type DifficultyId = 'easy' | 'medium' | 'hard';
export const DIFFICULTIES: DifficultyId[] = ['easy', 'medium', 'hard'];

export interface DifficultyDef {
  id: DifficultyId;
  /** Enemy HP and damage, on top of the per-wave curve. */
  hp: number;
  dmg: number;
  /** Spawn rates and the caps on how many of each unit can be alive at once. */
  spawn: number;
  cap: number;
  /** Heart drops and the heal on level-up. */
  heal: number;
  /** Extra damage at tier 3, where the kaiju otherwise outgrows the army. */
  tier3Dmg: number;
  /** Tier-3 cannon batteries and helicopters: rate multiplier. */
  heavy: number;
  /** Elite spawns per wave (from wave 2). */
  elites: number;
  /** Jet runs: interval multiplier (lower is more often). */
  jetGap: number;
  /** Extra troops in the encirclement ring. */
  ring: number;
  score: number;
}

export const DIFFICULTY: Record<DifficultyId, DifficultyDef> = {
  easy: { id: 'easy', hp: 1.12, dmg: 1.15, spawn: 1.12, cap: 1.12, heal: 0.88, tier3Dmg: 1.12, heavy: 1.3, elites: 1, jetGap: 0.9, ring: 1.12, score: 0.75 },
  medium: { id: 'medium', hp: 1.4, dmg: 1.55, spawn: 1.4, cap: 1.45, heal: 0.62, tier3Dmg: 1.45, heavy: 2.1, elites: 2, jetGap: 0.72, ring: 1.4, score: 1 },
  hard: { id: 'hard', hp: 1.75, dmg: 2.0, spawn: 1.7, cap: 1.8, heal: 0.42, tier3Dmg: 1.8, heavy: 3.0, elites: 3, jetGap: 0.55, ring: 1.7, score: 1.5 },
};

const KEY = 'kaiju.difficulty';
const param = new URLSearchParams(location.search).get('difficulty') as DifficultyId | null;

function load(): DifficultyId {
  if (DAILY) return 'medium';
  if (param && DIFFICULTIES.includes(param)) return param;
  try {
    const v = localStorage.getItem(KEY) as DifficultyId | null;
    if (v && DIFFICULTIES.includes(v)) return v;
  } catch {
    /* ignore */
  }
  return 'medium';
}

let current: DifficultyId = load();

/** The difficulty in force. Read it when a run or wave starts, not at module load. */
export const difficulty = () => DIFFICULTY[current];
export const difficultyId = () => current;
/** The picker is locked on the daily rampage. */
export const difficultyLocked = () => !!DAILY;

export function setDifficulty(id: DifficultyId) {
  if (difficultyLocked() || !DIFFICULTIES.includes(id)) return;
  current = id;
  try {
    localStorage.setItem(KEY, id);
  } catch {
    /* ignore */
  }
}

export const cycleDifficulty = () => setDifficulty(DIFFICULTIES[(DIFFICULTIES.indexOf(current) + 1) % DIFFICULTIES.length]);
