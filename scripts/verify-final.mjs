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
const bad = [];
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text());
});
page.on('pageerror', (e) => errors.push(`PAGEERROR: ${e.message}`));
page.on('response', (r) => {
  if (r.status() >= 400) bad.push(`${r.status()} ${r.url()}`);
});

await page.goto(BASE, { waitUntil: 'networkidle' });
await page.waitForTimeout(700);

/* ---------- 1. 选图页：纯黑底 + 完整竖图 ---------- */
const picker = await page.evaluate(() => {
  const card = document.querySelector('section .grid.grid-cols-2 > button');
  const box = card.querySelector('div');
  const img = card.querySelector('img');
  const cs = getComputedStyle(box);
  const ir = img.getBoundingClientRect();
  const r = card.getBoundingClientRect();
  return {
    cardBox: [Math.round(r.width), Math.round(r.height)],
    imgBox: [Math.round(ir.width), Math.round(ir.height)],
    bg: cs.backgroundColor,
    objectFit: getComputedStyle(img).objectFit,
    hasBlurLayer: !!card.querySelector('[aria-hidden="true"]'),
    imgs: document.querySelectorAll('section img').length,
    overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
  };
});
console.log('PICKER', JSON.stringify(picker));
await page.screenshot({ path: `${OUT}/stage3-picker.png` });

/* ---------- 2. 进图 → 前置态（顶栏大图 + 分区池） ---------- */
await page.locator('section .grid.grid-cols-2 > button').first().click();
await page.waitForTimeout(500);

const pre = await page.evaluate(() => {
  const header = document.querySelector('header');
  const thumb = header.querySelector('img');
  const tr = thumb.getBoundingClientRect();
  const scroller = document.querySelector('.min-h-0.flex-1.overflow-y-auto');
  const sections = [...scroller.querySelectorAll('section')].map((s) => {
    const h = s.querySelector('h3');
    const cs = getComputedStyle(s);
    return {
      label: h?.textContent,
      color: h ? getComputedStyle(h).color : null,
      bg: cs.backgroundColor,
      tiles: s.querySelectorAll('[role="button"]').length,
    };
  });
  return {
    thumb: [Math.round(tr.width), Math.round(tr.height)],
    thumbRatio: +(tr.width / tr.height).toFixed(3),
    headerH: Math.round(header.getBoundingClientRect().height),
    hasSearch: !!document.querySelector('input[placeholder*="搜英雄"]'),
    hasFilterChips: /全部/.test(document.body.innerText) && /坦克/.test(document.body.innerText),
    sections,
    totalTiles: scroller.querySelectorAll('[role="button"]').length,
    scrollerH: Math.round(scroller.getBoundingClientRect().height),
    footerH: Math.round(document.querySelector('footer').getBoundingClientRect().height),
    overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
  };
});
console.log('PRE', JSON.stringify(pre, null, 1));
await page.screenshot({ path: `${OUT}/stage3-pre.png` });

/* ---------- 3. 蓝先 → 正式 BP，滚到稀有度分区 ---------- */
await page.locator('footer button[aria-label^="蓝先"]').click();
await page.waitForTimeout(400);
await page.screenshot({ path: `${OUT}/stage3-bp-top.png` });

await page.evaluate(() => {
  const s = document.querySelector('.min-h-0.flex-1.overflow-y-auto');
  s.scrollTop = 380;
});
await page.waitForTimeout(300);
await page.screenshot({ path: `${OUT}/stage3-bp-rarity.png` });

const rarity = await page.evaluate(() => {
  const scroller = document.querySelector('.min-h-0.flex-1.overflow-y-auto');
  const secs = [...scroller.querySelectorAll('section')];
  return secs.map((s) => ({
    label: s.querySelector('h3')?.textContent,
    count: s.querySelectorAll('[role="button"]').length,
    bg: getComputedStyle(s).backgroundColor,
    border: getComputedStyle(s).borderColor,
  }));
});
console.log('SECTIONS', JSON.stringify(rarity));

/* ---------- 4. 点选 + 撤回 + 重置 ---------- */
await page.evaluate(() => {
  const s = document.querySelector('.min-h-0.flex-1.overflow-y-auto');
  s.scrollTop = 0;
});
await page.waitForTimeout(200);
for (let i = 0; i < 2; i += 1) {
  await page.locator('.grid.grid-cols-5 > div[role="button"]').nth(i).click();
  await page.waitForTimeout(150);
}
const afterPick = await page.evaluate(() => {
  const f = document.querySelector('footer');
  const filled = (sel) => [...f.querySelectorAll(sel)].filter((b) => b.querySelector('img')).length;
  return {
    bans: filled('button[aria-label^="Ban 位"]'),
    ally: filled('button[aria-label^="己方"]'),
    enemy: filled('button[aria-label^="敌方"]'),
  };
});
console.log('AFTER_2_BANS', JSON.stringify(afterPick));

// 撤回
await page.locator('footer button[aria-label="撤回上一步"]').click();
await page.waitForTimeout(200);
console.log(
  'AFTER_UNDO',
  JSON.stringify(
    await page.evaluate(() => {
      const f = document.querySelector('footer');
      return [...f.querySelectorAll('button[aria-label^="Ban 位"]')].filter((b) => b.querySelector('img'))
        .length;
    }),
  ),
);

// 重置
await page.locator('footer button[aria-label="重置本局"]').click();
await page.waitForTimeout(300);
const afterReset = await page.evaluate(() => {
  const f = document.querySelector('footer');
  const filled = (sel) => [...f.querySelectorAll(sel)].filter((b) => b.querySelector('img')).length;
  const scroller = document.querySelector('.min-h-0.flex-1.overflow-y-auto');
  return {
    bans: filled('button[aria-label^="Ban 位"]'),
    ally: filled('button[aria-label^="己方"]'),
    enemy: filled('button[aria-label^="敌方"]'),
    tiles: scroller.querySelectorAll('[role="button"]').length,
    resetDisabled: f.querySelector('button[aria-label="重置本局"]').disabled,
    undoDisabled: f.querySelector('button[aria-label="撤回上一步"]').disabled,
  };
});
console.log('AFTER_RESET', JSON.stringify(afterReset));
await page.screenshot({ path: `${OUT}/stage3-after-reset.png` });

/* ---------- 5. 390 宽复检 ---------- */
const ctx2 = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
});
const p2 = await ctx2.newPage();
await p2.goto(BASE, { waitUntil: 'networkidle' });
await p2.waitForTimeout(500);
await p2.screenshot({ path: `${OUT}/stage3-picker-390.png` });
await p2.locator('section .grid.grid-cols-2 > button').first().click();
await p2.waitForTimeout(400);
const m390 = await p2.evaluate(() => {
  const thumb = document.querySelector('header img').getBoundingClientRect();
  return {
    thumb: [Math.round(thumb.width), Math.round(thumb.height)],
    scrollerH: Math.round(
      document.querySelector('.min-h-0.flex-1.overflow-y-auto').getBoundingClientRect().height,
    ),
    overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
  };
});
console.log('M390', JSON.stringify(m390));
await p2.screenshot({ path: `${OUT}/stage3-pre-390.png` });

console.log('HTTP_ERRORS', bad.length ? bad.slice(0, 5) : 'none');
console.log('CONSOLE_ERRORS', errors.length ? errors.slice(0, 5) : 'none');
await browser.close();
