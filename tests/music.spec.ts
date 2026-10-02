// Records each soundtrack context to evidence/music/*.webm and checks it is audible and unclipped.
// Uses the recorded tracks (src/audio/tracks.json, streamed from the CDN); ?music=composed for the composer
// (?music=composed forces the composer). Opt-in (slow): MUSIC=1 npx playwright test music
import { test, expect } from '@playwright/test';
import fs from 'node:fs';

const CONTEXTS = ['title', 'tier1', 'tier2', 'tier3', 'boss', 'victory', 'defeat'] as const;

async function level(page: import('@playwright/test').Page, ctx: string, seconds: number) {
  await page.evaluate((c) => (window as any).__kaijuMusic.play(c), ctx);
  await page.waitForTimeout(3200); // let the crossfade finish
  const info = await page.evaluate(() => (window as any).__kaijuMusic.now());
  const b64 = await page.evaluate((s) => (window as any).__kaijuAudio.record(s), seconds);
  const a = await page.evaluate((b) => (window as any).__kaijuAudio.analyse(b), b64);
  return { info, b64, ...a };
}

async function openTitle(page: import('@playwright/test').Page, query = '') {
  await page.goto(`/?seed=11&lang=en${query}`);
  await page.waitForFunction(() => (window as any).__kaiju?.state()?.modal === 'title');
  await page.mouse.click(40, 40);
  await page.evaluate(() => (window as any).__kaijuAudio.unlock());
}

test('recorded tracks rotate and sit level with the composer', async ({ page }) => {
  test.skip(!process.env.MUSIC, 'set MUSIC=1');
  test.setTimeout(4 * 60_000);
  await openTitle(page);
  const out: Record<string, unknown> = {};
  for (const c of CONTEXTS) {
    const r = await level(page, c, 5);
    expect(r.info?.kind, `${c} uses a recorded track`).toBe('track');
    expect(r.rms, `${c} audible`).toBeGreaterThan(0.004); // some intros are soft
    expect(r.peak, `${c} not clipping`).toBeLessThan(0.99);
    out[c] = { title: r.info.en, artist: r.info.meta, rms: +r.rms.toFixed(3), peak: +r.peak.toFixed(3) };
    console.log('TRACK', c, JSON.stringify(out[c]));
  }
  // rotation: skipping to the end of a tier-3 track rolls into the other tier-3 track
  await page.evaluate(() => (window as any).__kaijuMusic.play('tier3'));
  await page.waitForTimeout(3000);
  const first = (await page.evaluate(() => (window as any).__kaijuMusic.now())).en;
  await page.evaluate(() => (window as any).__kaijuMusic.skipToEnd());
  await page.waitForTimeout(3500);
  const second = (await page.evaluate(() => (window as any).__kaijuMusic.now())).en;
  console.log('ROTATE', first, '→', second);
  expect(second).not.toBe(first);
  // loudness parity with the composer
  const trackRms = (await level(page, 'tier1', 6)).rms;
  await openTitle(page, '&music=composed');
  const composedRms = (await level(page, 'tier1', 6)).rms;
  console.log('LEVEL track', trackRms.toFixed(3), 'composed', composedRms.toFixed(3));
  expect(trackRms / composedRms).toBeGreaterThan(0.5);
  expect(trackRms / composedRms).toBeLessThan(1.6);
  fs.mkdirSync('evidence/music', { recursive: true });
  fs.writeFileSync('evidence/music/tracks.json', JSON.stringify({ ...out, rotate: [first, second], trackRms, composedRms }, null, 2));
});

test('soundtrack clips', async ({ page }) => {
  test.skip(!process.env.MUSIC, 'set MUSIC=1');
  test.setTimeout(8 * 60_000);
  await page.goto('/?seed=11&lang=en&music=composed');
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
    results[c] = { title: `${info?.en} / ${info?.ja}`, meta: info?.meta, ...a };
    console.log('MUSIC', c, JSON.stringify(results[c]));
    expect(a.rms, `${c} audible`).toBeGreaterThan(0.01);
    expect(a.peak, `${c} not clipping`).toBeLessThan(0.99);
  }
  fs.writeFileSync('evidence/music/summary.json', JSON.stringify(results, null, 2));
});
