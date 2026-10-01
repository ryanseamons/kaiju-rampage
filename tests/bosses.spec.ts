// The daily bosses: each one arrives, fights (screenshots/boss-*.png), and beating it wins the run.
import { test, expect } from '@playwright/test';
import { startFromTitle } from './bot';

for (const boss of ['tetsuryu', 'kumo', 'hikari'])
  test(`boss ${boss} arrives, fights, and can be beaten`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.goto(`/?seed=7&mute=1&fast=2&difficulty=easy&startWave=5&boss=${boss}`);
    await page.waitForFunction(() => (window as any).__kaiju?.state()?.modal === 'title');
    await startFromTitle(page);
    await page.waitForFunction((b) => (window as any).__kaiju.state().enemyTypesSpawned.includes(b), boss, { timeout: 30_000 });
    for (let i = 0; i < 12; i++) {
      const s = await page.evaluate(() => (window as any).__kaiju.state());
      if (s.modal === 'levelup') await page.keyboard.press('Digit1');
      await page.waitForTimeout(400);
    }
    await page.screenshot({ path: `screenshots/boss-${boss}.png` });
    await page.evaluate(() => (window as any).__kaijuDebug.killBoss());
    await page.waitForFunction(() => ['victory', 'results'].includes((window as any).__kaiju.state().phase) || (window as any).__kaiju.state().modal === 'results', null, { timeout: 30_000 });
    expect(errors).toEqual([]);
  });
