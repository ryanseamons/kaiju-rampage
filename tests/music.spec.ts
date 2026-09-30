// Records ~16 s of each soundtrack context to evidence/music/*.webm and checks it is audible and unclipped.
// Opt-in (slow): MUSIC=1 npx playwright test music
import { test, expect } from '@playwright/test';
import fs from 'node:fs';

const CONTEXTS = ['title', 'tier1', 'tier2', 'tier3', 'boss', 'victory', 'defeat'] as const;

test('soundtrack clips', async ({ page }) => {
  test.skip(!process.env.MUSIC, 'set MUSIC=1');
  test.setTimeout(8 * 60_000);
  await page.goto('/?seed=11&lang=en');
  await page.waitForFunction(() => (window as any).__kaiju?.state()?.modal === 'title');
  await page.mouse.click(40, 40); // user gesture → audio unlock
  await page.evaluate(() => (window as any).__kaijuAudio.unlock());
  const results: Record<string, unknown> = {};
  for (const c of CONTEXTS) {
    await page.evaluate((ctx) => (window as any).__kaijuMusic.play(ctx), c);
    await page.waitForTimeout(3200); // let the crossfade finish
    const info = await page.evaluate(() => (window as any).__kaijuMusic.now());
    const b64 = await page.evaluate((s) => (window as any).__kaijuAudio.record(s), 16);
    expect(b64, `recorded ${c}`).toBeTruthy();
    fs.writeFileSync(`evidence/music/${c}.webm`, Buffer.from(b64, 'base64'));
    const a = await page.evaluate((b) => (window as any).__kaijuAudio.analyse(b), b64);
    results[c] = { title: `${info?.en} / ${info?.ja}`, scale: `${info?.key} ${info?.scale}`, bpm: info?.bpm, ...a };
    console.log('MUSIC', c, JSON.stringify(results[c]));
    expect(a.rms, `${c} audible`).toBeGreaterThan(0.01);
    expect(a.peak, `${c} not clipping`).toBeLessThan(0.99);
  }
  fs.writeFileSync('evidence/music/summary.json', JSON.stringify(results, null, 2));
});
