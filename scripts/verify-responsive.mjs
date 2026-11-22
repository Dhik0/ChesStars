import { chromium } from 'playwright';

const BASE = 'http://127.0.0.1:4173';
const OUT = 'shots';

const browser = await chromium.launch();
const errors = [];
const bad = [];

function watch(page) {
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(`PAGEERROR: ${e.message}`));
  page.on('response', (r) => {
    if (r.status() >= 400) bad.push(`${r.status()} ${r.url()}`);
  });
}

const mk = async (w, h) => {
  const ctx = await browser.newContext({
    viewport: { width: w, height: h },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  });
  const p = await ctx.newPage();
  watch(p);
  await p.goto(BASE, { waitUntil: 'networkidle' });
  await p.waitForTimeout(600);
  return p;
};

/* ============ 1. 选图页 360×780：放大后的模式分组头 ============ */
const p1 = await mk(360, 780);
const picker = await p1.evaluate(() => {
  const heads = [...document.querySelectorAll('section > div:first-child')].map((h) => {
    const img = h.querySelector('img');
    const h3 = h.querySelector('h3');
    const cs = h3 ? getComputedStyle(h3) : null;
    return {
      label: h3?.textContent,
      icon: img ? [Math.round(img.getBoundingClientRect().width), Math.round(img.getBoundingClientRect().height)] : null,
      fontSize: cs?.fontSize,
      fontWeight: cs?.fontWeight,
      headH: Math.round(h.getBoundingClientRect().height),
      bg: getComputedStyle(h).backgroundColor,
    };
  });
  return {
    heads,
    cols: getComputedStyle(document.querySelector('section .grid')).gridTemplateColumns,
    overflowX: document.documentElement.scrollWidth > document.documentElement.clientWidth,
  };
});
console.log('PICKER_360', JSON.stringify(picker, null, 1));
await p1.screenshot({ path: `${OUT}/resp-1-picker-360x780.png` });

/* ============ 2. 竖屏小窗 360×580：进 BP 后地图滚走、英雄池舒展 ============ */
const p2 = await mk(360, 580);
await p2.locator('section .grid.grid-cols-2 > button').first().click();
await p2.waitForTimeout(900);
const beforeFirst = await p2.evaluate(() => {
  const sc = document.querySelector('.min-h-0.flex-1.overflow-y-auto');
  const card = document.querySelector('header, .h-\\[160px\\]');
  const slot = document.querySelector('footer button[aria-label^="己方第 1"]');
  return {
    scrollTop: Math.round(sc.scrollTop),
    scrollerH: Math.round(sc.getBoundingClientRect().height),
    footerH: Math.round(document.querySelector('footer').getBoundingClientRect().height),
    slotH: slot ? Math.round(slot.getBoundingClientRect().height) : null,
    mapCardTop: card ? Math.round(card.getBoundingClientRect().top) : null,
  };
});
console.log('SHORT_PRE', JSON.stringify(beforeFirst));

// 点「蓝先」进入正式 BP（矮视口应自动滚过地图卡）
await p2.locator('footer button[aria-label^="蓝先"]').click();
await p2.waitForTimeout(1200);
const afterFirst = await p2.evaluate(() => {
  const sc = document.querySelector('.min-h-0.flex-1.overflow-y-auto');
  const secs = [...sc.querySelectorAll('section')];
  const top = secs[0].getBoundingClientRect();
  const tiles = secs[0].querySelectorAll('[role="button"]');
  // 首排英雄格是否完整可见
  const rows = new Set([...tiles].map((t) => Math.round(t.getBoundingClientRect().top))).size;
  return {
    scrollTop: Math.round(sc.scrollTop),
    topSectionTop: Math.round(top.top),
    scrollerTop: Math.round(sc.getBoundingClientRect().top),
    topRows: rows,
    topSectionFullyVisible: top.top >= sc.getBoundingClientRect().top - 2,
    slotH: Math.round(document.querySelector('footer button[aria-label^="己方第 1"]').getBoundingClientRect().height),
    footerH: Math.round(document.querySelector('footer').getBoundingClientRect().height),
    overflowX: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    overflowY: document.documentElement.scrollHeight > document.documentElement.clientHeight,
  };
});
console.log('SHORT_POST', JSON.stringify(afterFirst, null, 1));
await p2.screenshot({ path: `${OUT}/resp-2-portrait-short-360x580.png` });

/* 完整地图卡状态（重新载入后不点先手） */
const p2b = await mk(360, 580);
await p2b.locator('section .grid.grid-cols-2 > button').first().click();
await p2b.waitForTimeout(800);
await p2b.screenshot({ path: `${OUT}/resp-2b-portrait-short-maptop-360x580.png` });

