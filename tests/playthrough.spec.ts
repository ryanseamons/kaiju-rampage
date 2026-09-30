// Full scripted playthrough WITHOUT an API key: survive into wave 3, reach tier 3,
// and capture each tier, a level-up choice and the (canned) news bulletin.
import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import { Bot, getState, type KState } from './bot';

test('scripted run reaches wave 3 and tier 3 (no API key → shipped news bank)', async ({ page }) => {
  const health = await (await page.request.get('/api/health')).json();
  expect(health).toMatchObject({ ok: true, hasKey: false });

  let bulletinRequests = 0;
  await page.route('**/api/bulletin', (route) => { bulletinRequests++; return route.continue(); });
  await page.goto('/?fast=1&seed=1234&mute=1');
  await page.waitForFunction(() => (window as any).__kaiju?.state()?.modal === 'title');
  await page.screenshot({ path: 'screenshots/title.png' });

  const bot = new Bot(page);
  const shots = new Set<string>();
  const tierSeenAt: Record<number, number> = {};
  let bulletin = null as KState['lastBulletin'];
  let tier1Time = 0;

  const last = await bot.play(
    {
      onTick: async (s) => {
        if (s.phase === 'gameover' || s.phase === 'dying') throw new Error(`Kaiju died in wave ${s.wave} (tier ${s.tier})`);
        if (s.phase !== 'playing') return;
        if (!tier1Time) tier1Time = Date.now();
        for (const t of [1, 2, 3]) if (s.maxTierReached >= t && !tierSeenAt[t]) tierSeenAt[t] = Date.now();
        // Screenshot each tier once the camera zoom has settled.
        for (const t of [1, 2, 3]) {
          const key = `tier${t}`;
          const settled = t === 1 ? Date.now() - tier1Time > 6000 : tierSeenAt[t] && Date.now() - tierSeenAt[t] > 2500;
          if (!shots.has(key) && s.tier === t && settled && !s.modal) {
            await page.screenshot({ path: `screenshots/${key}.png` });
            // Only keep it if no modal popped up while we were capturing.
            const after = await getState(page);
            if (after && after.phase === 'playing' && !after.modal) shots.add(key);
          }
        }
        return s.wave >= 3 && s.maxTierReached >= 3 && shots.has('tier3') && s.bulletinsShown >= 2;
      },
      onLevelUp: async () => {
        if (!shots.has('levelup')) {
          await page.screenshot({ path: 'screenshots/levelup.png' });
          shots.add('levelup');
        }
      },
      onBulletin: async (s) => {
        if (!shots.has('bulletin')) {
          await page.waitForTimeout(1200); // let the ticker scroll in
          await page.screenshot({ path: 'screenshots/bulletin-bank.png' });
          shots.add('bulletin');
          bulletin = s.lastBulletin;
        }
      },
    },
    8 * 60_000,
  );

  const fps = bot.fpsSamples.length ? Math.round(bot.fpsSamples.reduce((a, b) => a + b, 0) / bot.fpsSamples.length) : 0;
  const summary = {
    wave: last.wave, tier: last.tier, maxTierReached: last.maxTierReached, level: last.level, hp: Math.round(last.hp),
    minHpPct: Math.round(bot.minHpPct), destroyed: last.destroyed, bulletinsShown: last.bulletinsShown,
    levelUpsShown: last.levelUpsShown, enemyTypesSpawned: last.enemyTypesSpawned, upgradePoolSize: last.upgradePoolSize,
    headlessAvgFps: fps, shots: [...shots], bulletinSource: bulletin?.source,
  };
  console.log('PLAYTHROUGH', JSON.stringify(summary));
  fs.writeFileSync('screenshots/playthrough-summary.json', JSON.stringify(summary, null, 2));

  expect(last.phase).toBe('playing');
  // No key → the run never asks the server for a bulletin.
  expect(bulletinRequests).toBe(0);
  expect(last.narrationMode).toBe('bank');
  expect(last.wave).toBeGreaterThanOrEqual(3);
  expect(last.maxTierReached).toBe(3);
  expect(last.upgradePoolSize).toBeGreaterThanOrEqual(15);
  expect(last.enemyRoster).toEqual(expect.arrayContaining(['soldier', 'tank', 'mech']));
  expect(last.enemyTypesSpawned).toEqual(expect.arrayContaining(['soldier', 'tank']));
  expect(last.levelUpsShown).toBeGreaterThan(0);
  expect(bulletin).not.toBeNull();
  expect(bulletin!.source).toBe('bank');
  expect(bulletin!.ticker.length).toBeGreaterThan(0);
  for (const f of ['tier1', 'tier2', 'tier3', 'levelup', 'bulletin']) expect(shots.has(f), `screenshot ${f}`).toBe(true);
});
