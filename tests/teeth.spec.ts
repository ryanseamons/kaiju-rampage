// The military must be able to hurt you. A kaiju that stands still at normal speed in wave 2
// (tier 2: infantry at range, tanks with leading shells) has to take real damage within 35 seconds.
// This is deliberately independent of the playthrough bot's dodging skill and of ?fast=1.
import { test, expect } from '@playwright/test';
import { getState } from './bot';

test('a kaiju that stands still gets hurt', async ({ page }) => {
  await page.goto('/?seed=5&mute=1&startWave=2&difficulty=easy');
  await page.waitForFunction(() => (window as any).__kaiju?.state()?.modal === 'title');
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => (window as any).__kaiju?.state()?.phase === 'playing');
  // 35 game seconds (not wall-clock, so a slow frame rate doesn't make the army look harmless).
  test.setTimeout(15 * 60_000);
  let s = await getState(page);
  const t0 = s?.elapsed ?? 0;
  while (s && s.elapsed - t0 < 35) {
    s = await getState(page);
    if (!s) break;
    if (s.modal === 'levelup') await page.keyboard.press('Digit1'); // claws kill walk-ins; keep the game running
    if (s.phase === 'dying' || s.phase === 'gameover') break;
    if (s.damageTaken >= 40) break; // the point is proven; no need to wait out the clock
    await page.waitForTimeout(500);
  }
  console.log('TEETH', JSON.stringify({ damageTaken: s?.damageTaken, hp: Math.round(s?.hp ?? 0), maxHp: s?.maxHp, phase: s?.phase, enemies: s?.enemies.length }));
  expect(s?.damageTaken).toBeGreaterThanOrEqual(40);
});
