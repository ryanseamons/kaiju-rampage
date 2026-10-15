// Voyage Labs services. The Labs build (`npm run build:labs`) adds the platform's browser SDK as a
// plain script (window.VoyageLabs); every other build, and the public repository, never contains
// it. Inside the Labs player a signed-in player's best run goes on the game's own board, kept by its
// game server (labs/backend.ts) so it survives new builds (browser storage is per build there). Guests,
// and every other host, keep the local per-browser table. Every call fails soft: null means "not available".
import type { DifficultyId } from './difficulty';

interface LabsEntry { name: string; score: number; details: number[]; rank: number }
interface LabsSdk {
  ready(): void;
  player: { get(): Promise<{ displayName: string; isGuest: boolean }> };
  backend: { request(path: string, init?: RequestInit & { timeoutMs?: number }): Promise<Response> };
}

const DIFFS: DifficultyId[] = ['easy', 'medium', 'hard'];

const sdk = (): LabsSdk | null => {
  const v = (window as unknown as { VoyageLabs?: LabsSdk }).VoyageLabs;
  return v && window.parent !== window ? v : null;
};

/** A JSON call to the game server; the first one can take a few seconds while it wakes. */
async function call<T>(s: LabsSdk, path: string, init?: RequestInit): Promise<T> {
  const res = await s.backend.request(path, { timeoutMs: 20_000, ...init });
  if (!res.ok) throw new Error(`${path} ${res.status}`);
  return (await res.json()) as T;
}

let player: { name: string } | null = null;

/** Call once at startup: tells Labs the game is up and learns who is playing. */
export async function initLabs() {
  const s = sdk();
  if (!s) return;
  try {
    s.ready();
    const p = await s.player.get();
    if (!p.isGuest) player = { name: p.displayName };
  } catch (e) {
    console.warn('[labs] player unavailable', e);
  }
}

/** The signed-in Labs player's name, or null (guest, or not on Labs). */
export const labsPlayer = () => player?.name ?? null;

export interface LabsRun { score: number; difficulty: DifficultyId; wave: number; level: number; victory: boolean; endless: boolean }

/** Details stored with each entry: [difficulty 0-2, wave, level, victory, endless]. */
export async function labsSubmit(run: LabsRun): Promise<{ rank: number; total: number; best: boolean } | null> {
  const s = sdk();
  if (!s || !player) return null;
  try {
    const res = await call<{ rank: number; total: number; improved: boolean }>(s, '/score', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        score: Math.round(run.score),
        details: [DIFFS.indexOf(run.difficulty), run.wave, run.level, run.victory ? 1 : 0, run.endless ? 1 : 0],
      }),
    });
    return { rank: res.rank, total: res.total, best: res.improved };
  } catch (e) {
    console.warn('[labs] submit failed', e);
    return null;
  }
}

export interface LabsRow { name: string; score: number; difficulty: DifficultyId; wave: number; victory: boolean; endless: boolean; rank: number }
const row = (e: LabsEntry): LabsRow => ({
  name: e.name, score: e.score, rank: e.rank, difficulty: DIFFS[e.details[0]] ?? 'medium',
  wave: e.details[1] ?? 0, victory: e.details[3] === 1, endless: e.details[4] === 1,
});

/** The global top of the board and the player's own best (null when not on Labs). */
export async function labsBoard(limit = 10): Promise<{ total: number; top: LabsRow[]; mine: LabsRow | null } | null> {
  const s = sdk();
  if (!s) return null;
  try {
    const b = await call<{ total: number; entries: LabsEntry[]; mine: LabsEntry | null }>(s, `/scores?limit=${limit}`);
    return { total: b.total, top: b.entries.map(row), mine: player && b.mine ? row(b.mine) : null };
  } catch (e) {
    console.warn('[labs] board unavailable', e);
    return null;
  }
}

/** Running inside the Labs player with the SDK loaded. */
export const onLabs = () => !!sdk();
