// The daily rampage: a pure date → content function (fast, no browser), and the briefing → ranked →
// practice flow, with the same structure (city, army) for two players on the same day.
import { test, expect } from '@playwright/test';
import { AVAILABLE, BOSSES, STAGES, THREATS, TWISTS, dailyConfig, shareLine } from '../src/daily';
import { startFromTitle } from './bot';

const ALL = { stages: [...STAGES], twists: [...TWISTS], threats: [...THREATS], bosses: [...BOSSES] };
const days = (start: string, n: number) => Array.from({ length: n }, (_, i) => new Date(Date.parse(`${start}T00:00:00Z`) + i * 86_400_000).toISOString().slice(0, 10));

test('daily content: deterministic, every item reachable, no clashing twists', () => {
  expect(dailyConfig('2026-10-05')).toEqual(dailyConfig('2026-10-05'));
  expect(dailyConfig('2026-09-30').number).toBe(1);
  const seen = { stages: new Set<string>(), twists: new Set<string>(), threats: new Set<string>(), bosses: new Set<string>() };
  let doubles = 0;
  for (const k of days('2026-10-01', 60)) {
    const c = dailyConfig(k, ALL);
    seen.stages.add(c.stage);
    c.twists.forEach((x) => seen.twists.add(x));
    if (c.threat) seen.threats.add(c.threat);
    seen.bosses.add(c.boss);
    if (c.twists.length === 2) doubles++;
    expect(new Set(c.twists).size).toBe(c.twists.length);
    expect(c.twists.includes('giant') && c.twists.includes('starving')).toBe(false);
  }
  expect([...seen.stages].sort()).toEqual([...STAGES].sort());
  expect([...seen.twists].sort()).toEqual([...TWISTS].sort());
  expect([...seen.threats].sort()).toEqual([...THREATS].sort());
  expect([...seen.bosses].sort()).toEqual([...BOSSES].sort());
  expect(doubles).toBeGreaterThan(5);
  // with today's content, a day only ever draws from what exists
  for (const k of days('2026-10-01', 30)) {
    const c = dailyConfig(k);
    expect(AVAILABLE.stages).toContain(c.stage);
    c.twists.forEach((x) => expect(AVAILABLE.twists).toContain(x));
    if (c.threat) expect(AVAILABLE.threats).toContain(c.threat);
  }
  expect(shareLine({ number: 3, stageName: 'Neon Megacity', score: 184300, grade: 'S', buildings: 212, kills: 90, victory: true, wave: 5, ranked: true })).toContain('#3 · Neon Megacity');
});

test('briefing → ranked run → practice, and the same army for everyone that day', async ({ browser }) => {
  const day = '2026-10-05';
  const play = async () => {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    const page = await ctx.newPage();
    await page.goto(`/?daily=${day}&mute=1&fast=2&lang=en&startWave=3`);
    await page.waitForFunction(() => (window as any).__kaiju?.state()?.modal === 'title');
    await expect(page.locator('.panel.daily')).toBeVisible();
    await expect(page.locator('.panel.daily h2')).toContainText("TODAY'S RAMPAGE #6");
    await expect(page.locator('.dstatus')).toHaveClass(/ranked/);
    await page.screenshot({ path: 'screenshots/daily-briefing.png' });
    await startFromTitle(page);
    expect(await page.evaluate(() => (window as any).__kaiju.state().ranked)).toBe(true);
    await page.waitForFunction(() => (window as any).__kaiju.state().spawnLog.length >= 14, null, { timeout: 60_000 });
    const st = await page.evaluate(() => (window as any).__kaiju.state());
    // a second visit the same day is practice
    await page.reload();
    await page.waitForFunction(() => (window as any).__kaiju?.state()?.modal === 'title');
    await expect(page.locator('.dstatus')).toHaveClass(/practice/);
    await ctx.close();
    return { spawns: st.spawnLog.slice(0, 14), landmarks: st.landmarks.map((l: any) => `${l.id}@${Math.round(l.x)},${Math.round(l.y)}`).join(' ') };
  };
  const a = await play();
  const b = await play();
  console.log('DAILY', JSON.stringify(a.spawns));
  expect(b.landmarks).toBe(a.landmarks);
  expect(b.spawns).toEqual(a.spawns);
});
