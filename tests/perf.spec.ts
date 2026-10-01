// Opt-in performance probe (PERF=1): runs the production build (vite preview on PERF_URL, default
// http://localhost:5190) through a few scenarios with the bot playing, and reports frame rate,
// frame-time percentiles, how many objects the scene holds, and the top CPU hot spots.
import { test } from '@playwright/test';
import fs from 'node:fs';
import { Bot, startFromTitle } from './bot';

const BASE = process.env.PERF_URL ?? 'http://localhost:5190';
const SCENARIOS: [string, string][] = (process.env.PERF_ONLY ?? 'tier1 run,tier3 late,market late,harbor daily')
  .split(',')
  .map((n) => [n, ({
    'title': '?seed=7&mute=1',
    'tier1 run': '?seed=7&mute=1&difficulty=easy',
    'tier3 run': '?seed=7&mute=1&difficulty=easy&startWave=4',
    'tier3 late': '?seed=7&mute=1&difficulty=easy&startWave=4&late=1',
    'market late': '?seed=7&mute=1&difficulty=easy&startWave=4&stage=market&late=1',
    'harbor daily': '?seed=7&mute=1&difficulty=easy&startWave=4&stage=harbor&twist=glass&threat=sub&late=1',
    'typhoon blackout': '?seed=7&mute=1&difficulty=easy&startWave=4&stage=typhoon&twist=blackout',
  } as Record<string, string>)[n]] as [string, string]);
const THROTTLE = Number(process.env.PERF_THROTTLE ?? 1);

test('performance probe', async ({ page }) => {
  test.skip(!process.env.PERF, 'set PERF=1');
  test.setTimeout(15 * 60_000);
  const out: Record<string, unknown> = {};
  for (const [name, q] of SCENARIOS) {
    await page.goto(BASE + '/' + q);
    await page.waitForFunction(() => (window as any).__kaiju?.state()?.modal === 'title');
    const secs = Number(process.env.PERF_SECS ?? 25);
    // CPU work per frame: from the start of Phaser's step to the end of its render (less sensitive to
    // other processes and the GPU than wall-clock frame times)
    await page.evaluate(() => {
      const w = window as any, g = w.__kaijuGame;
      w.__work = [];
      let t0 = 0;
      g.events.on('prestep', () => (t0 = performance.now()));
      g.events.on('postrender', () => w.__work.push(performance.now() - t0));
    });
    // frame times, measured in the page with rAF
    await page.evaluate(() => {
      const w = window as any;
      w.__ft = [];
      let last = performance.now();
      const tick = (t: number) => {
        w.__ft.push(t - last);
        last = t;
        if (w.__ftOn) requestAnimationFrame(tick);
      };
      w.__ftOn = true;
      requestAnimationFrame(tick);
    });
    const cdp = await page.context().newCDPSession(page);
    if (THROTTLE > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: THROTTLE });
    await cdp.send('Profiler.enable');
    await cdp.send('Profiler.setSamplingInterval', { interval: 500 });
    if (name !== 'title') {
      const bot = new Bot(page);
      if (q.includes('late=1')) {
        // a long run's worth of wreckage
        await startFromTitle(page);
        await page.evaluate(() => (window as any).__kaijuDebug.flatten(1500));
        await page.waitForTimeout(6000); // let the collapse particles and tweens settle
      }
      await cdp.send('Profiler.start');
      if (process.env.PERF_NOBOT) {
        // no polling: the kaiju walks a square on held keys, so nothing but the game runs on the page
        if (!q.includes('late=1')) await startFromTitle(page);
        for (const k of ['KeyD', 'KeyS', 'KeyA', 'KeyW']) {
          await page.keyboard.down(k);
          await page.waitForTimeout((secs * 1000) / 4);
          await page.keyboard.up(k);
        }
      } else {
        const t0 = Date.now();
        await bot.play({ onTick: (s) => Date.now() - t0 > secs * 1000 || s.phase === 'gameover' || s.phase === 'dying' }, (secs + 30) * 1000);
      }
    } else {
      await cdp.send('Profiler.start');
      await page.waitForTimeout(secs * 1000);
    }
    const { profile } = await cdp.send('Profiler.stop');
    const stats = await page.evaluate(() => {
      const w = window as any;
      w.__ftOn = false;
      const ft = (w.__ft as number[]).slice(30).sort((a, b) => a - b);
      const pct = (p: number) => +ft[Math.min(ft.length - 1, Math.floor(ft.length * p))].toFixed(1);
      const wk = (w.__work as number[]).slice(30).sort((a, b) => a - b);
      const wp = (p: number) => +wk[Math.min(wk.length - 1, Math.floor(wk.length * p))].toFixed(2);
      const workMean = +(wk.reduce((a, b) => a + b, 0) / Math.max(1, wk.length)).toFixed(2);
      const s = w.__kaiju.state();
      return { workMean, work50: wp(0.5), work95: wp(0.95), frames: ft.length, p50: pct(0.5), p90: pct(0.9), p99: pct(0.99), fps: s.fps, destroyed: s.destroyed, enemies: s.enemies.length, tier: s.tier, wave: s.wave, objects: w.__kaijuDebug.objects() };
    });
    // self time by function
    const self = new Map<string, number>();
    const byId = new Map(profile.nodes.map((n: any) => [n.id, n]));
    const dt = profile.timeDeltas as number[];
    (profile.samples as number[]).forEach((id, i) => {
      const n: any = byId.get(id);
      const key = `${n.callFrame.functionName || '(anon)'} ${String(n.callFrame.url).split('/').pop()}:${n.callFrame.lineNumber}`;
      self.set(key, (self.get(key) ?? 0) + (dt[i] ?? 0));
    });
    const total = [...self.values()].reduce((a, b) => a + b, 0);
    const top = [...self.entries()].sort((a, b) => b[1] - a[1]).slice(0, 14).map(([k, v]) => `${((v / total) * 100).toFixed(1)}% ${k}`);
    out[name] = { ...stats, top };
    console.log('PERF', name, JSON.stringify(stats));
    console.log(top.join('\n'));
  }
  fs.writeFileSync('screenshots/perf.json', JSON.stringify(out, null, 2));
});
