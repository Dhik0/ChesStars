/**
 * 译名表自检：核对 `src/i18n/gameData.ts` 与 `public/data/brawl_meta.json` 是否对得上。
 *
 * 用法：node scripts/check-locale.mjs
 *
 * 检查项：
 *   1. 每个英雄都有简中 / 繁中译名（缺失会回退英文原名）
 *   2. 每张地图都有简中 / 繁中译名
 *   3. roles 表里的英雄名是否都能落到字典上
 *
 * 注：三份 `locales/*.json` 的 key 一致性、占位符一致性由
 * `npx vitest run src/i18n` 覆盖，这里不重复。
 */
import { build } from 'esbuild';
import { readFileSync, mkdirSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const TMP = '.tmp/locale.mjs';
mkdirSync('.tmp', { recursive: true });

await build({
  entryPoints: ['src/i18n/gameData.ts'],
  bundle: true,
  format: 'esm',
  platform: 'node',
  outfile: TMP,
  logLevel: 'silent',
});

const loc = await import(pathToFileURL(TMP).href);
const meta = JSON.parse(readFileSync('public/data/brawl_meta.json', 'utf-8'));

const norm = loc.normalizeName;
let fail = 0;

/* ---------- 1. 英雄漏翻 ---------- */
const missing = [];
for (const b of meta.brawlers) {
  for (const lang of ['zh-CN', 'zh-TW']) {
    if (loc.brawlerName(lang, b.name) === b.name) {
      missing.push(`${b.name}  [${lang}]  (期望 key: ${norm(b.name)})`);
    }
  }
}

/* ---------- 2. 地图漏翻 ---------- */
const mapMissing = [];
for (const m of meta.maps) {
  for (const lang of ['zh-CN', 'zh-TW']) {
    if (loc.mapName(lang, m.map_name) === m.map_name) {
      mapMissing.push(`${m.map_name}  [${lang}]`);
    }
  }
}

/* ---------- 3. roles 名称匹配 ---------- */
const dataKeys = new Set(meta.brawlers.map((b) => norm(b.name)));
const roleMiss = [];
for (const role of meta.roles.roles) {
  for (const name of role.brawlers) {
    const k = norm(name);
    const fixed = loc.ROLE_NAME_ALIAS[k] ?? k;
    if (!dataKeys.has(fixed) && !dataKeys.has(k)) roleMiss.push(`${role.key}: ${name}`);
  }
}

/* ---------- 输出 ---------- */
const line = (s) => console.log(s);

line(`\n数据：${meta.brawlers.length} 英雄 / ${meta.maps.length} 地图 / ${meta.roles.roles.length} 角色组`);
line(`译名表：${loc.BRAWLER_NAME_COUNT} 个英雄条目\n`);

if (missing.length) {
  fail += missing.length;
  line(`❌ 英雄漏翻 ${missing.length} 处（这些会显示英文名）：`);
  missing.forEach((m) => line(`   ${m}`));
} else {
  line(`✅ 英雄：${meta.brawlers.length} 个全部有简中 / 繁中译名`);
}

if (mapMissing.length) {
  fail += mapMissing.length;
  line(`\n❌ 地图漏翻 ${mapMissing.length} 处：`);
  mapMissing.forEach((m) => line(`   ${m}`));
} else {
  line(`\n✅ 地图：${meta.maps.length} 张全部有简中 / 繁中译名`);
}

if (roleMiss.length) {
  fail += roleMiss.length;
  line(`\n❌ 角色表里有 ${roleMiss.length} 个名字匹配不到英雄：`);
  roleMiss.forEach((r) => line(`   ${r}`));
}

line(
  fail === 0
    ? '\n🎉 全部通过，没有需要修的地方\n'
    : `\n共 ${fail} 处需要处理\n`,
);

process.exit(fail === 0 ? 0 : 1);
