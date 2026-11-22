import { chromium } from 'playwright';

const BASE = 'http://127.0.0.1:4173';
const OUT = 'shots';

const browser = await chromium.launch();

const errors = [];
const bad = [];

async function makePage(w, h) {
  const ctx = await browser.newContext({
    viewport: { width: w, height: h },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  });
  const page = await ctx.newPage();
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(`PAGEERROR: ${e.message}`));
  page.on('response', (r) => {
    if (r.status() >= 400) bad.push(`${r.status()} ${r.url()}`);
  });
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
  return page;
}

/* ---------------- 1. 选图页：竖版大图卡片 ---------------- */
const page = await makePage(360, 780);
const picker = await page.evaluate(() => {
  const cards = [...document.querySelectorAll('section .grid.grid-cols-2 > button')];
  const first = cards[0];
  const img = first.querySelector('img');
  const r = first.getBoundingClientRect();
  const ir = img.getBoundingClientRect();
  return {
    cardW: Math.round(r.width),
    cardH: Math.round(r.height),
    imgBoxW: Math.round(ir.width),
    imgBoxH: Math.round(ir.height),
    natural: `${img.naturalWidth}x${img.naturalHeight}`,
    objectFit: getComputedStyle(img).objectFit,
    // 完整不裁切：显示框宽高比 ≈ 原图宽高比时，object-contain 才不会留白
    scrollW: document.documentElement.scrollWidth,
    clientW: document.documentElement.clientWidth,
  };
});
console.log('PICKER_CARD', JSON.stringify(picker));
await page.screenshot({ path: `${OUT}/stage2-picker.png` });

/* ---------------- 2. 进图：未选先手前置态 ---------------- */
await page.locator('section .grid.grid-cols-2 > button').first().click();
await page.waitForTimeout(500);

const pre = await page.evaluate(() => {
  const footer = document.querySelector('footer');
  const txt = footer.innerText.replace(/\s+/g, ' ').trim();
  const btns = [...footer.querySelectorAll('button')].map((b) => b.innerText.replace(/\s+/g, ' ').trim());
  const rects = [...footer.querySelectorAll('button')].map((b) => {
    const r = b.getBoundingClientRect();
    return { w: Math.round(r.width), h: Math.round(r.height) };
  });
  return {
    footerText: txt,
    footerButtons: btns,
    buttonSizes: rects,
    hasBanRow: /Ban/.test(txt),
    slotButtons: footer.querySelectorAll('button[aria-label^="己方"], button[aria-label^="敌方"]').length,
    banSlots: footer.querySelectorAll('button[aria-label^="Ban 位"]').length,
    undoReset: /撤回|重置/.test(txt),
  };
});
console.log('PRE_STATE', JSON.stringify(pre, null, 1));
await page.screenshot({ path: `${OUT}/stage2-pre.png` });

/* ---------------- 3. 前置态下点按无效 ---------------- */
await page.locator('.grid.grid-cols-5 > div[role="button"]').first().click();
await page.waitForTimeout(300);
const afterTap = await page.evaluate(() => {
  const footer = document.querySelector('footer');
  return {
    banSlots: footer.querySelectorAll('button[aria-label^="Ban 位"]').length,
    stillPre: /蓝先/.test(footer.innerText) && /红先/.test(footer.innerText),
  };
});
console.log('TAP_BLOCKED', JSON.stringify(afterTap));

/* ---------------- 4. 前置态下长按仍可看对位 ---------------- */
const tile = page.locator('.grid.grid-cols-5 > div[role="button"]').first();
const box = await tile.boundingBox();
await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
await page.mouse.down();
await page.waitForTimeout(650);
await page.mouse.up();
await page.waitForTimeout(400);
const matchup = await page.evaluate(() => {
  const sheet = [...document.querySelectorAll('div')].find(
    (d) => /克制|对位/.test(d.innerText || '') && d.className.includes('fixed'),
  );
  return { opened: !!sheet, text: sheet ? sheet.innerText.slice(0, 60).replace(/\n/g, ' / ') : null };
});
console.log('LONG_PRESS_IN_PRE', JSON.stringify(matchup));
await page.screenshot({ path: `${OUT}/stage2-pre-matchup.png` });
await page.keyboard.press('Escape');
// 关闭弹窗（点遮罩）
await page.mouse.click(180, 80);
await page.waitForTimeout(300);

/* ---------------- 5. 点「蓝先」→ 正式 BP ---------------- */
const blueBtn = page.locator('footer button[aria-label^="蓝先"]');
await blueBtn.click();
await page.waitForTimeout(400);

