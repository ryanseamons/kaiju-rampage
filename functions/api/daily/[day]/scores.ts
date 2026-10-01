// Cloudflare Pages Function: the daily leaderboard on D1 (binding DB, see wrangler.toml).
// All logic lives in src/shared/daily-api.ts; this file only adapts D1 to its DailyStore interface.
import { handleDaily, hashIp, type DailyEntry, type DailyRow, type DailyStore } from '../../../../src/shared/daily-api';

interface D1Stmt {
  bind(...v: unknown[]): D1Stmt;
  all<T>(): Promise<{ results: T[] }>;
  first<T>(): Promise<T | null>;
  run(): Promise<unknown>;
}
interface D1 {
  prepare(sql: string): D1Stmt;
  exec(sql: string): Promise<unknown>;
}
interface Env {
  DB?: D1;
  DAILY_SALT?: string;
}
interface Ctx {
  request: Request;
  env: Env;
}

let ready: Promise<unknown> | null = null;
// D1 exec runs one statement per line, so each statement stays on a single line.
const SCHEMA = [
  'CREATE TABLE IF NOT EXISTS daily_scores (day TEXT NOT NULL, token TEXT NOT NULL, name TEXT NOT NULL, score INTEGER NOT NULL, grade TEXT NOT NULL, wave INTEGER NOT NULL, victory INTEGER NOT NULL, level INTEGER NOT NULL, buildings INTEGER NOT NULL, kills INTEGER NOT NULL, seconds INTEGER NOT NULL, stage TEXT NOT NULL, ip TEXT NOT NULL, at TEXT NOT NULL, PRIMARY KEY (day, token));',
  'CREATE INDEX IF NOT EXISTS daily_scores_rank ON daily_scores (day, score DESC);',
].join('\n');

class D1Store implements DailyStore {
  constructor(private db: D1) {}
  async top(day: string, limit: number) {
    const r = await this.db
      .prepare('SELECT name, score, grade, wave, victory, level, buildings, kills, seconds, stage, at FROM daily_scores WHERE day = ? ORDER BY score DESC, at ASC LIMIT ?')
      .bind(day, limit)
      .all<DailyRow & { victory: number }>();
    return r.results.map((x) => ({ ...x, victory: !!x.victory }));
  }
  async count(day: string) {
    return (await this.db.prepare('SELECT COUNT(*) AS n FROM daily_scores WHERE day = ?').bind(day).first<{ n: number }>())?.n ?? 0;
  }
  async higher(day: string, score: number) {
    return (await this.db.prepare('SELECT COUNT(*) AS n FROM daily_scores WHERE day = ? AND score > ?').bind(day, score).first<{ n: number }>())?.n ?? 0;
  }
  async insert(e: DailyEntry) {
    try {
      await this.db
        .prepare('INSERT INTO daily_scores (day, token, name, score, grade, wave, victory, level, buildings, kills, seconds, stage, ip, at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .bind(e.day, e.token, e.name, e.score, e.grade, e.wave, e.victory ? 1 : 0, e.level, e.buildings, e.kills, e.seconds, e.stage, e.ip, e.at)
        .run();
      return 'ok' as const;
    } catch (err) {
      if (/UNIQUE|PRIMARY KEY/i.test(String(err))) return 'duplicate' as const;
      throw err;
    }
  }
  async fromIp(day: string, ip: string) {
    return (await this.db.prepare('SELECT COUNT(*) AS n FROM daily_scores WHERE day = ? AND ip = ?').bind(day, ip).first<{ n: number }>())?.n ?? 0;
  }
}

// Open to other origins, so another deployment (e.g. an internal one built with VITE_DAILY_API pointing
// here) shares this board. Scores are honour-system anyway; the rules live in daily-api.ts.
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'GET, POST, OPTIONS', 'access-control-allow-headers': 'content-type', 'access-control-max-age': '86400' };

async function handle({ request, env }: Ctx) {
  if (!env.DB) return new Response(JSON.stringify({ error: 'board-not-configured' }), { status: 503, headers: { 'content-type': 'application/json', ...CORS } });
  const db = env.DB;
  ready ??= db.exec(SCHEMA);
  await ready;
  const url = new URL(request.url);
  const body = request.method === 'POST' ? await request.json().catch(() => null) : null;
  const ip = await hashIp(request.headers.get('CF-Connecting-IP') ?? 'unknown', env.DAILY_SALT ?? 'kaiju');
  const r = await handleDaily({ method: request.method, path: url.pathname, query: url.searchParams, body, ip, now: new Date() }, new D1Store(db));
  return new Response(JSON.stringify(r.body), { status: r.status, headers: { 'content-type': 'application/json', 'cache-control': r.status === 200 ? 'public, max-age=15' : 'no-store', ...CORS } });
}

export const onRequestGet = handle;
export const onRequestPost = handle;
export const onRequestOptions = () => new Response(null, { status: 204, headers: CORS });
