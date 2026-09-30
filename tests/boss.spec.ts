// Debug-start at the final wave (?startWave=5 grants that wave's expected size) to show the mech boss.
import { test, expect } from '@playwright/test';
import { Bot } from './bot';

test('final wave spawns the flagship mech', async ({ page }) => {
  await page.goto('/?fast=1&seed=7&mute=1&startWave=5');
  const bot = new Bot(page);
  let seenAt = 0;
  const last = await bot.play(
    {
      onTick: async (s) => {
        if (s.enemyTypesSpawned.includes('mech') && !seenAt) seenAt = Date.now();
        if (seenAt && Date.now() - seenAt > 6000) {
          await page.screenshot({ path: 'screenshots/boss.png' });
          return true;
        }
      },
    },
    90_000,
  );
  expect(last.wave).toBe(5);
  expect(last.enemyTypesSpawned).toContain('mech');
});