const bp = await page.evaluate(() => {
  const footer = document.querySelector('footer');
  const allySlots = [...footer.querySelectorAll('button[aria-label^="己方"]')];
  const enemySlots = [...footer.querySelectorAll('button[aria-label^="敌方"]')];
  const banSlots = [...footer.querySelectorAll('button[aria-label^="Ban 位"]')];
  const side = footer.querySelector('button[aria-label*="点击切换"]');
  const r = (el) => {
    const b = el.getBoundingClientRect();
    return { w: Math.round(b.width), h: Math.round(b.height), x: Math.round(b.x) };
  };
  return {
    banSlotCount: banSlots.length,
    banSlotBox: banSlots[0] ? r(banSlots[0]) : null,
    banRowOverflow: banSlots.length
      ? Math.round(banSlots[5].getBoundingClientRect().right) <= Math.round(window.innerWidth)
      : null,
    allyNumbers: allySlots.map((s) => s.innerText.trim()),
    enemyNumbers: enemySlots.map((s) => s.innerText.trim()),
    allyLabels: allySlots.map((s) => s.getAttribute('aria-label')),
    sideBtn: side ? { text: side.innerText.replace(/\s+/g, ''), ...r(side) } : null,
    ops: [...footer.querySelectorAll('button[aria-label="撤回上一步"], button[aria-label="重置本局"]')].map(
      (b) => ({ label: b.getAttribute('aria-label'), disabled: b.disabled, ...r(b) }),
    ),
    footerH: Math.round(footer.getBoundingClientRect().height),
    footerText: footer.innerText.replace(/\s+/g, ' ').trim(),
    scrollW: document.documentElement.scrollWidth,
    clientW: document.documentElement.clientWidth,
  };
});
console.log('BP_BLUE', JSON.stringify(bp, null, 1));
await page.screenshot({ path: `${OUT}/stage2-bp-blue.png` });

/* ---------------- 6. 切到红先 → 编号翻转 ---------------- */
await page.locator('footer button[aria-label*="点击切换"]').click();
await page.waitForTimeout(400);
const red = await page.evaluate(() => {
  const footer = document.querySelector('footer');
  const ally = [...footer.querySelectorAll('button[aria-label^="己方"]')].map((s) =>
    s.getAttribute('aria-label'),
  );
  const enemy = [...footer.querySelectorAll('button[aria-label^="敌方"]')].map((s) =>
    s.getAttribute('aria-label'),
  );
  const side = footer.querySelector('button[aria-label*="点击切换"]');
  return { ally, enemy, sideText: side?.innerText.replace(/\s+/g, ''), undoDisabled: footer.querySelector('button[aria-label="撤回上一步"]')?.disabled };
});
console.log('BP_RED', JSON.stringify(red, null, 1));
await page.screenshot({ path: `${OUT}/stage2-bp-red.png` });

/* ---------------- 7. 高度分配 ---------------- */
const layout = await page.evaluate(() => {
  const header = document.querySelector('header');
  const footer = document.querySelector('footer');
  const scroller = document.querySelector('.min-h-0.flex-1.overflow-y-auto');
  const h = (el) => (el ? Math.round(el.getBoundingClientRect().height) : null);
  const top = header.getBoundingClientRect().bottom;
  const foot = footer.getBoundingClientRect().top;
  return {
    vh: window.innerHeight,
    header: h(header),
    footer: h(footer),
    candidateArea: scroller ? Math.round(scroller.getBoundingClientRect().height) : null,
    candidateTop: Math.round(top),
    footerTop: Math.round(foot),
  };
});
console.log('LAYOUT_360x780', JSON.stringify(layout));

/* ---------------- 8. 390x844 ---------------- */
const p2 = await makePage(390, 844);
await p2.locator('section .grid.grid-cols-2 > button').first().click();
await p2.waitForTimeout(400);
await p2.locator('footer button[aria-label^="蓝先"]').click();
await p2.waitForTimeout(400);
const layout390 = await p2.evaluate(() => {
  const header = document.querySelector('header');
  const footer = document.querySelector('footer');
  const scroller = document.querySelector('.min-h-0.flex-1.overflow-y-auto');
  const h = (el) => (el ? Math.round(el.getBoundingClientRect().height) : null);
  const banSlots = [...footer.querySelectorAll('button[aria-label^="Ban 位"]')];
  return {
    vh: window.innerHeight,
    header: h(header),
    footer: h(footer),
    candidateArea: scroller ? Math.round(scroller.getBoundingClientRect().height) : null,
    banSlotW: banSlots[0] ? Math.round(banSlots[0].getBoundingClientRect().width) : null,
    banRowRight: banSlots.length ? Math.round(banSlots[5].getBoundingClientRect().right) : null,
    scrollW: document.documentElement.scrollWidth,
    clientW: document.documentElement.clientWidth,
  };
});
console.log('LAYOUT_390x844', JSON.stringify(layout390));
await p2.screenshot({ path: `${OUT}/stage2-bp-390.png` });

console.log('HTTP_ERRORS', bad.length ? bad : 'none');
console.log('CONSOLE_ERRORS', errors.length ? errors : 'none');
await browser.close();
