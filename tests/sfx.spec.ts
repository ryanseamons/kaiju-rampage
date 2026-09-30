// The sample banks load and make sound (recorded from the master bus, never played aloud by a human).
import { test, expect } from '@playwright/test';

const KENNEY = ['squish', 'car', 'plank', 'debris', 'plate', 'punch', 'hurt', 'slice', 'glass', 'powerup', 'evolve', 'item', 'zap', 'latch'];

test('effect samples load and play', async ({ page }) => {
  await page.goto('/?seed=3&lang=en&music=composed');
  await page.waitForFunction(() => (window as any).__kaiju?.state()?.modal === 'title');
  await page.mouse.click(40, 40);
  await page.evaluate(() => (window as any).__kaijuAudio.unlock());
  await page.waitForFunction((n) => (window as any).__kaijuSamples.loaded().length >= n, KENNEY.length, { timeout: 30_000 });
  const loaded: string[] = await page.evaluate(() => (window as any).__kaijuSamples.loaded());
  for (const b of KENNEY) expect(loaded, `bank ${b}`).toContain(b);
  console.log('SFX banks', loaded.join(' '));
  // silence the music, then record a few effects
  await page.evaluate(() => (window as any).__kaijuMusic.play('victory'));
  const rec = page.evaluate(() => (window as any).__kaijuAudio.record(2));
  await page.waitForTimeout(200);
  const played = await page.evaluate(() => ['punch', 'debris', 'glass', 'powerup'].map((b, i) => new Promise((r) => setTimeout(() => r((window as any).__kaijuSamples.play(b)), i * 300))));
  expect(played).toBeTruthy();
  const b64 = await rec;
  const a = await page.evaluate((b) => (window as any).__kaijuAudio.analyse(b), b64);
  console.log('SFX level', JSON.stringify(a));
  expect(a.rms).toBeGreaterThan(0.005);
  expect(a.peak).toBeLessThan(0.99);
});
