// Client for the global daily leaderboard (API in src/shared/daily-api.ts). Same-origin by default
// (Cloudflare Pages Functions on the public site, the Node server in dev); VITE_DAILY_API points a
// build at another host. Every call fails soft: no network, no board, the game carries on.
import type { DailyRow } from './shared/daily-api';
import { playerToken } from './daily';

const BASE = (import.meta.env.VITE_DAILY_API as string | undefined) ?? '';
const TIMEOUT_MS = 5000;

export interface Board {
  total: number;
  scores: DailyRow[];
}

export async function fetchBoard(day: string, limit = 10): Promise<Board | null> {
  try {
    const r = await fetch(`${BASE}/api/daily/${day}/scores?limit=${limit}`, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!r.ok) return null;
    const j = (await r.json()) as Board;
    return Array.isArray(j.scores) ? j : null;
  } catch {
    return null;
  }
}

export type SubmitResult = { ok: true; rank: number; total: number } | { ok: false; reason: string };

export async function submitScore(day: string, run: Omit<DailyRow, 'at'>): Promise<SubmitResult> {
  try {
    const r = await fetch(`${BASE}/api/daily/${day}/scores`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...run, token: playerToken() }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const j = (await r.json().catch(() => ({}))) as { rank?: number; total?: number; error?: string };
    if (r.status === 201 && typeof j.rank === 'number') return { ok: true, rank: j.rank, total: j.total ?? j.rank };
    return { ok: false, reason: j.error ?? `http-${r.status}` };
  } catch {
    return { ok: false, reason: 'offline' };
  }
}
