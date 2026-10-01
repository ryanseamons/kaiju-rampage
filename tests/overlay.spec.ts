// Title-screen buttons update in place (the poster is never rebuilt, so nothing flashes or replays),
// and the Sound Test lists the soundtrack with play, votes and a copyable summary.
import { test, expect } from '@playwright/test';
import fs from 'node:fs';

test('title buttons update in place', async ({ page }) => {
  await page.goto('/?seed=3&mute=1&lang=en');
  await page.waitForFunction(() => (window as any).__kaiju?.state()?.modal === 'title');
  await page.evaluate(() => ((document.querySelector('.poster') as any).__mark = 1));
  const same = () => page.evaluate(() => (document.querySelector('.poster') as any)?.__mark === 1);
  await page.locator('[data-diff="hard"]').click();
  await expect(page.locator('[data-diff="hard"]')).toHaveClass(/on/);
  expect(await same(), 'difficulty click keeps the poster').toBe(true);
  await page.keyboard.press('ArrowLeft');
  await expect(page.locator('[data-diff="medium"]')).toHaveClass(/on/);
  await page.keyboard.press('ArrowDown');
  await expect(page.locator('[data-item="how"]')).toHaveClass(/sel/);
  expect(await same(), 'keyboard keeps the poster').toBe(true);
  await page.locator('[data-item="settings"]').click();
  await expect(page.locator('.panel')).toBeVisible();
  // volume sliders apply live, without rebuilding the panel
  await page.evaluate(() => ((document.querySelector('.scrim') as any).__mark = 1));
  const setSlider = (what: string, v: number) =>
    page.locator(`[data-vol="${what}"]`).evaluate((el: HTMLInputElement, val) => {
      el.value = String(val);
      el.dispatchEvent(new Event('input', { bubbles: true }));
    }, v);
  await setSlider('sfx', 40);
  await expect(page.locator('[data-vol="sfx"] + output')).toHaveText('40%');
  await setSlider('volume', 55);
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('kaiju.audio') ?? '{}'));
  expect(saved.sfxVol).toBeCloseTo(0.4);
  expect(saved.volume).toBeCloseTo(0.55);
  expect(await page.evaluate(() => (document.querySelector('.scrim') as any)?.__mark === 1), 'slider keeps the panel').toBe(true);
  await setSlider('sfx', 100);
  await setSlider('volume', 80);
  await page.locator('[data-close]').click();
  await expect(page.locator('.panel')).toHaveCount(0);
  expect(await same(), 'settings panel keeps the poster').toBe(true);
});

test('sound test lists tracks, plays one, and remembers votes', async ({ page }) => {
  test.skip(!fs.existsSync('public/music/tracks.json'), 'no recorded tracks in this checkout');
  const list: { id: string; contexts: string[] }[] = JSON.parse(fs.readFileSync('public/music/tracks.json', 'utf8')).tracks;
  const n = list.length;
  // Whatever is in the list today: one track in rotation, one candidate (the line-up changes as tracks are voted on).
  const a = list.find((x) => x.contexts[0] !== 'candidate')!.id;
  const b = (list.find((x) => x.contexts[0] === 'candidate') ?? list[1]).id;
  await page.goto('/?seed=3&mute=1&lang=en');
  await page.waitForFunction(() => (window as any).__kaiju?.state()?.modal === 'title');
  await page.locator('.plaque').click();
  await expect(page.locator('.panel.sound .track')).toHaveCount(n);
  await page.locator(`[data-play="${a}"]`).click();
  await expect(page.locator(`.track.now [data-play="${a}"]`)).toBeVisible({ timeout: 10_000 });
  await page.locator(`[data-vote="${a}:keep"]`).click();
  await page.locator(`[data-vote="${b}:cut"]`).click();
  await page.waitForTimeout(300);
  await page.screenshot({ path: 'screenshots/sound-test.png' });
  await page.reload();
  await page.waitForFunction(() => (window as any).__kaiju?.state()?.modal === 'title');
  await page.locator('.plaque').click();
  await expect(page.locator(`[data-vote="${a}:keep"]`)).toHaveClass(/on/);
  await expect(page.locator(`[data-vote="${b}:cut"]`)).toHaveClass(/on/);
});
