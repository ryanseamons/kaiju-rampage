// Tiny local narration server. The ONLY place ANTHROPIC_API_KEY is read.
// POST /api/bulletin  { stats: RunStats }  → { ok: true, bulletin } | { ok: false, reason }
// GET  /api/health                         → { ok: true, hasKey, model }
import http from 'node:http';
import Anthropic from '@anthropic-ai/sdk';
import { DEFAULT_MODEL, SYSTEM_PROMPT, buildUserPrompt, parseBulletin, type RunStats } from '../src/shared/narration.ts';

const PORT = Number(process.env.PORT ?? 8787);
const MODEL = process.env.NARRATION_MODEL || DEFAULT_MODEL;
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
  const msg = await client.messages.create({
    model: MODEL,
    max_tokens: 400,
    temperature: 1,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: buildUserPrompt(stats) }],
  });
  const text = msg.content.map((b) => (b.type === 'text' ? b.text : '')).join('');
  const parsed = parseBulletin(text);
  const ms = Date.now() - t0;
  console.log(`[narration] wave ${stats.wave} → ${parsed ? 'ok' : 'unparseable'} in ${ms}ms (${msg.usage.input_tokens} in / ${msg.usage.output_tokens} out)`);
  if (!parsed) return { ok: false, reason: 'unparseable', raw: text.slice(0, 300) };
  return { ok: true, bulletin: { ...parsed, source: 'ai' }, ms, usage: msg.usage };
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? '/', 'http://localhost');
    if (req.method === 'GET' && url.pathname === '/api/health') {
      return send(res, 200, { ok: true, hasKey: !!client, model: MODEL });
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
  console.log(`[narration] listening on :${PORT} · model ${MODEL} · ${client ? 'API key loaded' : 'no ANTHROPIC_API_KEY → client uses canned bulletins'}`);
});
