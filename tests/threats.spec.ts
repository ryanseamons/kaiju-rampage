// Each featured threat spawns and runs without errors (forced with ?threat=).
import { test, expect, type Page } from '@playwright/test';
import { startFromTitle } from './bot';

const UNIT: Record<string, string> = { maser: 'maser', drones: 'drone', freeze: 'freeze', netheli: 'netheli', railgun: 'railgun', sub: 'sub', riot: 'riot' };

async function check(page: Page, threat: string) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(`/?seed=5&mute=1&fast=2&difficulty=easy&startWave=4&threat=${threat}`);
  await page.waitForFunction(() => (window as any).__kaiju?.state()?.modal === 'title');
  await startFromTitle(page);
  await page.waitForFunction((u) => (window as any).__kaiju.state().enemyTypesSpawned.includes(u), UNIT[threat], { timeout: 45_000 });
  // let it act for a few seconds (beams charge, drones dive, the sub surfaces)
  for (let i = 0; i < 5; i++) {
    const s = await page.evaluate(() => (window as any).__kaiju.state());
    if (s.modal === 'levelup') await page.keyboard.press('Digit1');
    await page.waitForTimeout(400);
  }
  await page.screenshot({ path: `screenshots/threat-${threat}.png` });
  expect(errors, threat).toEqual([]);
}

for (const group of [['maser', 'drones', 'freeze', 'netheli'], ['railgun', 'sub', 'riot']])
  test(`featured threats spawn and act: ${group.join(', ')}`, async ({ page }) => {
    for (const th of group) await check(page, th);
  });
