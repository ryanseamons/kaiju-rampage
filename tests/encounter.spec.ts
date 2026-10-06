// Optional (CURVE=1): the difficulty curve as the bot feels it. Plays at normal speed from a given wave
// (START_WAVE, default 3) and logs, per 10 game seconds, the damage taken as a share of max HP, plus the
// set-piece robot (walker or mech): HP when it arrived, the lowest HP while it was alive, damage taken
// during the fight, and how long it lasted. Writes screenshots/curve-<difficulty>-wave<n>.json.
import { test } from '@playwright/test';
import fs from 'node:fs';
import { Bot } from './bot';

test('difficulty curve and robot encounter', async ({ page }) => {
  test.skip(!process.env.CURVE, 'set CURVE=1');
  test.setTimeout(16 * 60_000);
  const level = process.env.DIFFICULTY ?? 'medium';
  const wave = Number(process.env.START_WAVE ?? 3);
  await page.goto(`/?seed=2024&mute=1&startWave=${wave}&difficulty=${level}&levels=${process.env.LEVELS ?? 0}`);
  const bot = new Bot(page);
  const buckets: { t: number; wave: number; tier: number; dmgPct: number; minHpPct: number; enemies: number }[] = [];
  let bucket = { t: 0, dmg0: 0, min: 100 };
  let robot: { type: string; arrivedAt: number; hpPctAtArrival: number; minHpPct: number; dmg0: number; dmgPct?: number; lasted?: number } | null = null;
  let last: any;
  let t0: number | null = null;
  await bot.play(
    {
      onTick: (s: any) => {
        last = s;
        if (s.phase !== 'playing' && s.phase !== 'dying' && s.phase !== 'gameover' && s.phase !== 'victory') return false;
        t0 ??= s.elapsed;
        const t = s.elapsed - t0!;
        const hpPct = (Math.max(0, s.hp) / s.maxHp) * 100;
        bucket.min = Math.min(bucket.min, hpPct);
        if (t - bucket.t >= 10) {
          buckets.push({ t: Math.round(bucket.t), wave: s.wave, tier: s.tier, dmgPct: Math.round(((s.damageTaken - bucket.dmg0) / s.maxHp) * 100), minHpPct: Math.round(bucket.min), enemies: s.enemies.length, pressure: s.pressure } as any);
          bucket = { t, dmg0: s.damageTaken, min: hpPct };
        }
        const heavy = s.enemies.find((e: any) => e.type === 'walker' || e.type === 'mech');
        if (heavy && !robot) robot = { type: heavy.type, arrivedAt: Math.round(t), hpPctAtArrival: Math.round(hpPct), minHpPct: hpPct, dmg0: s.damageTaken };
        if (robot && robot.lasted == null) {
          robot.minHpPct = Math.min(robot.minHpPct, hpPct);
          if (!heavy || s.phase !== 'playing') {
            robot.lasted = Math.round(t - robot.arrivedAt);
            robot.dmgPct = Math.round(((s.damageTaken - robot.dmg0) / s.maxHp) * 100);
          }
        }
        if (s.phase === 'gameover' || s.phase === 'dying' || s.phase === 'victory') return true;
        // Stop once the robot is down and the wave after it has started (or the wave ended).
        return !!robot?.lasted && s.wave > wave;
      },
    },
    15 * 60_000,
  );
  const out = {
    difficulty: last?.difficulty,
    startWave: wave,
    outcome: last?.phase,
    endedInWave: last?.wave,
    level: last?.level,
    gameSeconds: Math.round((last?.elapsed ?? 0) - (t0 ?? 0)),
    minHpPct: Math.round(bot.minHpPct),
    robot: robot && { ...(robot as any), minHpPct: Math.round((robot as any).minHpPct), dmg0: undefined },
    buckets,
  };
  console.log('CURVE', JSON.stringify(out));
  fs.writeFileSync(`screenshots/curve-${level}-wave${wave}.json`, JSON.stringify(out, null, 2));
});
