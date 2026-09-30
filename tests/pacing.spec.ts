// Optional (PACING=1): plays at NORMAL speed and records when each tier and wave is reached,
// to check the ~10 minute run length and tier pacing. Not part of the done gate (slow).
import { test } from '@playwright/test';
import fs from 'node:fs';
import { Bot } from './bot';

test('normal-speed pacing log', async ({ page }) => {
  test.skip(!process.env.PACING, 'set PACING=1');
  test.setTimeout(16 * 60_000);
  const startWave = (process.env.START_WAVE ? `&startWave=${process.env.START_WAVE}` : '') + `&difficulty=${process.env.DIFFICULTY ?? 'easy'}` + (process.env.FAST ? '&fast=1' : '');
  await page.goto(`/?seed=2024&mute=1${startWave}`);
  const bot = new Bot(page);
  const t0 = Date.now();
  const events: Record<string, number> = {};
  const gameTime: Record<string, number> = {};
  let cur: any;
  const mark = (k: string) => {
    if (k in events) return;
    events[k] = Math.round((Date.now() - t0) / 1000);
    gameTime[k] = Math.round(cur?.elapsed ?? 0);
  };
  let last: any;
  await bot.play(
    {
      onTick: (s) => {
        last = s;
        cur = s;
        mark(`wave${s.wave}`);
        mark(`tier${s.maxTierReached}`);
        if (s.phase === 'gameover' || s.phase === 'dying') { mark('death'); return true; }
        if (s.phase === 'victory') { mark('victory'); return true; }
        return false;
      },
    },
    15 * 60_000,
  );
  const out = { difficulty: last?.difficulty, events, gameTime, level: last?.level, destroyed: last?.destroyed, minHpPct: Math.round(bot.minHpPct), damageTaken: Math.round(last?.damageTaken ?? 0), reachedWave: last?.wave, outcome: 'death' in events ? 'death' : 'victory' in events ? 'victory' : 'timeout', wallClockNote: 'events = wall-clock seconds incl. pauses and headless slowdown; gameTime = simulated seconds' };
  console.log('PACING', JSON.stringify(out));
  fs.writeFileSync(`screenshots/pacing-${process.env.DIFFICULTY ?? 'easy'}${process.env.FAST ? '-fast' : ''}${process.env.START_WAVE ? `-wave${process.env.START_WAVE}` : ''}.json`, JSON.stringify(out, null, 2));
});
