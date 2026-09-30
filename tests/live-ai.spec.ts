// Optional: real Claude call. Skipped unless LIVE_NARRATION_URL points at a narration server started
// with a real ANTHROPIC_API_KEY, e.g.  PORT=8793 npm run server  →  LIVE_NARRATION_URL=http://localhost:8793 npx playwright test live-ai
import { test, expect } from '@playwright/test';
import { Bot, type KState } from './bot';

const LIVE = process.env.LIVE_NARRATION_URL;

test('live Claude bulletin (real API key)', async ({ page }) => {
  test.skip(!LIVE, 'set LIVE_NARRATION_URL to run against a real key');
  const health = await (await page.request.get(`${LIVE}/api/health`)).json();
  expect(health.hasKey).toBe(true);
  await page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url());
    await route.fulfill({ response: await route.fetch({ url: `${LIVE}${url.pathname}${url.search}`, timeout: 30_000 }) });
  });
  await page.goto('/?fast=1&seed=4242&mute=1&difficulty=easy');
  const bot = new Bot(page);
  let bulletin = null as KState['lastBulletin'];
  await bot.play(
    {
      onTick: () => !!bulletin,
      onBulletin: async (s) => {
        await page.waitForTimeout(1500);
        await page.screenshot({ path: 'screenshots/bulletin-ai-live.png' });
        bulletin = s.lastBulletin;
      },
    },
    3 * 60_000,
  );
  console.log('LIVE BULLETIN', JSON.stringify(bulletin));
  expect(bulletin?.source).toBe('ai');
});
