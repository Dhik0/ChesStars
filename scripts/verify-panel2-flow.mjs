import { chromium } from 'playwright';

const BASE = 'http://127.0.0.1:4173';
const OUT = 'shots';

const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 360, height: 780 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
});
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(BASE, { waitUntil: 'networkidle' });
await page.waitForTimeout(400);

await page.locator('section .grid.grid-cols-2 > button').first().click();
await page.waitForTimeout(300);
await page.locator('footer button[aria-label^="蓝先"]').click();
await page.waitForTimeout(300);

const state = () =>
  page.evaluate(() => {
    const f = document.querySelector('footer');
    const ban = [...f.querySelectorAll('button[aria-label^="Ban 位"]')];
    const filled = (sel) =>
      [...f.querySelectorAll(sel)].filter((b) => b.querySelector('img')).length;
    return {
      bans: filled('button[aria-label^="Ban 位"]'),
      ally: filled('button[aria-label^="己方"]'),
      enemy: filled('button[aria-label^="敌方"]'),
      phase: f.innerText.split('\n').slice(0, 2).join(' '),
      undoDisabled: f.querySelector('button[aria-label="撤回上一步"]').disabled,
      resetDisabled: f.querySelector('button[aria-label="重置本局"]').disabled,
      activeBan: ban.findIndex((b) => b.className.includes('ring-2')),
    };
  });

// 连点 6 次候选 → 填满 Ban，进入 Pick
for (let i = 0; i < 6; i += 1) {
  await page.locator('.grid.grid-cols-5 > div[role="button"]').nth(i).click();
  await page.waitForTimeout(120);
}
console.log('AFTER_6_BANS', JSON.stringify(await state()));

// 再点 2 个 → 己方 1 手、敌方 1 手
await page.locator('.grid.grid-cols-5 > div[role="button"]').nth(7).click();
await page.waitForTimeout(150);
await page.locator('.grid.grid-cols-5 > div[role="button"]').nth(8).click();
await page.waitForTimeout(200);
console.log('AFTER_2_PICKS', JSON.stringify(await state()));
await page.screenshot({ path: `${OUT}/stage2-bp-picked.png` });

// 撤回一次
await page.locator('footer button[aria-label="撤回上一步"]').click();
await page.waitForTimeout(200);
console.log('AFTER_UNDO', JSON.stringify(await state()));

// 重置
await page.locator('footer button[aria-label="重置本局"]').click();
await page.waitForTimeout(250);
console.log('AFTER_RESET', JSON.stringify(await state()));

// 顶栏窄屏
await page.setViewportSize({ width: 320, height: 640 });
await page.waitForTimeout(250);
const bar = await page.evaluate(() => {
  const btn = document.querySelector('header button[aria-label="切换地图"]');
  const img = btn.querySelector('img');
  const r = img.getBoundingClientRect();
  return {
    thumb: { w: Math.round(r.width), h: Math.round(r.height) },
    headerH: Math.round(document.querySelector('header').getBoundingClientRect().height),
    overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    footerH: Math.round(document.querySelector('footer').getBoundingClientRect().height),
    candidateArea: Math.round(
      document.querySelector('.min-h-0.flex-1.overflow-y-auto').getBoundingClientRect().height,
    ),
  };
});
console.log('NARROW_320', JSON.stringify(bar));
await page.screenshot({ path: `${OUT}/stage2-bp-320.png` });

console.log('ERRORS', errors.length ? errors : 'none');
await browser.close();
