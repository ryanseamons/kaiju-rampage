// Every UI string and every mutation exists in English and Japanese, with matching {slots}.
import { test, expect } from '@playwright/test';

test('i18n tables are complete', async ({ page }) => {
  await page.goto('/?lang=ja&mute=1');
  await page.waitForFunction(() => (window as any).__kaiju?.state()?.modal === 'title');
  const report = await page.evaluate(async () => {
    // Modules are loaded in the page (they touch window/localStorage), via Vite's dev server.
    const load = (p: string) => import(/* @vite-ignore */ p);
    const m: any = await load('/src/i18n.ts');
    const up: any = await load('/src/upgrades.ts');
    const problems: string[] = [];
    const slots = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort().join(',');
    for (const k of m.ALL_KEYS) {
      const e = m.rawEntry(k);
      if (!e.en?.trim() || !e.ja?.trim()) problems.push(`missing ${k}`);
      if (slots(e.en) !== slots(e.ja)) problems.push(`slot mismatch ${k}: ${slots(e.en)} vs ${slots(e.ja)}`);
    }
    for (const u of up.UPGRADES) {
      const tx = m.UPGRADE_TEXT[u.id];
      if (!tx) { problems.push(`no text for upgrade ${u.id}`); continue; }
      if (!tx.glyph || !tx.en.name || !tx.ja.name || !tx.en.first || !tx.ja.first) problems.push(`incomplete upgrade ${u.id}`);
      if (!!tx.en.later !== !!tx.ja.later) problems.push(`later mismatch ${u.id}`);
    }
    return { problems, keys: m.ALL_KEYS.length, upgrades: up.UPGRADES.length };
  });
  console.log('I18N', JSON.stringify({ keys: report.keys, upgrades: report.upgrades }));
  expect(report.problems).toEqual([]);
  // The Japanese front page actually renders Japanese.
  await expect(page.locator('.menu button').first()).toContainText('暴れ始める');
  await page.waitForTimeout(1200); // poster fade-in
  await page.screenshot({ path: 'screenshots/title-ja.png' });
});
