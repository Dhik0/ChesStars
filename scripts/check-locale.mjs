/**
 * 翻译表自检：核对 src/data/localization.ts 与 public/data/brawl_meta.json 是否对得上。
 *
 * 用法：node scripts/check-locale.mjs
 *
 * 检查项：
 *   1. 每个英雄是否有中文名（key 是否匹配得上）
 *   2. 翻译表里是否有「数据中不存在的孤儿 key」（多半是拼错）
 *   3. key 是否含非法字符（必须是小写字母数字，不能有空格/下划线/连字符）
 *   4. 24 张地图是否都有中文名
 *   5. roles 表里的英雄名是否都能落到字典上
 */
import { build } from 'esbuild';
import { readFileSync, mkdirSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const TMP = '.tmp/locale.mjs';
mkdirSync('.tmp', { recursive: true });

await build({
  entryPoints: ['src/data/localization.ts'],
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
  const key = norm(b.name);
  if (!loc.BRAWLER_LOCALE[key]) missing.push(`${b.name}  (期望 key: ${key})`);
}

/* ---------- 2. 孤儿 key ---------- */
const dataKeys = new Set(meta.brawlers.map((b) => norm(b.name)));
const orphans = Object.keys(loc.BRAWLER_LOCALE).filter((k) => !dataKeys.has(k));

/* ---------- 3. 非法 key ---------- */
const illegal = Object.keys(loc.BRAWLER_LOCALE).filter((k) => !/^[a-z0-9]+$/.test(k));

/* ---------- 4. 地图漏翻 ---------- */
const mapMissing = meta.maps.filter((m) => !loc.MAP_CN[m.map_name]).map((m) => m.map_name);
const mapKeys = new Set(meta.maps.map((m) => m.map_name));
const mapOrphans = Object.keys(loc.MAP_CN).filter((k) => !mapKeys.has(k));

/* ---------- 5. roles 名称匹配 ---------- */
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
line(`翻译表：${Object.keys(loc.BRAWLER_LOCALE).length} 英雄条目 / ${Object.keys(loc.MAP_CN).length} 地图\n`);

if (missing.length) {
  fail += missing.length;
  line(`❌ 英雄漏翻 ${missing.length} 个（这些会显示英文名）：`);
  missing.forEach((m) => line(`   ${m}`));
} else {
  line('✅ 英雄：108 个全部有中文名');
}

if (illegal.length) {
  fail += illegal.length;
  line(`\n❌ key 含非法字符 ${illegal.length} 个（必须是小写字母数字，不能有空格/下划线/连字符）：`);
  illegal.forEach((k) => line(`   "${k}" -> 应为 "${norm(k)}"`));
}

if (orphans.length) {
  // 孤儿 key 不计入失败：可能是给未上线英雄预留的条目
  line(`\n⚠️  孤儿 key ${orphans.length} 个（翻译表里有，但数据里暂时没这个英雄，不影响运行）：`);
  orphans.forEach((k) => line(`   ${k} (${loc.BRAWLER_LOCALE[k].cn})`));
}

if (mapMissing.length) {
  fail += mapMissing.length;
  line(`\n❌ 地图漏翻 ${mapMissing.length} 张：`);
  mapMissing.forEach((m) => line(`   ${m}`));
} else {
  line('\n✅ 地图：24 张全部有中文名');
}

if (mapOrphans.length) {
  // 地图孤儿 key 通常是名字写错了（大小写/空格/撇号），必须修
  fail += mapOrphans.length;
  line(`\n❌ 地图孤儿 key ${mapOrphans.length} 个（名字必须和 JSON 的 map_name 完全一致）：`);
  mapOrphans.forEach((k) => line(`   "${k}"`));
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