/* ============ 3. 横屏小窗 680×360：左右双栏 ============ */
const p3 = await mk(680, 360);
const p3picker = await p3.evaluate(() => ({
  cols: getComputedStyle(document.querySelector('section .grid')).gridTemplateColumns,
  thumbH: Math.round(document.querySelector('section .grid button div').getBoundingClientRect().height),
}));
console.log('PICKER_LANDSCAPE', JSON.stringify(p3picker));
await p3.screenshot({ path: `${OUT}/resp-3a-picker-680x360.png` });

await p3.locator('section .grid button').first().click();
await p3.waitForTimeout(900);
const land1 = await p3.evaluate(() => {
  const aside = document.querySelector('aside');
  const main = document.querySelector('main');
  const foot = document.querySelector('aside footer');
  const first = foot?.querySelector('button[aria-label^="蓝先"]');
  return {
    asideW: Math.round(aside.getBoundingClientRect().width),
    asideH: Math.round(aside.getBoundingClientRect().height),
    mainW: Math.round(main.getBoundingClientRect().width),
    mainH: Math.round(main.getBoundingClientRect().height),
    mainScrollable: main.scrollHeight > main.clientHeight,
    firstPickBtnH: first ? Math.round(first.getBoundingClientRect().height) : null,
    overflowX: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    bodyOverflowY: document.documentElement.scrollHeight > document.documentElement.clientHeight,
  };
});
console.log('LAND_PRE', JSON.stringify(land1, null, 1));

await p3.locator('aside footer button[aria-label^="蓝先"]').click();
await p3.waitForTimeout(700);
const land2 = await p3.evaluate(() => {
  const aside = document.querySelector('aside');
  const main = document.querySelector('main');
  const foot = document.querySelector('aside footer');
  const slots = [...foot.querySelectorAll('button[aria-label*="槽（全局"]')];
  const boxes = slots.map((b) => b.getBoundingClientRect());
  const last = boxes[boxes.length - 1];
  const act = foot.querySelector('button[aria-label="撤回上一步"]');
  const topTiles = [...main.querySelectorAll('section')[0].querySelectorAll('[role="button"]')];
  const firstRowTop = Math.round(Math.min(...topTiles.map((t) => t.getBoundingClientRect().top)));
  const perRow = new Set(topTiles.map((t) => Math.round(t.getBoundingClientRect().top))).size;
  return {
    slotCount: slots.length,
    slotH: Math.round(boxes[0].height),
    slotRows: new Set(boxes.map((b) => Math.round(b.top))).size,
    lastSlotBottom: Math.round(last.bottom),
    actionTop: Math.round(act.getBoundingClientRect().top),
    actionBottom: Math.round(act.getBoundingClientRect().bottom),
    asideBottom: Math.round(aside.getBoundingClientRect().bottom),
    topTiles: topTiles.length,
    topRows: perRow,
    topGridCols: getComputedStyle(main.querySelector('section .grid')).gridTemplateColumns,
    firstRowTop,
    mainTop: Math.round(main.getBoundingClientRect().top),
    overflowX: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    bodyOverflowY: document.documentElement.scrollHeight > document.documentElement.clientHeight,
    slotTruncated: Math.round(last.bottom) > Math.round(act.getBoundingClientRect().top),
  };
});
console.log('LAND_BP', JSON.stringify(land2, null, 1));
await p3.screenshot({ path: `${OUT}/resp-3b-landscape-bp-680x360.png` });

/* ============ 4. 极限小窗回归（320×520 / 280×480） ============ */
for (const [w, h] of [
  [320, 520],
  [280, 480],
]) {
  const p = await mk(w, h);
  await p.locator('section .grid.grid-cols-2 > button').first().click();
  await p.waitForTimeout(700);
  await p.locator('footer button[aria-label^="蓝先"]').click();
  await p.waitForTimeout(1100);
  const r = await p.evaluate(() => {
    const sc = document.querySelector('.min-h-0.flex-1.overflow-y-auto');
    const sec = sc.querySelector('section');
    const tiles = [...sec.querySelectorAll('[role="button"]')];
    const rows = [...new Set(tiles.map((t) => Math.round(t.getBoundingClientRect().top)))];
    const visibleRows = rows.filter((t) => t < sc.getBoundingClientRect().bottom).length;
    return {
      scrollTop: Math.round(sc.scrollTop),
      poolH: Math.round(sc.getBoundingClientRect().height),
      footerH: Math.round(document.querySelector('footer').getBoundingClientRect().height),
      slotH: Math.round(
        document.querySelector('footer button[aria-label^="己方第 1"]').getBoundingClientRect().height,
      ),
      visibleTopRows: visibleRows,
      overflowX: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      overflowY: document.documentElement.scrollHeight > document.documentElement.clientHeight,
    };
  });
  console.log(`EXTREME_${w}x${h}`, JSON.stringify(r));
}

console.log('HTTP_ERRORS', bad.length ? bad.slice(0, 5) : 'none');
console.log('CONSOLE_ERRORS', errors.length ? errors.slice(0, 5) : 'none');
await browser.close();
