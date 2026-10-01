// Exit to title from the pause menu, behind a confirm that defaults to "keep playing".
import { test, expect } from '@playwright/test';
import { startFromTitle } from './bot';

const st = (page: import('@playwright/test').Page) => page.evaluate(() => (window as any).__kaiju.state());

test('pause → exit asks first, then returns to the title', async ({ page }) => {
  await page.goto('/?seed=5&mute=1&lang=en&difficulty=easy');
  await page.waitForFunction(() => (window as any).__kaiju?.state()?.modal === 'title');
  await expect(page.locator('#pause')).toBeHidden();
  await startFromTitle(page);
  await expect(page.locator('#pause')).toBeVisible();
  // the on-screen button pauses
  await page.locator('#pause').click();
  await page.waitForFunction(() => (window as any).__kaiju.state().modal === 'paused');
  await page.keyboard.press('KeyQ');
  await page.waitForFunction(() => (window as any).__kaiju.state().modal === 'exitConfirm');
  await page.waitForTimeout(200);
  await page.screenshot({ path: 'screenshots/exit-confirm.png' });
  // Enter on the default choice keeps playing (back to the pause menu, run intact)
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => (window as any).__kaiju.state().modal === 'paused');
  expect((await st(page)).phase).toBe('paused');
  // Q then Y exits
  await page.keyboard.press('KeyQ');
  await page.waitForFunction(() => (window as any).__kaiju.state().modal === 'exitConfirm');
  await page.keyboard.press('KeyY');
  await page.waitForFunction(() => (window as any).__kaiju?.state()?.modal === 'title', null, { timeout: 15_000 });
  expect((await st(page)).phase).toBe('title');
  await expect(page.locator('#pause')).toBeHidden();
  // and a new run starts cleanly from there (Space works as well as Enter)
  await startFromTitle(page, 'Space');
  expect((await st(page)).wave).toBe(1);
});
