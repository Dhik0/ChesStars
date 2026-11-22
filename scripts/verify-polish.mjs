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

/* ---------- 1. 选图页：模式图标 ---------- */
const picker = await page.evaluate(() => {
  const heads = [...document.querySelectorAll('section > div:first-child')].map((h) => {
    const img = h.querySelector('img');
    const dot = h.querySelector('span.rounded-full');
    return {
      label: h.querySelector('h3')?.textContent,
      hasIcon: !!img,
      iconSrc: img?.getAttribute('src') ?? null,
      iconLoaded: img ? img.complete && img.naturalWidth > 0 : false,
      iconBox: img ? [Math.round(img.getBoundingClientRect().width), Math.round(img.getBoundingClientRect().height)] : null,
      hasDot: !!dot,
    };
  });
  return { heads };
});
console.log('PICKER_MODES', JSON.stringify(picker, null, 1));
await page.screenshot({ path: `${OUT}/stage4-picker.png` });

/* ---------- 2. 进图：大地图详情卡 + 首屏折叠线 ---------- */
await page.locator('section .grid.grid-cols-2 > button').first().click();
await page.waitForTimeout(900);

const bp = await page.evaluate(() => {
  const header = document.querySelector('header');
  const card = header.firstElementChild;
  const mapImg = header.querySelector('img[alt]');
  const scroller = document.querySelector('.min-h-0.flex-1.overflow-y-auto');
  const sections = [...scroller.querySelectorAll('section')];
  const sr = scroller.getBoundingClientRect();
  const first = sections[0].getBoundingClientRect();
  const second = sections[1]?.getBoundingClientRect();
  const tiles = sections[0].querySelectorAll('[role="button"]');
  const imgs = [...document.querySelectorAll('.grid.grid-cols-5 img')];
  return {
    headerH: Math.round(header.getBoundingClientRect().height),
    cardH: Math.round(card.getBoundingClientRect().height),
    mapImgBox: mapImg ? [Math.round(mapImg.getBoundingClientRect().width), Math.round(mapImg.getBoundingClientRect().height)] : null,
    cardText: card.innerText.replace(/\n/g, ' | '),
    scrollerH: Math.round(sr.height),
    topSectionH: Math.round(first.height),
    topTiles: tiles.length,
    secondSectionTop: second ? Math.round(second.top) : null,
    foldY: Math.round(sr.bottom),
    secondVisible: second ? Math.round(sr.bottom - second.top) : null,
    avatarsTotal: imgs.length,
    avatarsLoaded: imgs.filter((i) => i.complete && i.naturalWidth > 0).length,
    overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
  };
});
console.log('BP_CARD', JSON.stringify(bp, null, 1));
await page.screenshot({ path: `${OUT}/stage4-bp.png` });

/* ---------- 3. 蓝先按钮（无图标） ---------- */
const pre = await page.evaluate(() => {
  const f = document.querySelector('footer');
  const btns = [...f.querySelectorAll('button')];
  return {
    buttons: btns.map((b) => ({
      text: b.innerText.replace(/\n/g, ' | '),
      svg: b.querySelectorAll('svg').length,
      img: b.querySelectorAll('img').length,
    })),
  };
});
console.log('PRE_BUTTONS', JSON.stringify(pre, null, 1));

/* ---------- 4. 蓝先后的 Ban 行切换按钮 ---------- */
await page.locator('footer button[aria-label^="蓝先"]').click();
await page.waitForTimeout(400);
const ban = await page.evaluate(() => {
  const sw = document.querySelector('footer button[aria-label*="点击切换"]');
  return {
    text: sw?.innerText.replace(/\n/g, ''),
    svg: sw?.querySelectorAll('svg').length,
    img: sw?.querySelectorAll('img').length,
    box: sw ? [Math.round(sw.getBoundingClientRect().width), Math.round(sw.getBoundingClientRect().height)] : null,
  };
});
console.log('SIDE_SWITCH', JSON.stringify(ban));
await page.screenshot({ path: `${OUT}/stage4-bp-picked.png` });

/* ---------- 5. 390 复检 ---------- */
const ctx2 = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
});
const p2 = await ctx2.newPage();
await p2.goto(BASE, { waitUntil: 'networkidle' });
await p2.waitForTimeout(500);
await p2.locator('section .grid.grid-cols-2 > button').first().click();
await p2.waitForTimeout(800);
const m390 = await p2.evaluate(() => {
  const scroller = document.querySelector('.min-h-0.flex-1.overflow-y-auto');
  const secs = [...scroller.querySelectorAll('section')];
  return {
    headerH: Math.round(document.querySelector('header').getBoundingClientRect().height),
    scrollerH: Math.round(scroller.getBoundingClientRect().height),
    secondVisible: secs[1]
      ? Math.round(scroller.getBoundingClientRect().bottom - secs[1].getBoundingClientRect().top)
      : null,
    overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
  };
});
console.log('M390', JSON.stringify(m390));
await p2.screenshot({ path: `${OUT}/stage4-bp-390.png` });

console.log('HTTP_ERRORS', bad.length ? bad.slice(0, 5) : 'none');
console.log('CONSOLE_ERRORS', errors.length ? errors.slice(0, 5) : 'none');
await browser.close();
