#!/usr/bin/env node
/**
 * 生成 `src/data/rarity.ts`：108 名英雄的官方稀有度映射。
 *
 * 数据源：
 *   - `api.brawlapi.com/v1/brawlers` 的 `rarity` 字段（Brawlify 官方镜像，
 *     id/name/color 与游戏内一致）
 *   - `public/data/brawl_meta.json` 的英雄表（以它为全集，保证不漏不多）
 *
 * 稀有度 id（游戏内真实取值）：
 *   1 Common / 2 Rare / 3 Super Rare / 4 Epic / 5 Mythic / 6 Legendary / 7 Ultra Legendary
 *
 * 用法：node scripts/gen-rarity.mjs
 *   需要先把 API 结果存到 .tmp/brawlers-api.json（或让脚本自己拉）。
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const META = join(ROOT, 'public', 'data', 'brawl_meta.json');
const CACHE = join(ROOT, '.tmp', 'brawlers-api.json');
const OUT = join(ROOT, 'src', 'data', 'rarity.ts');
const API = 'https://api.brawlapi.com/v1/brawlers';

const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

/** brawlapi rarity.name → 本项目 key */
const NAME_TO_KEY = {
  Common: 'common',
  Rare: 'rare',
  'Super Rare': 'superRare',
  Epic: 'epic',
  Mythic: 'mythic',
  Legendary: 'legendary',
  'Ultra Legendary': 'ultraLegendary',
};

async function loadApi() {
  if (existsSync(CACHE)) {
    return JSON.parse(await readFile(CACHE, 'utf8'));
  }
  const res = await fetch(API, { headers: { 'User-Agent': 'brawl-draft-app/rarity-gen' } });
  if (!res.ok) throw new Error(`${API} → HTTP ${res.status}`);
  const data = await res.json();
  await mkdir(dirname(CACHE), { recursive: true });
  await writeFile(CACHE, JSON.stringify(data), 'utf8');
  return data;
}

const main = async () => {
  const meta = JSON.parse(await readFile(META, 'utf8'));
  const api = await loadApi();

  const byName = new Map();
  for (const b of api.list) {
    const k = norm(b.name);
    if (!byName.has(k)) byName.set(k, []);
    byName.get(k).push(b);
  }

  const rows = [];
  const missing = [];
  for (const b of meta.brawlers) {
    const cands = byName.get(norm(b.name)) ?? [];
    if (!cands.length) {
      missing.push(b.name);
      continue;
    }
    const key = NAME_TO_KEY[cands[0].rarity.name];
    if (!key) {
      missing.push(`${b.name}（未知稀有度 ${cands[0].rarity.name}）`);
      continue;
    }
    rows.push({ id: b.id, name: b.name, key });
  }

  const ORDER = ['common', 'rare', 'superRare', 'epic', 'mythic', 'legendary', 'ultraLegendary'];
  const LABEL = {
    common: '初始',
    rare: '稀有',
    superRare: '超稀有',
    epic: '史诗',
    mythic: '神话',
    legendary: '传奇',
    ultraLegendary: '超传奇',
  };

  rows.sort((a, b) => ORDER.indexOf(a.key) - ORDER.indexOf(b.key) || a.id - b.id);

  const lines = [];
  lines.push('/**');
  lines.push(' * 英雄稀有度映射（自动生成，勿手改）');
  lines.push(' *');
  lines.push(' * 由 `scripts/gen-rarity.mjs` 依据 `api.brawlapi.com/v1/brawlers` 的 `rarity`');
  lines.push(' * 字段 + `public/data/brawl_meta.json` 的英雄全集生成。');
  lines.push(' * 之所以单独放一份而不是塞进 brawl_meta.json：后者由 brawl-draft-core 重新生成，');
  lines.push(' * 每次同步都会被覆盖。');
  lines.push(' */');
  lines.push('');
  lines.push("export type RarityKey =");
  for (const k of ORDER) lines.push(`  | '${k}'`);
  lines.push(';');
  lines.push('');
  lines.push('/** 分区展示顺序：从低到高 */');
  lines.push(`export const RARITY_ORDER: RarityKey[] = [${ORDER.map((k) => `'${k}'`).join(', ')}];`);
  lines.push('');
  lines.push('export interface RarityMeta {');
  lines.push('  key: RarityKey;');
  lines.push('  /** 中文名 */');
  lines.push('  cn: string;');
  lines.push('  /** 官方主题色（区块标题 / 描边用） */');
  lines.push('  color: string;');
  lines.push('}');
  lines.push('');
  lines.push('export const RARITY_META: Record<RarityKey, RarityMeta> = {');
  const COLORS = {
    common: '#68FD58',
    rare: '#68FD58',
    superRare: '#5AB3FF',
    epic: '#D850FF',
    mythic: '#FE5E72',
    legendary: '#FFF11E',
    ultraLegendary: '#2DD4BF',
  };
  for (const k of ORDER) {
    lines.push(`  ${k}: { key: '${k}', cn: '${LABEL[k]}', color: '${COLORS[k]}' },`);
  }
  lines.push('};');
  lines.push('');
  lines.push('export const RARITY_BY_ID: Record<number, RarityKey> = {');
  let lastKey = null;
  for (const r of rows) {
    if (r.key !== lastKey) {
      lines.push(`  // ${LABEL[r.key]}`);
      lastKey = r.key;
    }
    lines.push(`  ${r.id}: '${r.key}', // ${r.name}`);
  }
  lines.push('};');
  lines.push('');
  lines.push('/** 取英雄稀有度；表里没有的一律按「神话」兜底（不会发生，测试会卡住） */');
  lines.push('export function rarityOf(id: number): RarityKey {');
  lines.push("  return RARITY_BY_ID[id] ?? 'mythic';");
  lines.push('}');
  lines.push('');
  lines.push('/** 稀有度表覆盖的 id 数量（供测试断言） */');
  lines.push('export const RARITY_COUNT = Object.keys(RARITY_BY_ID).length;');
  lines.push('');

  await writeFile(OUT, lines.join('\n'), 'utf8');

  const dist = {};
  for (const r of rows) dist[r.key] = (dist[r.key] ?? 0) + 1;
  console.log('写入', OUT);
  console.log('分布', dist);
  console.log('合计', rows.length, '/ 英雄表', meta.brawlers.length);
  if (missing.length) {
    console.log('未匹配：', missing);
    process.exitCode = 1;
  }
};

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
