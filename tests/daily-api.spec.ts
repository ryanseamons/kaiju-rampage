// The daily leaderboard rules (src/shared/daily-api.ts), checked directly, plus the briefing reading
// the global board from the server (the Node adapter in tests; Cloudflare D1 on the public site).
import { test, expect } from '@playwright/test';
import { MemoryStore, handleDaily } from '../src/shared/daily-api';

const now = new Date('2026-10-05T12:00:00Z');
const run = { name: 'kai', score: 120_000, grade: 'B', wave: 4, victory: false, level: 18, buildings: 300, kills: 220, seconds: 420, stage: 'bay' };
const post = (store: MemoryStore, day: string, body: object, ip = 'ip1') =>
  handleDaily({ method: 'POST', path: `/api/daily/${day}/scores`, query: new URLSearchParams(), body, ip, now }, store);
const get = (store: MemoryStore, day: string) =>
  handleDaily({ method: 'GET', path: `/api/daily/${day}/scores`, query: new URLSearchParams('limit=10'), body: null, ip: 'x', now }, store);

test('daily API: ranks, one score per player per day, closed days, junk and spam', async () => {
  const s = new MemoryStore();
  expect((await get(s, '2026-10-05')).body).toEqual({ day: '2026-10-05', total: 0, scores: [] });
  expect(await post(s, '2026-10-05', { ...run, token: 'player-aaaa' })).toEqual({ status: 201, body: { rank: 1, total: 1 } });
  expect((await post(s, '2026-10-05', { ...run, score: 200_000, token: 'player-bbbb' })).body).toEqual({ rank: 1, total: 2 });
  expect((await post(s, '2026-10-05', { ...run, score: 50_000, token: 'player-cccc' })).body).toEqual({ rank: 3, total: 3 });
  // one per player per day
  expect((await post(s, '2026-10-05', { ...run, score: 999_999, token: 'player-aaaa' })).status).toBe(409);
  // yesterday still open (runs that end after midnight UTC); older days closed
  expect((await post(s, '2026-10-04', { ...run, token: 'player-dddd' })).status).toBe(201);
  expect((await post(s, '2026-10-01', { ...run, token: 'player-eeee' })).status).toBe(400);
  // junk
  expect((await post(s, '2026-10-05', { ...run, name: '!!!', token: 'player-ffff' })).status).toBe(400);
  expect((await post(s, '2026-10-05', { ...run, token: 'x' })).status).toBe(400);
  expect((await post(s, '2026-10-05', { ...run, score: 9_000_000, token: 'player-gggg' })).status).toBe(400);
  expect((await post(s, '2026-10-05', { ...run, wave: 9, seconds: 10, token: 'player-hhhh' })).status).toBe(400);
  // the board, best first, cleaned names, no tokens or IPs exposed
  const board = (await get(s, '2026-10-05')).body as any;
  expect(board.scores.map((r: any) => r.score)).toEqual([200_000, 120_000, 50_000]);
  expect(board.scores[0].name).toBe('KAI');
  expect(JSON.stringify(board)).not.toMatch(/player-|ip1/);
  // per-IP cap
  const spam = new MemoryStore();
  for (let i = 0; i < 25; i++) expect((await post(spam, '2026-10-05', { ...run, token: `spammer-${String(i).padStart(4, '0')}` }, 'ipX')).status).toBe(201);
  expect((await post(spam, '2026-10-05', { ...run, token: 'spammer-9999' }, 'ipX')).status).toBe(429);
});

test('the briefing shows the global board from the server', async ({ page, request }) => {
  const today = new Date().toISOString().slice(0, 10);
  const token = `e2e-${Date.now()}`;
  const r = await request.post(`/api/daily/${today}/scores`, { data: { ...run, name: 'ZZT', score: 4321, token } });
  expect([201, 409]).toContain(r.status());
  await page.goto('/?daily=1&mute=1&lang=en');
  await page.waitForFunction(() => (window as any).__kaiju?.state()?.modal === 'title');
  await expect(page.locator('.panel.daily .dlabel')).toContainText('Global board', { timeout: 20_000 });
  await expect(page.locator('.panel.daily .dboard')).toContainText('ZZT');
});
