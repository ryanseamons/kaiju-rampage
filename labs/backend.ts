// Voyage Labs game server: the game's own high-score board. Labs stopped hosting leaderboards, so each
// signed-in player's best run lives in this game's SQL database (one row per player), and survives new
// builds. The Labs CLI bundles this file with the SDK from the gitignored vendor/ folder
// (scripts/labs-sdk.sh); it is never part of the public build.
import { defineBackend, type BackendIdentity } from '../vendor/voyage-labs-sdk/dist/server.js';

const SCHEMA = `CREATE TABLE IF NOT EXISTS scores (
  player_id TEXT PRIMARY KEY, name TEXT NOT NULL, score INTEGER NOT NULL, details TEXT NOT NULL, updated_at INTEGER NOT NULL
)`;
const INDEX = 'CREATE INDEX IF NOT EXISTS scores_rank ON scores(score DESC, updated_at, player_id)';
const MAX_SCORE = 100_000_000;
// Earlier holders of a tied score rank first; player ID breaks exact ties so ranks are stable.
const RANKED = `SELECT player_id, name, score, details,
  ROW_NUMBER() OVER (ORDER BY score DESC, updated_at ASC, player_id ASC) AS rank FROM scores`;

type Row = { player_id: string; name: string; score: number; details: string; rank: number };
type Db = { query<T extends Record<string, unknown>>(sql: string, params?: unknown[]): Promise<{ results: T[] }> };
const entry = (r: Row) => ({ name: r.name, score: r.score, details: JSON.parse(r.details) as number[], rank: r.rank });
const json = (body: unknown, status = 200) => Response.json(body, { status });

async function list(url: URL, db: Db, identity: BackendIdentity) {
  const limit = Number(url.searchParams.get('limit') ?? 10);
  if (!Number.isInteger(limit) || limit < 1 || limit > 50) return json({ error: 'Invalid limit' }, 400);
  const me = identity.isGuest ? null : identity.playerId;
  const rows = (await db.query<Row>(`WITH ranked AS (${RANKED}) SELECT * FROM ranked WHERE rank <= ? OR player_id = ? ORDER BY rank`, [limit, me])).results;
  const total = (await db.query<{ total: number }>('SELECT COUNT(*) AS total FROM scores')).results[0]?.total ?? 0;
  const mine = rows.find((r) => r.player_id === me);
  return json({ total, entries: rows.filter((r) => r.rank <= limit).map(entry), mine: mine ? entry(mine) : null });
}

async function submit(request: Request, db: Db, identity: BackendIdentity) {
  if (identity.isGuest || !identity.playerId) return json({ error: 'Sign in to submit scores' }, 401);
  const text = await request.text();
  if (text.length > 512) return json({ error: 'Score too large' }, 413);
  let input: { score?: unknown; details?: unknown };
  try { input = JSON.parse(text); } catch { return json({ error: 'Invalid JSON' }, 400); }
  const d = input?.details;
  // details: [difficulty 0-2, wave, level, victory 0/1, endless 0/1]
  const ok = Number.isSafeInteger(input?.score) && (input.score as number) >= 0 && (input.score as number) <= MAX_SCORE
    && Array.isArray(d) && d.length === 5 && d.every((n) => Number.isInteger(n) && n >= 0 && n <= 999)
    && d[0] <= 2 && d[3] <= 1 && d[4] <= 1;
  if (!ok) return json({ error: 'Invalid score or details' }, 400);
  const name = identity.displayName?.trim() || `Kaiju #${identity.playerId.slice(-4)}`;
  // Compare and write in one statement, so two runs finishing together can't replace a better score.
  const written = await db.query(`INSERT INTO scores (player_id, name, score, details, updated_at) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(player_id) DO UPDATE SET name = excluded.name, score = excluded.score, details = excluded.details,
      updated_at = excluded.updated_at WHERE excluded.score > scores.score RETURNING score`,
  [identity.playerId, name, input.score, JSON.stringify(d), Date.now()]);
  const res = (await db.query<{ rank: number; total: number }>(`WITH ranked AS (${RANKED})
    SELECT rank, (SELECT COUNT(*) FROM scores) AS total FROM ranked WHERE player_id = ?`, [identity.playerId])).results[0];
  return json({ rank: res?.rank ?? 0, total: res?.total ?? 0, improved: written.results.length > 0 });
}

// console.* goes to `voyage-labs logs`. Player IDs are opaque; only a short prefix is logged.
export default defineBackend({
  async start(context) {
    await context.database.query(SCHEMA);
    await context.database.query(INDEX);
    console.info('kaiju-rampage backend ready');
  },
  async fetch(request, context, identity) {
    const url = new URL(request.url);
    const response = url.pathname === '/scores' && request.method === 'GET' ? await list(url, context.database, identity)
      : url.pathname === '/score' && request.method === 'POST' ? await submit(request, context.database, identity)
      : json({ error: 'Not found' }, 404);
    console.info('kaiju', request.method, url.pathname, response.status, identity.isGuest ? 'guest' : `player:${identity.playerId.slice(0, 6)}`);
    return response;
  },
});
