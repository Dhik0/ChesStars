import { chromium } from 'playwright';

const BASE = 'http://127.0.0.1:4173';
const OUT = 'shots';

const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 320, height: 520 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
});
const page = await ctx.newPage();
const cdp = await ctx.newCDPSession(page);

const errors = [];
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text());
});
page.on('pageerror', (e) => errors.push(`PAGEERROR: ${e.message}`));

const shot = async (n) => {
  await page.waitForTimeout(280);
  await page.screenshot({ path: `${OUT}/${n}.png` });
};

const measure = () =>
  page.evaluate(() => {
    const r = (el) => (el ? el.getBoundingClientRect() : null);
    const round = (v) => Math.round(v * 10) / 10;
    const footer = document.querySelector('footer');
    const tiles = [...document.querySelectorAll('.grid.grid-cols-5 > div[role="button"]')];
    const slots = [
      ...footer.querySelectorAll('button[aria-label^="己方"], button[aria-label^="敌方"]'),
    ];
    const list = document.querySelector('.overflow-y-auto');
    const de = document.documentElement;

    // 头像对齐：左列贴左、右列贴右
    const alignOf = (slot) => {
      if (!slot) return null;
      const box = r(slot);
      const kids = [...slot.children].map((c) => r(c));
      const isAlly = (slot.getAttribute('aria-label') ?? '').startsWith('己方');
      const imgBox = isAlly ? kids[0] : kids[kids.length - 1];
      return isAlly ? round(imgBox.left - box.left) : round(box.right - imgBox.right);
    };

    // 顺位词条是否在分数行（头像下方）：找一个带词条的格子来验
    const tile = tiles[0];
    let badgeBelowAvatar = null;
    for (const el of tiles) {
      const badge = [...el.querySelectorAll('span')].find((s) =>
        /^(先手|C位)$/.test(s.textContent?.trim() ?? ''),
      );
      if (!badge) continue;
      const img = r(el.querySelector('img'));
      badgeBelowAvatar = img ? round(r(badge).top - img.bottom) >= 0 : null;
      break;
    }

    return {
      footerH: round(r(footer).height),
      listH: round(r(list).height),
      listScrollH: list.scrollHeight,
      hasSeparator: !!document.querySelector('footer div[role="separator"]'),
      tileCount: tiles.length,
      tile: tile ? [round(r(tile).width), round(r(tile).height)] : null,
      badgeBelowAvatar,
      slotCount: slots.length,
      slot: slots[0] ? [round(r(slots[0]).width), round(r(slots[0]).height)] : null,
      slotRows: new Set(slots.map((s) => Math.round(r(s).top))).size,
      alignAlly: alignOf(slots[0]),
      alignEnemy: alignOf(slots[3]),
      blockCount: [...footer.querySelectorAll('span.h-3')].length,
      blockColors: [...footer.querySelectorAll('span.h-3')]
        .slice(0, 6)
        .map((s) => getComputedStyle(s).backgroundColor),
      scrollW: de.scrollWidth,
      innerW: window.innerWidth,
      scrollH: de.scrollHeight,
      innerH: window.innerHeight,
    };
  });

const report = (label, m) => {
  const bad = m.scrollW > m.innerW + 1 || m.scrollH > m.innerH + 1;
  console.log(
    `\n[${label}] 底栏 ${m.footerH}  列表 ${m.listH}  拖拽条 ${m.hasSeparator ? '仍在' : '已移除'}`,
  );
  console.log(
    `  网格 ${m.tileCount} 个  单格 ${m.tile?.[0]}×${m.tile?.[1]}  词条在分数行 ${m.badgeBelowAvatar ? '✓' : '❌'}`,
  );
  console.log(
    `  槽位 ${m.slotCount} 个  单个 ${m.slot?.[0]}×${m.slot?.[1]}  共 ${m.slotRows} 行  色块 ${m.blockCount} 个`,
  );
  console.log(`  头像对齐  左列贴左 ${m.alignAlly}px  右列贴右 ${m.alignEnemy}px`);
  console.log(`  溢出 ${bad ? '❌ 有' : '✓ 无'}`);
  return !bad;
};

