import { chromium } from 'playwright';

const BASE = 'http://127.0.0.1:4173';
const OUT = 'shots';

const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 360, height: 760 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
});
const page = await ctx.newPage();

// 把两张图的请求打回 404，验证占位图（不能出现裂图）
await page.route('**/maps/dry-season.png', (r) => r.fulfill({ status: 404, body: '' }));
await page.route('**/maps/hard-rock-mine.png', (r) => r.fulfill({ status: 404, body: '' }));

await page.goto(BASE, { waitUntil: 'networkidle' });
await page.waitForTimeout(800);

const state = await page.evaluate(() => {
  const cards = [...document.querySelectorAll('section .grid.grid-cols-2 > button')];
  const broken = cards.filter((c) => {
    const img = c.querySelector('img');
    // 仍在 DOM 且 naturalWidth=0 → 裂图
    return img && (!img.complete || img.naturalWidth === 0);
  });
  const placeholders = document.querySelectorAll('[aria-hidden="true"]');
  const box = cards[0]?.querySelector('[aria-hidden="true"], img')?.getBoundingClientRect();
  return {
    brokenCount: broken.length,
    placeholderCount: placeholders.length,
    firstCell: box ? { w: Math.round(box.width), h: Math.round(box.height) } : null,
  };
});
console.log('FALLBACK', JSON.stringify(state));
await page.screenshot({ path: `${OUT}/stage1-fallback.png`, clip: { x: 0, y: 100, width: 360, height: 300 } });
await browser.close();
