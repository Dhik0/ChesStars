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
const errors = [];
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text());
});
page.on('pageerror', (e) => errors.push(`PAGEERROR: ${e.message}`));
const bad = [];
page.on('response', (r) => {
  if (r.status() >= 400) bad.push(`${r.status()} ${r.url()}`);
});

await page.goto(BASE, { waitUntil: 'networkidle' });
await page.waitForTimeout(600);

// 1) 启动首屏 = 选择地图（无关闭按钮）
const startup = await page.evaluate(() => {
  const closeBtn = [...document.querySelectorAll('button[aria-label="返回"]')];
  const cards = [...document.querySelectorAll('section .grid.grid-cols-2 > button')];
  const firstImg = cards[0]?.querySelector('img');
  return {
    heading: document.querySelector('h2')?.textContent,
    closeButtons: closeBtn.length,
    cardCount: cards.length,
    sections: [...document.querySelectorAll('section h3')].map((h) => h.textContent),
    firstCardBox: cards[0] ? cards[0].getBoundingClientRect().toJSON() : null,
    firstImgSrc: firstImg?.getAttribute('src') ?? null,
    firstImgLoaded: firstImg ? firstImg.complete && firstImg.naturalWidth > 0 : false,
    imgsTotal: document.querySelectorAll('img').length,
    imgsLoaded: [...document.querySelectorAll('img')].filter((i) => i.complete && i.naturalWidth > 0).length,
    scrollW: document.documentElement.scrollWidth,
    clientW: document.documentElement.clientWidth,
  };
});
console.log('STARTUP', JSON.stringify(startup, null, 1));
await page.screenshot({ path: `${OUT}/stage1-startup.png` });

// 2) 点第一张地图 → 进 BP，顶栏是缩略图+中文名+模式标签
await page.locator('section .grid.grid-cols-2 > button').first().click();
await page.waitForTimeout(500);
const bp = await page.evaluate(() => {
  const header = document.querySelector('header');
  const btn = header?.querySelector('button[aria-label="切换地图"]');
  const img = btn?.querySelector('img');
  return {
    headerText: btn?.innerText.replace(/\n/g, ' | '),
    thumbSrc: img?.getAttribute('src') ?? null,
    thumbLoaded: img ? img.complete && img.naturalWidth > 0 : false,
    hasFirstToggle: /敌先|我先/.test(document.body.innerText),
    settingsBtn: !!header?.querySelector('button[aria-label="设置"]'),
    headerBtns: header ? [...header.querySelectorAll('button')].map((b) => b.getAttribute('aria-label') || b.innerText.trim()) : [],
    scrollW: document.documentElement.scrollWidth,
    clientW: document.documentElement.clientWidth,
  };
});
console.log('BP', JSON.stringify(bp, null, 1));
await page.screenshot({ path: `${OUT}/stage1-bp.png` });

// 3) 点顶栏 → 回到选图页，此时应有返回按钮
await page.locator('header button[aria-label="切换地图"]').click();
await page.waitForTimeout(400);
const back = await page.evaluate(() => ({
  heading: document.querySelector('h2')?.textContent,
  closeButtons: document.querySelectorAll('button[aria-label="返回"]').length,
  activeCards: document.querySelectorAll('.border-sky-500\\/70').length,
}));
console.log('BACK', JSON.stringify(back));
await page.screenshot({ path: `${OUT}/stage1-back.png` });

// 4) 返回按钮回到 BP
await page.locator('button[aria-label="返回"]').click();
await page.waitForTimeout(400);
console.log('RESUME_BP', await page.evaluate(() => !!document.querySelector('header')));

// 5) 320 宽窄屏检查
await page.setViewportSize({ width: 320, height: 640 });
await page.locator('header button[aria-label="切换地图"]').click();
await page.waitForTimeout(400);
const narrow = await page.evaluate(() => {
  const cards = [...document.querySelectorAll('section .grid.grid-cols-2 > button')];
  const boxes = cards.map((c) => {
    const r = c.getBoundingClientRect();
    return { w: Math.round(r.width), h: Math.round(r.height) };
  });
  const truncated = cards.filter((c) => {
    const s = c.querySelector('span span');
    return s && s.scrollWidth > s.clientWidth + 1;
  }).length;
  return {
    scrollW: document.documentElement.scrollWidth,
    clientW: document.documentElement.clientWidth,
    sample: boxes.slice(0, 4),
    truncatedNames: truncated,
  };
});
console.log('NARROW320', JSON.stringify(narrow));
await page.screenshot({ path: `${OUT}/stage1-startup-320.png` });

// 6) 320 宽下的 BP 顶栏
await page.locator('section .grid.grid-cols-2 > button').nth(1).click();
await page.waitForTimeout(400);
const bpNarrow = await page.evaluate(() => {
  const btn = document.querySelector('header button[aria-label="切换地图"]');
  const name = btn?.querySelector('span span');
  return {
    headerText: btn?.innerText.replace(/\n/g, ' | '),
    nameTruncated: name ? name.scrollWidth > name.clientWidth + 1 : null,
    headerW: btn ? Math.round(btn.getBoundingClientRect().width) : null,
    scrollW: document.documentElement.scrollWidth,
    clientW: document.documentElement.clientWidth,
  };
});
console.log('BP_320', JSON.stringify(bpNarrow));
await page.screenshot({ path: `${OUT}/stage1-bp-320.png` });

// 7) 同一张图再选一次：不应清空当前 BP 进度
const countPicked = () =>
  page.evaluate(
    () => document.querySelectorAll('footer img').length,
  );
await page.locator('.grid.grid-cols-5 > div[role="button"]').first().click();
await page.waitForTimeout(300);
const before = await countPicked();
await page.locator('header button[aria-label="切换地图"]').click();
await page.waitForTimeout(300);
await page.locator('section .grid.grid-cols-2 > button').nth(1).click();
await page.waitForTimeout(400);
const after = await countPicked();
console.log('SAME_MAP_KEEPS_PROGRESS', before === after, { before, after });

console.log('HTTP_ERRORS', bad.length ? bad : 'none');
console.log('CONSOLE_ERRORS', errors.length ? errors : 'none');
await browser.close();
