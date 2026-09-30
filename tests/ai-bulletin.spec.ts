// "With key" path: the narration server is started with ANTHROPIC_API_KEY set and
// ANTHROPIC_BASE_URL pointed at a local mock of the Messages API (tests/mock-anthropic.mjs).
// The browser's /api calls are routed to that keyed server. The game code is identical.
import { test, expect } from '@playwright/test';
import { Bot, type KState } from './bot';

const KEYED = 'http://localhost:8792';

test('wave-end bulletin comes from the model when a key is configured', async ({ page }) => {
  const health = await (await page.request.get(`${KEYED}/api/health`)).json();
  expect(health).toMatchObject({ ok: true, hasKey: true, model: 'claude-opus-5-5', effort: 'medium' });

  let bulletinRequests = 0;
  await page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === '/api/bulletin') bulletinRequests++;
    const response = await route.fetch({ url: `${KEYED}${url.pathname}${url.search}` });
    await route.fulfill({ response });
  });

  await page.goto('/?fast=1&seed=99&mute=1');
  const bot = new Bot(page);
  let bulletin = null as KState['lastBulletin'];
  await bot.play(
    {
      onTick: (s) => {
        if (s.phase === 'gameover') throw new Error('died before first bulletin');
        return !!bulletin;
      },
      onBulletin: async (s) => {
        if (bulletin) return;
        await page.waitForTimeout(1200);
        await page.screenshot({ path: 'screenshots/bulletin-ai.png' });
        bulletin = s.lastBulletin;
      },
    },
    3 * 60_000,
  );

  expect(bulletin).not.toBeNull();
  expect(bulletin!.source).toBe('ai');
  expect(bulletinRequests).toBeGreaterThan(0);
  expect(bulletin!.headline).toContain('MOCK DESK');
  expect(bulletin!.anchor).toContain('[MOCK MODEL]');

  const reqs = await (await page.request.get('http://localhost:8790/__requests')).json();
  expect(reqs.length).toBeGreaterThan(0);
  expect(reqs[0]).toMatchObject({ model: 'claude-opus-5-5', effort: 'medium', keyOk: true, system: true, wave: '1' });
});
