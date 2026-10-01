// Touchscreens: a phone in landscape can start a run, steer with the floating joystick and stomp
// with a second finger at the same time. Mouse players never see the controls.
import { test, expect, devices, type Page } from '@playwright/test';
import { startFromTitle } from './bot';

const st = (page: Page) => page.evaluate(() => (window as any).__kaiju.state());

test.describe('touch', () => {
  // The phone's screen and touch, without switching browser engine (the device preset says WebKit).
  const { viewport, deviceScaleFactor, isMobile, hasTouch, userAgent } = devices['iPhone 13 landscape'];
  test.use({ viewport, deviceScaleFactor, isMobile, hasTouch, userAgent });

  test('joystick steers and stomp fires, two fingers at once', async ({ page, context }) => {
    await page.goto('/?seed=3&mute=1&lang=en&difficulty=easy');
    await page.waitForFunction(() => (window as any).__kaiju?.state()?.modal === 'title');
    await page.waitForTimeout(600);
    await page.locator('[data-item="start"]').tap();
    await page.waitForFunction(() => (window as any).__kaiju.state().phase === 'playing', null, { timeout: 15_000 });
    await page.waitForTimeout(1200);

    const cdp = await context.newCDPSession(page);
    const r = await page.evaluate(() => { const c = document.querySelector('canvas')!.getBoundingClientRect(); return { x: c.x, y: c.y, k: c.width / 1280 }; });
    const at = (gx: number, gy: number) => ({ x: r.x + gx * r.k, y: r.y + gy * r.k });
    const touch = (type: string, pts: { x: number; y: number }[]) =>
      cdp.send('Input.dispatchTouchEvent', { type: type as 'touchStart', touchPoints: pts.map((p, id) => ({ ...p, id })) });

    const x0 = (await st(page)).player.x;
    const thumb = at(300, 450);
    await touch('touchStart', [thumb]);
    for (let i = 1; i <= 10; i++) {
      await touch('touchMove', [{ x: thumb.x + i * 9, y: thumb.y }]);
      await page.waitForTimeout(30);
    }
    await page.waitForTimeout(800);
    expect((await st(page)).player.x, 'the joystick moved the kaiju right').toBeGreaterThan(x0 + 60);

    expect((await st(page)).stompReady).toBe(true);
    await touch('touchStart', [{ x: thumb.x + 90, y: thumb.y }, at(1120, 470)]); // keep steering, tap stomp
    await page.waitForTimeout(150);
    await touch('touchEnd', []);
    await page.waitForTimeout(100);
    expect((await st(page)).stompReady, 'the stomp button fired').toBe(false);
  });
});

test('mouse players never see the touch controls', async ({ page }) => {
  await page.goto('/?seed=3&mute=1&lang=en&difficulty=easy');
  await page.waitForFunction(() => (window as any).__kaiju?.state()?.modal === 'title');
  await startFromTitle(page);
  await page.mouse.click(300, 450);
  await page.waitForTimeout(300);
  const visible = await page.evaluate(() => (window as any).__kaijuGame.scene.getScene('UI').touch.touched);
  expect(visible).toBe(false);
});
