// Difficulty must bite: a kaiju that stands still takes more damage on each step up, at tier 2
// (wave 2) and at tier 3 (wave 4, where Easy barely scratches it). Opt-in (slow): DIFF=1.
import { test, expect, type Page } from '@playwright/test';
import fs from 'node:fs';
import { getState } from './bot';

async function stationary(page: Page, level: string, wave: number, seconds: number) {
  await page.goto(`/?seed=5&mute=1&startWave=${wave}&difficulty=${level}`);
  await page.waitForFunction(() => (window as any).__kaiju?.state()?.modal === 'title');
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => (window as any).__kaiju?.state()?.phase === 'playing');
  // Game seconds, not wall-clock: a loaded machine slows the frame rate, not the verdict.
  let s = await getState(page);
  const t0 = s?.elapsed ?? 0;
  let died = false;
  while (s && s.elapsed - t0 < seconds) {
    s = await getState(page);
    if (!s) break;
    if (s.modal === 'levelup') await page.keyboard.press('Digit1');
    if (s.phase === 'dying' || s.phase === 'gameover') { died = true; break; }
    await page.waitForTimeout(500);
  }
  const secs = Math.max(1, (s?.elapsed ?? t0) - t0);
  const damage = s?.damageTaken ?? 0;
  // Damage per game second: comparable whether or not the kaiju died before the time was up.
  return { level, wave, damage: Math.round(damage), secs: Math.round(secs), dps: +(damage / secs).toFixed(2), maxHp: s?.maxHp, died, difficulty: (s as any)?.difficulty };
}

test('each difficulty step hurts more', async ({ page }) => {
  test.skip(!process.env.DIFF, 'set DIFF=1');
  test.setTimeout(40 * 60_000);
  const rows = [];
  for (const wave of [2, 4]) {
    for (const level of ['easy', 'medium', 'hard']) {
      const r = await stationary(page, level, wave, 30);
      console.log('DIFF', JSON.stringify(r));
      expect(r.difficulty).toBe(level);
      rows.push(r);
    }
  }
  fs.writeFileSync('screenshots/difficulty-teeth.json', JSON.stringify(rows, null, 2));
  for (const wave of [2, 4]) {
    const [e, m, h] = rows.filter((r) => r.wave === wave);
    expect(m.dps, `wave ${wave}: medium hurts more than easy`).toBeGreaterThan(e.dps);
    expect(h.dps, `wave ${wave}: hard hurts more than medium`).toBeGreaterThan(m.dps);
  }
});
