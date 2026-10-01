// Tiny local narration server. The ONLY place ANTHROPIC_API_KEY is read.
// POST /api/bulletin  { stats: RunStats }  → { ok: true, bulletin } | { ok: false, reason }
// GET  /api/health                         → { ok: true, hasKey, model }
// GET/POST /api/daily/:day/scores           → the daily leaderboard (src/shared/daily-api.ts), kept in a JSON
//                                             file under DAILY_DATA_DIR (default .data/). Any self-hosted deploy
//                                             can serve the board this way; the public site uses Cloudflare D1.
import http from 'node:http';
import Anthropic from '@anthropic-ai/sdk';
import fs from 'node:fs';
import path from 'node:path';
import { DEFAULT_EFFORT, DEFAULT_MODEL, SYSTEM_PROMPT, buildUserPrompt, parseBulletin, type RunStats } from '../src/shared/narration.ts';
import { MemoryStore, handleDaily, hashIp, type DailyEntry } from '../src/shared/daily-api.ts';

// Optional gitignored .env next to package.json (ANTHROPIC_API_KEY=...). An explicitly set
// environment variable (even an empty one) always wins, so tests can force the no-key path.
if (process.env.ANTHROPIC_API_KEY === undefined) {
  try {
    process.loadEnvFile('.env');
  } catch {
    /* no .env — fine */
  }
}

// Deliberately not `PORT`: IDE launchers and hosts often export PORT for the *web* server, which would
// make this process fight Vite for the same port.
const PORT = Number(process.env.NARRATION_PORT ?? 8787);
const MODEL = process.env.NARRATION_MODEL || DEFAULT_MODEL;
const EFFORT = (process.env.NARRATION_EFFORT || DEFAULT_EFFORT) as 'low' | 'medium' | 'high';
const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
const client = apiKey
  ? new Anthropic({ apiKey, baseURL: process.env.ANTHROPIC_BASE_URL || undefined, timeout: 15_000, maxRetries: 1 })
  : null;

function send(res: http.ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' });
  res.end(JSON.stringify(body));
}

async function readJson(req: http.IncomingMessage): Promise<any> {
  let data = '';
  for await (const chunk of req) {
    data += chunk;
    if (data.length > 32_000) throw new Error('body too large');
  }
  return JSON.parse(data || '{}');
}

async function bulletin(stats: RunStats) {
  if (!client) return { ok: false, reason: 'no-key' };
  const t0 = Date.now();
  // Opus 5.5: thinking is always on (adaptive) and sampling params are rejected, so depth is set via effort.
  // Server-side refusal fallback keeps a declined request from silently failing; if the whole chain declines
  // we return not-ok and the client shows canned copy.
  const msg = await client.beta.messages.create({
    model: MODEL,
    max_tokens: 4000,
    output_config: { effort: EFFORT },
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: buildUserPrompt(stats) }],
  });
  if (msg.stop_reason === 'refusal') return { ok: false, reason: 'refusal' };
  const text = msg.content.map((b) => (b.type === 'text' ? b.text : '')).join('');
  const parsed = parseBulletin(text);
  const ms = Date.now() - t0;
  console.log(`[narration] wave ${stats.wave} → ${parsed ? 'ok' : 'unparseable'} in ${ms}ms (${msg.usage.input_tokens} in / ${msg.usage.output_tokens} out)`);
  if (!parsed) return { ok: false, reason: 'unparseable', raw: text.slice(0, 300) };
  return { ok: true, bulletin: { ...parsed, source: 'ai' }, ms, usage: msg.usage };
}

/** The daily board in a JSON file: fine for a local or small self-hosted board. */
class FileStore extends MemoryStore {
  constructor(private file: string) {
    super();
    try {
      this.rows = JSON.parse(fs.readFileSync(file, 'utf8')) as DailyEntry[];
    } catch {
      this.rows = [];
    }
  }
  async insert(e: DailyEntry) {
    const r = await super.insert(e);
    if (r === 'ok') {
      // keep 30 days
      const cutoff = new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10);
      this.rows = this.rows.filter((x) => x.day >= cutoff);
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      fs.writeFileSync(this.file, JSON.stringify(this.rows));
    }
    return r;
  }
}
const dailyStore = new FileStore(path.join(process.env.DAILY_DATA_DIR || '.data', 'daily.json'));
const DAILY_SALT = process.env.DAILY_SALT || 'kaiju-local';

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? '/', 'http://localhost');
    if (req.method === 'GET' && url.pathname === '/api/health') {
      return send(res, 200, { ok: true, hasKey: !!client, model: MODEL, effort: EFFORT });
    }
    if (url.pathname.startsWith('/api/daily/')) {
      const body = req.method === 'POST' ? await readJson(req) : null;
      const ip = await hashIp(String(req.headers['x-forwarded-for'] ?? req.socket.remoteAddress ?? 'local'), DAILY_SALT);
      const r = await handleDaily({ method: req.method ?? 'GET', path: url.pathname, query: url.searchParams, body, ip, now: new Date() }, dailyStore);
      return send(res, r.status, r.body);
    }
    if (req.method === 'POST' && url.pathname === '/api/bulletin') {
      const body = await readJson(req);
      if (!body?.stats || typeof body.stats.wave !== 'number') return send(res, 400, { ok: false, reason: 'bad-request' });
      return send(res, 200, await bulletin(body.stats as RunStats));
    }
    send(res, 404, { ok: false, reason: 'not-found' });
  } catch (err) {
    console.warn('[narration] request failed:', (err as Error).message);
    send(res, 200, { ok: false, reason: 'upstream-error' });
  }
});

server.listen(PORT, () => {
  console.log(`[narration] listening on :${PORT} · model ${MODEL} (effort ${EFFORT}) · ${client ? 'API key loaded' : 'no ANTHROPIC_API_KEY → client uses the shipped news bank (default)'}`);
});
