import { chromium } from 'playwright';

const BASE = 'http://localhost:4173';
const OUT = 'shots';

const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 320, height: 520 },
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

const shot = async (name) => {
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}/${name}.png` });
  console.log(`  shot -> ${name}.png`);
};

const overflow = async (label) => {
  const r = await page.evaluate(() => {
    const de = document.documentElement;
    const body = document.body;
    return {
      scrollW: de.scrollWidth,
      clientW: de.clientWidth,
      bodyScrollW: body.scrollWidth,
      innerW: window.innerWidth,
      innerH: window.innerHeight,
      docH: de.scrollHeight,
    };
  });
  const bad = r.scrollW > r.innerW + 1 || r.bodyScrollW > r.innerW + 1;
  console.log(
    `[${label}] innerW=${r.innerW} scrollW=${r.scrollW} bodyScrollW=${r.bodyScrollW} ${bad ? '❌ 横向溢出' : '✓ 无横向溢出'}`,
  );
  return bad;
};

await page.goto(BASE, { waitUntil: 'networkidle' });
await page.waitForSelector('div[role="button"]', { timeout: 15000 });
await page.waitForTimeout(2500);

console.log('\n=== 1. 初始状态（Ban 阶段） ===');
await shot('01-initial');
await overflow('initial');

const rows = page.locator('div[role="button"]');
console.log('  可选英雄行数:', await rows.count());

// 阶段标签应显示 Ban 0/6
const banLabel = await page.locator('footer span').first().textContent();
console.log('  阶段标签:', banLabel?.trim());

console.log('\n=== 2. 点 3 个英雄填 Ban ===');
for (let i = 0; i < 3; i += 1) {
  await rows.first().click();
  await page.waitForTimeout(250);
}
await shot('02-ban-3');
const banLabel2 = await page.locator('footer span').first().textContent();
console.log('  阶段标签:', banLabel2?.trim());

console.log('\n=== 3. 填满 6 个 Ban ===');
for (let i = 0; i < 3; i += 1) {
  await rows.first().click();
  await page.waitForTimeout(250);
}
await shot('03-ban-full');
const banLabel3 = await page.locator('footer span').first().textContent();
console.log('  阶段标签（应进入第 1 手）:', banLabel3?.trim());

console.log('\n=== 4. 我方第 1 手选人 ===');
await rows.first().click();
await page.waitForTimeout(300);
await shot('04-pick-1');
const label4 = await page.locator('footer span').first().textContent();
console.log('  阶段标签（应第 2 手 敌选）:', label4?.trim());

console.log('\n=== 5. 敌方选 2 人后，检查克制标签出现 ===');
await rows.first().click();
await page.waitForTimeout(250);
await rows.first().click();
await page.waitForTimeout(400);
await shot('05-enemy-picked');
const tagCount = await page.locator('div[role="button"] span').filter({ hasText: /克制|怕/ }).count();
console.log('  克制类标签数量:', tagCount);

console.log('\n=== 6. 打开详情弹窗 ===');
await page.locator('button[aria-label$="详情"]').first().click();
await page.waitForTimeout(500);
await shot('06-detail');
const detailText = await page.locator('text=加减分明细').count();
console.log('  明细面板存在:', detailText > 0 ? '✓' : '❌');
await page.keyboard.press('Escape').catch(() => {});
await page.locator('button[aria-label="关闭"]').first().click();
await page.waitForTimeout(300);

console.log('\n=== 7. 地图选择器 ===');
await page.locator('header button').first().click();
await page.waitForTimeout(400);
await shot('07-map-picker');
await overflow('map-picker');
const mapCount = await page.locator('section button').count();
console.log('  地图卡片数:', mapCount);
// 搜索测试
await page.locator('input[placeholder*="搜地图"]').fill('火');
await page.waitForTimeout(400);
await shot('08-map-search');
const filtered = await page.locator('section button').count();
console.log('  搜「火」后卡片数:', filtered);
await page.locator('button[aria-label="关闭"]').first().click();
await page.waitForTimeout(300);

console.log('\n=== 8. 设置弹窗 ===');
await page.locator('button[aria-label="设置"]').click();
await page.waitForTimeout(400);
await shot('09-settings');
await overflow('settings');
const urlInput = page.locator('input[placeholder*="jsdelivr"]');
const urlValue = await urlInput.inputValue();
console.log('  默认远程地址:', urlValue);
await page.locator('button[aria-label="关闭"]').first().click();
await page.waitForTimeout(300);

console.log('\n=== 9. 搜索 + 拼音首字母 ===');
await page.locator('input[placeholder*="搜英雄"]').fill('rk');
await page.waitForTimeout(500);
await shot('10-search-pinyin');
const searchRows = await rows.count();
console.log('  搜「rk」结果行数:', searchRows);
const firstRowText = await rows.first().textContent();
console.log('  首行内容:', firstRowText?.replace(/\s+/g, ' ').slice(0, 40));

console.log('\n=== 10. 清空搜索 + 重置本局 ===');
await page.locator('button[aria-label="清空搜索"]').click();
await page.waitForTimeout(300);
await page.locator('button[aria-label="重置本局"]').click();
await page.waitForTimeout(400);
await shot('11-after-reset');
const label11 = await page.locator('footer span').first().textContent();
console.log('  重置后阶段标签:', label11?.trim());

console.log('\n=== 11. 切到敌方先手 ===');
await page.locator('header button').nth(1).click();
await page.waitForTimeout(400);
await shot('12-enemy-first');
const firstLabel = await page.locator('header button').nth(1).textContent();
console.log('  先手胶囊:', firstLabel?.trim());

console.log('\n=== 12. 极窄屏 280x480 检查 ===');
await page.setViewportSize({ width: 280, height: 480 });
await page.waitForTimeout(600);
await shot('13-narrow-280');
await overflow('narrow-280');

console.log('\n=== 13. 控制台错误 ===');
console.log(errors.length === 0 ? '  ✓ 无 console/page 错误' : errors.slice(0, 8).join('\n'));

await browser.close();
