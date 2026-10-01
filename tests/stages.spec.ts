// Every stage builds, has its signature pieces, and renders (screenshots/stage-*.png).
import { test, expect } from '@playwright/test';

const STAGES = ['bay', 'market', 'neon', 'harbor', 'snow', 'typhoon'];

test('every stage builds with its signature pieces', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  for (const id of STAGES) {
    await page.goto(`/?seed=7&mute=1&lang=en&stage=${id}`);
    await page.waitForFunction(() => (window as any).__kaiju?.state()?.modal === 'title');
    const s = await page.evaluate(() => (window as any).__kaiju.state());
    expect(s.stage).toBe(id);
    if (id === 'market') expect(s.cityExtras.stalls).toBeGreaterThan(40);
    if (id === 'harbor') expect(s.cityExtras.fuel).toBeGreaterThan(10);
    await page.evaluate(() => (document.getElementById('overlay')!.hidden = true));
    const lm = s.landmarks.find((l: any) => l.id === 'tvtower');
    await page.evaluate(([x, y]) => (window as any).__kaiju.peek(x, y + 260, 1.1), [lm.x, lm.y]);
    await page.waitForTimeout(500);
    await page.screenshot({ path: `screenshots/stage-${id}.png` });
  }
  expect(errors).toEqual([]);
});
