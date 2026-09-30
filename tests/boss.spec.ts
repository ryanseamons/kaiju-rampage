// Debug-start at the final wave (?startWave=5 grants that wave's expected size) to show the mech boss.
import { test, expect } from '@playwright/test';
import { Bot, getState } from './bot';

test('final wave spawns the flagship mech', async ({ page }) => {
  await page.goto('/?fast=1&seed=7&mute=1&startWave=5&difficulty=easy');
  const bot = new Bot(page);
  let seenAt = 0;
  const last = await bot.play(
    {
      onTick: async (s) => {
        const mech = s.enemies.find((e) => e.type === 'mech');
        const v = s.view;
        const inView = mech && mech.x > v.x + v.w * 0.2 && mech.x < v.x + v.w * 0.8 && mech.y > v.y + v.h * 0.35 && mech.y < v.y + v.h * 0.95;
        if (inView && !seenAt) seenAt = Date.now();
        if (seenAt && Date.now() - seenAt > 800 && inView && !s.modal && s.phase === 'playing') {
          await page.screenshot({ path: 'screenshots/boss.png' });
          const after = await getState(page);
          return !!after && !after.modal;
        }
      },
    },
    150_000,
  );
  expect(last.wave).toBe(5);
  expect(last.enemyTypesSpawned).toContain('mech');
});
