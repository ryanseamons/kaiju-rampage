// The daily leaderboard API, as pure handlers over a small storage interface. Two thin adapters
// serve it: Cloudflare Pages Functions + D1 (functions/api/daily/) for the public site, and the
// Node server (server/index.ts, a JSON file) for local dev, the tests, or any self-hosted deploy.
//
//   GET  /api/daily/:day/scores?limit=20  → { day, total, scores: DailyRow[] }
//   POST /api/daily/:day/scores           → 201 { rank, total } | 409 already-submitted | 400 / 429
//
// One ranked score per player token per day. The token is a random id kept in the browser, so this
// is honour-system fairness: enough to keep a friendly board tidy, not to stop a determined cheat.

export interface DailyRow {
  name: string;
  score: number;
  grade: string;
  wave: number;
  victory: boolean;
  level: number;
  buildings: number;
  kills: number;
  seconds: number;
  stage: string;
  at: string; // ISO time
}

export interface DailyEntry extends DailyRow {
  day: string;
  token: string;
  ip: string; // hashed
}

export interface DailyStore {
  top(day: string, limit: number): Promise<DailyRow[]>;
  count(day: string): Promise<number>;
  /** How many entries score strictly higher (rank = this + 1). */
  higher(day: string, score: number): Promise<number>;
  /** Insert unless (day, token) exists. */
  insert(e: DailyEntry): Promise<'ok' | 'duplicate'>;
  /** Entries from this hashed IP today (a soft cap against spam). */
  fromIp(day: string, ip: string): Promise<number>;
}

export interface ApiRequest {
  method: string;
  path: string; // e.g. /api/daily/2026-10-05/scores
  query: URLSearchParams;
  body: unknown;
  ip: string; // hashed or 'local'
  now: Date;
}
export interface ApiResponse {
  status: number;
  body: unknown;
}

const ROUTE = /^\/api\/daily\/(\d{4}-\d{2}-\d{2})\/scores\/?$/;
const MAX_PER_IP = 25;
const MAX_SCORE = 5_000_000;

const utcDay = (d: Date) => d.toISOString().slice(0, 10);

/** Only today's daily (and yesterday's, for runs that end just after midnight UTC) take scores. */
function openForScores(day: string, now: Date) {
  const today = utcDay(now);
  const yesterday = utcDay(new Date(now.getTime() - 86_400_000));
  return day === today || day === yesterday;
}

const int = (v: unknown, lo: number, hi: number) => (typeof v === 'number' && Number.isInteger(v) && v >= lo && v <= hi ? v : null);

/** Validates a submitted run. Returns the cleaned row or an error message. */
export function validate(body: any): DailyRow | string {
  if (!body || typeof body !== 'object') return 'body must be an object';
  const name = typeof body.name === 'string' ? body.name.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 3) : '';
  if (!name) return 'name must be 1-3 letters or digits';
  const score = int(body.score, 0, MAX_SCORE);
  const wave = int(body.wave, 1, 99);
  const level = int(body.level, 1, 500);
  const buildings = int(body.buildings, 0, 100_000);
  const kills = int(body.kills, 0, 100_000);
  const seconds = int(body.seconds, 0, 86_400);
  if (score === null || wave === null || level === null || buildings === null || kills === null || seconds === null) return 'numbers out of range';
  // Plausibility, loosely: points need time on the clock, and later waves need earlier ones.
  // (Generous on purpose: a twist can start the army at a later wave, and big combos score fast.)
  if (seconds < (wave - 3) * 30) return 'implausible: too fast for that wave';
  if (score > 150_000 * wave + 1_000 * seconds) return 'implausible: score too high for that run';
  const grade = typeof body.grade === 'string' && /^[SABCD]$/.test(body.grade) ? body.grade : 'D';
  const stage = typeof body.stage === 'string' ? body.stage.replace(/[^a-z]/g, '').slice(0, 16) || 'bay' : 'bay';
  return { name, score, grade, wave, victory: !!body.victory, level, buildings, kills, seconds, stage, at: '' };
}

export async function handleDaily(req: ApiRequest, store: DailyStore): Promise<ApiResponse> {
  const m = ROUTE.exec(req.path);
  if (!m) return { status: 404, body: { error: 'not-found' } };
  const day = m[1];
  if (req.method === 'GET') {
    const limit = Math.max(1, Math.min(100, Number(req.query.get('limit') ?? 20) || 20));
    const [scores, total] = await Promise.all([store.top(day, limit), store.count(day)]);
    return { status: 200, body: { day, total, scores } };
  }
  if (req.method === 'POST') {
    if (!openForScores(day, req.now)) return { status: 400, body: { error: 'day-closed' } };
    const b = req.body as any;
    const token = typeof b?.token === 'string' && /^[A-Za-z0-9-]{8,64}$/.test(b.token) ? b.token : null;
    if (!token) return { status: 400, body: { error: 'bad-token' } };
    const row = validate(b);
    if (typeof row === 'string') return { status: 400, body: { error: row } };
    if ((await store.fromIp(day, req.ip)) >= MAX_PER_IP) return { status: 429, body: { error: 'too-many' } };
    const entry: DailyEntry = { ...row, at: req.now.toISOString(), day, token, ip: req.ip };
    if ((await store.insert(entry)) === 'duplicate') return { status: 409, body: { error: 'already-submitted' } };
    const [higher, total] = await Promise.all([store.higher(day, row.score), store.count(day)]);
    return { status: 201, body: { rank: higher + 1, total } };
  }
  return { status: 405, body: { error: 'method-not-allowed' } };
}

/** A hex SHA-256 of the client IP (never stored raw). Works in Workers and Node 20+. */
export async function hashIp(ip: string, salt: string) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${salt}:${ip}`));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 32);
}

/** In-memory store (tests, and the base for the Node file store). */
export class MemoryStore implements DailyStore {
  rows: DailyEntry[] = [];
  private sorted(day: string) {
    return this.rows.filter((r) => r.day === day).sort((a, b) => b.score - a.score || a.at.localeCompare(b.at));
  }
  async top(day: string, limit: number) {
    return this.sorted(day)
      .slice(0, limit)
      .map(({ day: _d, token: _t, ip: _i, ...row }) => row);
  }
  async count(day: string) {
    return this.rows.filter((r) => r.day === day).length;
  }
  async higher(day: string, score: number) {
    return this.rows.filter((r) => r.day === day && r.score > score).length;
  }
  async insert(e: DailyEntry) {
    if (this.rows.some((r) => r.day === e.day && r.token === e.token)) return 'duplicate' as const;
    this.rows.push(e);
    return 'ok' as const;
  }
  async fromIp(day: string, ip: string) {
    return this.rows.filter((r) => r.day === day && r.ip === ip).length;
  }
}
