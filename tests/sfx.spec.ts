// The sample banks load and make sound (recorded from the master bus, never played aloud by a human).
import { test, expect } from '@playwright/test';
import fs from 'node:fs';

const KENNEY = ['step', 'squish', 'car', 'plank', 'debris', 'plate', 'punch', 'hurt', 'slice', 'glass', 'powerup', 'evolve', 'item', 'zap', 'latch'];

test('effect samples load and play', async ({ page }) => {
  await page.goto('/?seed=3&lang=en&music=composed');
  await page.waitForFunction(() => (window as any).__kaiju?.state()?.modal === 'title');
  await page.mouse.click(40, 40);
  await page.evaluate(() => (window as any).__kaijuAudio.unlock());
  await page.waitForFunction((n) => (window as any).__kaijuSamples.loaded().length >= n, KENNEY.length, { timeout: 30_000 });
  const loaded: string[] = await page.evaluate(() => (window as any).__kaijuSamples.loaded());
  for (const b of KENNEY) expect(loaded, `bank ${b}`).toContain(b);
  // Licensed Epidemic banks, streamed from the CDN.
  {
    const es = Object.keys(JSON.parse(fs.readFileSync('src/audio/es-banks.json', 'utf8')));
    await page.waitForFunction((n) => (window as any).__kaijuSamples.loaded().filter((b: string) => b.startsWith('es.')).length >= n, es.length, { timeout: 30_000 });
    const now: string[] = await page.evaluate(() => (window as any).__kaijuSamples.loaded());
    for (const b of es) expect(now, `bank es.${b}`).toContain(`es.${b}`);
  }
  console.log('SFX banks', loaded.join(' '));
  // silence the music, then record a few effects
  await page.evaluate(() => (window as any).__kaijuMusic.play('victory'));
  const rec = page.evaluate(() => (window as any).__kaijuAudio.record(2));
  await page.waitForTimeout(200);
  const list = ['es.stomp', 'es.collapse', 'glass', 'es.roar'];
  const played = await page.evaluate((l) => l.map((b, i) => new Promise((r) => setTimeout(() => r((window as any).__kaijuSamples.play(b)), i * 300))), list);
  expect(played).toBeTruthy();
  const b64 = await rec;
  const a = await page.evaluate((b) => (window as any).__kaijuAudio.analyse(b), b64);
  console.log('SFX level', JSON.stringify(a));
  expect(a.rms).toBeGreaterThan(0.005);
  expect(a.peak).toBeLessThan(0.99);
});

test('every gameplay effect makes a sound', async ({ page }) => {
  // Music off (a saved preference), so the baseline is silence and each effect stands alone.
  await page.addInitScript(() => localStorage.setItem('kaiju.audio', JSON.stringify({ muted: false, music: false, sfx: true, volume: 0.8, musicVol: 0, sfxVol: 1 })));
  await page.goto('/?seed=3&lang=en&music=composed');
  await page.waitForFunction(() => (window as any).__kaiju?.state()?.modal === 'title');
  await page.mouse.click(40, 40);
  await page.evaluate(() => (window as any).__kaijuAudio.unlock());
  await page.waitForFunction(() => (window as any).__kaijuSamples.loaded().length >= 15, null, { timeout: 30_000 });
  await page.evaluate(() => (window as any).__kaijuAudio.record(0.1)); // warm the recorder
  const calls: [string, string][] = [
    ['breath', 'breath(0.8, false)'], ['spines', 'spines()'], ['spineHit', 'spineHit()'], ['tail', 'tail()'],
    ['aura', 'aura(4)'], ['hit metal', 'hit(true)'], ['hit soft', 'hit(false)'], ['kill', 'kill()'],
    ['buildingHit', 'buildingHit(false)'], ['heart', 'heart()'], ['waveStart', 'waveStart()'], ['mechStep', 'mechStep(true)'],
    ['rotor', 'setRotor(1)'], ['step', 'step()'], ['stomp', 'stomp()'],
  ];
  // baseline first: the same recording with nothing fired
  const quiet = await page.evaluate(async () => (window as any).__kaijuAudio.analyse(await (window as any).__kaijuAudio.record(1.1)));
  const levels: Record<string, number> = {};
  for (const [name, call] of calls) {
    await page.waitForTimeout(260); // let the previous effect and its throttle clear
    const rec = page.evaluate(() => (window as any).__kaijuAudio.record(0.7));
    await page.waitForTimeout(120);
    await page.evaluate((c) => new Function('s', `s.${c}`)((window as any).__kaijuSfx), call);
    const b64 = await rec;
    if (name === 'rotor') await page.evaluate(() => (window as any).__kaijuSfx.setRotor(0));
    const a = await page.evaluate((b) => (window as any).__kaijuAudio.analyse(b), b64);
    levels[name] = +a.rms.toFixed(4);
  }
  console.log('SFX each', JSON.stringify({ ...levels, baseline: +quiet.rms.toFixed(4) }));
  for (const [name] of calls) expect(levels[name], `${name} is audible`).toBeGreaterThan(Math.max(0.002, quiet.rms * 4));
});
