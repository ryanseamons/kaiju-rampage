// Renders marketing/cover.html (key art + title) to marketing/cover.png at 1600x1000, the Voyage Labs
// cover size, plus marketing/cover-square.png (the middle 1000x1000) to check the square crop.
// Usage: npx tsx scripts/render-cover.ts
import path from 'node:path';
import { chromium } from '@playwright/test';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
await page.goto(`file://${path.resolve('marketing/cover.html')}`);
await page.evaluate(() => document.fonts.ready);
await page.waitForTimeout(300);
await page.screenshot({ path: 'marketing/cover.png' });
await page.screenshot({ path: 'marketing/cover-square.png', clip: { x: 300, y: 0, width: 1000, height: 1000 } });
await browser.close();
console.log('marketing/cover.png, marketing/cover-square.png');