await page.goto(BASE, { waitUntil: 'networkidle' });
// meta 缓存已从 localStorage 迁到 IndexedDB，重置状态时两边都要清
await page.evaluate(async () => {
  localStorage.clear();
  await new Promise((resolve) => {
    const req = indexedDB.deleteDatabase('chesstars');
    req.onsuccess = () => resolve();
    req.onerror = () => resolve();
    req.onblocked = () => resolve();
  });
});
await page.reload({ waitUntil: 'networkidle' });
await page.waitForSelector('.grid.grid-cols-5 > div[role="button"]', { timeout: 15000 });
await page.waitForTimeout(1600);

console.log('=== 1. 默认：只有最大化状态 ===');
const m1 = await measure();
const ok1 = report('default', m1);
await shot('w1-default');

console.log('\n=== 2. 填 6 Ban + 我方 1 人 + 敌方 1 人 ===');
const t = page.locator('.grid.grid-cols-5 > div[role="button"]');
for (let i = 0; i < 8; i += 1) {
  await t.nth(i % 4).click();
  await page.waitForTimeout(140);
}
const m2 = await measure();
const ok2 = report('filled', m2);
console.log(`  色块颜色: ${m2.blockColors.slice(0, 3).join(' | ')}`);
await shot('w2-filled');

console.log('\n=== 3. 点已填槽位可清空 ===');
const allySlot = page.locator('footer button[aria-label^="己方"]').first();
const before = await page.evaluate(
  () => document.querySelectorAll('footer button[aria-label^="己方"]')[0].getAttribute('aria-label'),
);
await allySlot.click();
await page.waitForTimeout(350);
const after = await page.evaluate(
  () => document.querySelectorAll('footer button[aria-label^="己方"]')[0].getAttribute('aria-label'),
);
console.log(`  清空前: ${before}`);
console.log(`  清空后: ${after}  ${/（空）/.test(after ?? '') ? '✓' : '❌'}`);

console.log('\n=== 4. 长按头像开详情 ===');
const tb = await t.first().boundingBox();
const pt = (x, y) => [{ x, y, radiusX: 8, radiusY: 8, force: 1 }];
await cdp.send('Input.dispatchTouchEvent', {
  type: 'touchStart',
  touchPoints: pt(tb.x + tb.width / 2, tb.y + tb.height / 2),
});
await page.waitForTimeout(620);
await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
await page.waitForTimeout(600);
const detailOpen = await page.locator('text=加减分明细').count();
console.log(`  明细面板: ${detailOpen > 0 ? '✓ 已打开' : '❌ 没打开'}`);
if (detailOpen > 0) {
  await page.locator('button[aria-label="关闭"]').first().click();
  await page.waitForTimeout(300);
}

console.log('\n=== 5. 280×480 极窄屏 ===');
await page.setViewportSize({ width: 280, height: 480 });
await page.waitForTimeout(500);
const m5 = await measure();
const ok5 = report('280', m5);
await shot('w3-280');

console.log('\n=== 6. 控制台错误 ===');
console.log(errors.length === 0 ? '  ✓ 无 console/page 错误' : errors.slice(0, 6).join('\n'));

const allOk =
  [ok1, ok2, ok5].every(Boolean) &&
  !m1.hasSeparator &&
  m1.badgeBelowAvatar === true &&
  m1.alignAlly <= 1.5 &&
  m1.alignEnemy <= 1.5 &&
  m1.slotRows === 3 &&
  /（空）/.test(after ?? '') &&
  detailOpen > 0;
console.log(`\n结果汇总: ${allOk ? '✓ 全部通过' : '❌ 有失败项'}`);

await browser.close();
