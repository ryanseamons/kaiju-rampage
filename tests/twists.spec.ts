// Each daily twist does its thing (forced with ?twist= so it doesn't depend on the date).
import { test, expect, type Page } from '@playwright/test';
import { startFromTitle } from './bot';

const st = (page: Page) => page.evaluate(() => (window as any).__kaiju.state());
const open = async (page: Page, q: string) => {
  await page.goto(`/?seed=5&mute=1&fast=2&difficulty=easy&${q}`);
  await page.waitForFunction(() => (window as any).__kaiju?.state()?.modal === 'title');
  await startFromTitle(page);
};

test('giant starts at wave 3, Behemoth-sized, with three mutations to pick', async ({ page }) => {
  await open(page, 'twist=giant');
  const s = await st(page);
  expect(s.twists).toEqual(['giant']);
  expect(s.wave).toBe(3);
  expect(s.tier).toBe(2);
  await page.waitForFunction(() => (window as any).__kaiju.state().modal === 'levelup');
});

test('blackout darkens the city; air brings jets at hatchling size', async ({ page }) => {
  await open(page, 'twist=blackout,air');
  expect((await st(page)).darkness).toBe(true);
  await page.waitForTimeout(400);
  await page.screenshot({ path: 'screenshots/twist-blackout.png' });
  await page.waitForFunction(() => (window as any).__kaiju.state().enemyTypesSpawned.includes('jet'), null, { timeout: 60_000 });
  expect((await st(page)).tier).toBe(1);
});

test('glass doubles damage taken; starving drops no hearts', async ({ page }) => {
  await open(page, 'twist=glass,starving');
  const before = await st(page);
  await page.evaluate(() => (window as any).__kaijuDebug.hurt(10));
  const after = await st(page);
  expect(Math.round(before.hp - after.hp)).toBe(20);
  expect(await page.evaluate(() => (window as any).__kaijuDebug.heartChance(0.08))).toBe(0);
});
