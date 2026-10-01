// The end of a run: the results screen offers a new run (straight into play) or the title, and the
// on-screen pause button only shows while it can pause something.
import { test, expect, type Page } from '@playwright/test';
import { startFromTitle } from './bot';

const state = (page: Page) =>
  page.evaluate(() => {
    const s = (window as any).__kaiju.state();
    return { phase: s.phase as string, modal: s.modal as string | null, pauseHidden: document.getElementById('pause')!.hidden };
  });

async function dieToResults(page: Page) {
  await page.evaluate(() => (window as any).__kaijuDebug.hurt(99999));
  await page.waitForFunction(() => (window as any).__kaiju.state().modal === 'bulletin', null, { timeout: 30_000 });
  expect((await state(page)).pauseHidden, 'no pause button on the news card').toBe(true);
  await page.waitForTimeout(700);
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => (window as any).__kaiju.state().modal === 'results', null, { timeout: 15_000 });
  await page.waitForTimeout(600);
}

test('results: Enter starts a new run, Esc exits to the title', async ({ page }) => {
  await page.goto('/?seed=3&mute=1&lang=en&difficulty=easy');
  await page.waitForFunction(() => (window as any).__kaiju?.state()?.modal === 'title');
  expect((await state(page)).pauseHidden, 'no pause button on the title').toBe(true);
  await startFromTitle(page);
  expect((await state(page)).pauseHidden, 'pause button in play').toBe(false);

  // A score of 0 doesn't rank, so the results screen goes straight to its buttons.
  await dieToResults(page);
  expect(await state(page)).toMatchObject({ phase: 'results', pauseHidden: true });
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => (window as any).__kaiju.state().phase === 'playing', null, { timeout: 15_000 });
  expect((await state(page)).modal, 'new run skips the title').toBeNull();

  await dieToResults(page);
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => (window as any).__kaiju.state().modal === 'title', null, { timeout: 15_000 });
  expect((await state(page)).pauseHidden).toBe(true);
});
