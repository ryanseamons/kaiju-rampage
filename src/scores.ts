// Local leaderboards (per browser): an all-time top 10 and a top 10 per daily seed.
// A shared global board would need a backend (e.g. Pages Functions + KV); see README follow-ups.
import { DAILY, FAST, START_WAVE } from './config';

export interface ScoreEntry {
  name: string;
  score: number;
  grade: string;
  wave: number;
  victory: boolean;
  endless: boolean;
  level: number;
  date: string; // ISO
  daily?: string;
  /** Missing on runs from before difficulty existed: those were Easy. */
  difficulty?: 'easy' | 'medium' | 'hard';
}

const ALL_KEY = 'kaiju.scores.v2';
const DAILY_KEY = 'kaiju.daily.v2';
const NAME_KEY = 'kaiju.name';
const MAX = 10;

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
function write(key: string, v: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(v));
  } catch {
    /* private mode etc. */
  }
}

export const loadBoard = (): ScoreEntry[] => read<ScoreEntry[]>(ALL_KEY, []);
export const loadDaily = (day: string): ScoreEntry[] => read<Record<string, ScoreEntry[]>>(DAILY_KEY, {})[day] ?? [];
export const lastName = () => read<string>(NAME_KEY, 'KAI');

/** Test runs (?fast=1) and debug starts (?startWave) never reach the boards. */
export const countsForBoards = () => !FAST && START_WAVE === 1;

function rankIn(list: ScoreEntry[], score: number) {
  const i = list.findIndex((e) => score > e.score);
  const r = i < 0 ? list.length : i;
  return r < MAX ? r + 1 : 0;
}

/** 1-based rank this score would take on the all-time (or today's daily) board, or 0. */
export function qualifies(score: number): number {
  if (!countsForBoards() || score <= 0) return 0;
  return rankIn(DAILY ? loadDaily(DAILY) : loadBoard(), score);
}

export function submit(e: Omit<ScoreEntry, 'daily' | 'date'>): { rank: number; dailyRank: number } {
  if (!countsForBoards()) return { rank: 0, dailyRank: 0 };
  const entry: ScoreEntry = { ...e, name: e.name.toUpperCase().slice(0, 3), date: new Date().toISOString(), daily: DAILY ?? undefined };
  write(NAME_KEY, entry.name);
  const all = loadBoard();
  const rank = rankIn(all, entry.score);
  if (rank) {
    all.splice(rank - 1, 0, entry);
    write(ALL_KEY, all.slice(0, MAX));
  }
  let dailyRank = 0;
  if (DAILY) {
    const days = read<Record<string, ScoreEntry[]>>(DAILY_KEY, {});
    const list = days[DAILY] ?? [];
    dailyRank = rankIn(list, entry.score);
    if (dailyRank) {
      list.splice(dailyRank - 1, 0, entry);
      days[DAILY] = list.slice(0, MAX);
      // keep the last 14 days only
      for (const k of Object.keys(days).sort().slice(0, -14)) delete days[k];
      write(DAILY_KEY, days);
    }
  }
  return { rank, dailyRank };
}

export function gradeFor(score: number, victory: boolean): string {
  if (victory && score >= 250_000) return 'S';
  if (score >= 150_000) return 'A';
  if (score >= 70_000) return 'B';
  if (score >= 25_000) return 'C';
  return 'D';
}
