// Voyage Labs services. The Labs build (`npm run build:labs`) adds the platform's browser SDK as a
// plain script (window.VoyageLabs); every other build, and the public repository, never contains
// it. Inside the Labs player a signed-in player's best run goes on the game's `highscores`
// leaderboard, which survives new builds (browser storage is per build there). Guests, and every
// other host, keep the local per-browser table. Every call fails soft: null means "not available".
import type { DifficultyId } from './difficulty';

interface LabsEntry { username: string; score: number; details: number[]; rank: number }
interface LabsBoard {
  submit(input: { score: number; details?: number[]; method?: 'keepBest' | 'forceUpdate' }): Promise<{ rank: number; updated: boolean }>;
  list(query?: { scope?: 'global'; start?: number; limit?: number }): Promise<{ total: number; entries: LabsEntry[] }>;
  getMyEntry(): Promise<LabsEntry | null>;
}
interface LabsSdk {
  ready(): void;
  player: { get(): Promise<{ displayName: string; isGuest: boolean }> };
  leaderboards: { board(name: string): LabsBoard };
}

const BOARD = 'highscores';
const DIFFS: DifficultyId[] = ['easy', 'medium', 'hard'];

const sdk = (): LabsSdk | null => {
  const v = (window as unknown as { VoyageLabs?: LabsSdk }).VoyageLabs;
  return v && window.parent !== window ? v : null;
};

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
    const board = s.leaderboards.board(BOARD);
    const res = await board.submit({
      score: Math.round(run.score),
      details: [DIFFS.indexOf(run.difficulty), run.wave, run.level, run.victory ? 1 : 0, run.endless ? 1 : 0],
      method: 'keepBest',
    });
    const { total } = await board.list({ scope: 'global', limit: 1 });
    return { rank: res.rank, total, best: res.updated };
  } catch (e) {
    console.warn('[labs] submit failed', e);
    return null;
  }
}

export interface LabsRow { name: string; score: number; difficulty: DifficultyId; wave: number; victory: boolean; endless: boolean; rank: number }
const row = (e: LabsEntry): LabsRow => ({
  name: e.username, score: e.score, rank: e.rank, difficulty: DIFFS[e.details[0]] ?? 'medium',
  wave: e.details[1] ?? 0, victory: e.details[3] === 1, endless: e.details[4] === 1,
});

/** The global top of the board and the player's own best (null when not on Labs). */
export async function labsBoard(limit = 10): Promise<{ total: number; top: LabsRow[]; mine: LabsRow | null } | null> {
  const s = sdk();
  if (!s) return null;
  try {
    const board = s.leaderboards.board(BOARD);
    const [list, mine] = await Promise.all([board.list({ scope: 'global', limit }), player ? board.getMyEntry() : Promise.resolve(null)]);
    return { total: list.total, top: list.entries.map(row), mine: mine ? row(mine) : null };
  } catch (e) {
    console.warn('[labs] board unavailable', e);
    return null;
  }
}

/** Running inside the Labs player with the SDK loaded. */
export const onLabs = () => !!sdk();
