// The city has named landmarks (castle, KBN-7 tower, pagodas with torii) and they render.
import { test, expect } from '@playwright/test';

test('landmarks are placed and drawn', async ({ page }) => {
  await page.goto('/?seed=1234&mute=1&lang=en');
  await page.waitForFunction(() => (window as any).__kaiju?.state()?.modal === 'title');
  const lms: { id: string; x: number; y: number }[] = await page.evaluate(() => (window as any).__kaiju.state().landmarks);
  const ids = lms.map((l) => l.id);
  console.log('LANDMARKS', JSON.stringify(ids.reduce((a: Record<string, number>, i) => ((a[i] = (a[i] ?? 0) + 1), a), {})));
  expect(ids).toContain('castle');
  expect(ids).toContain('tvtower');
  expect(ids).toContain('pagoda');
  expect(ids).toContain('torii');
  await page.evaluate(() => (document.getElementById('overlay')!.hidden = true));
  for (const id of ['castle', 'tvtower', 'pagoda']) {
    const l = lms.find((x) => x.id === id)!;
    await page.evaluate(([x, y]) => (window as any).__kaiju.peek(x, y - 40, 2.2), [l.x, l.y]);
    await page.waitForTimeout(400);
    await page.screenshot({ path: `screenshots/landmark-${id}.png` });
  }
});
