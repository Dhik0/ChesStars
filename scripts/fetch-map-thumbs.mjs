#!/usr/bin/env node
/**
 * 批量拉取地图缩略图到 public/maps/{slug}.png
 *
 * 数据源说明：
 *   - api.brawlify.com/v1/* 已下线（返回 404 no such endpoint），改用其官方镜像
 *     api.brawlapi.com/v1/maps（结构与 brawlify v1 完全一致，imageUrl 仍指向
 *     cdn.brawlify.com）。
 *   - 图片本体走 cdn.brawlify.com，可直接下载。
 *
 * 匹配策略（按优先级）：
 *   1. 英文名归一化后相等（忽略大小写、空格、标点）
 *   2. 同名地图有多条记录时：优先 gameMode 与本项目 mode 一致 → 优先未 disabled
 *      → 取 id 最大（同图的最新版本）
 *
 * 用法：node scripts/fetch-map-thumbs.mjs [--force]
 *   --force 已存在的图片也重新下载
 */
import { mkdir, readFile, writeFile, access } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const META_PATH = join(ROOT, 'public', 'data', 'brawl_meta.json');
const OUT_DIR = join(ROOT, 'public', 'maps');
const API = 'https://api.brawlapi.com/v1/maps';

/** 本项目 mode key → brawlapi 的 gameMode.name */
const MODE_TO_GAME_MODE = {
  bounty: 'Bounty',
  brawlBall: 'Brawl Ball',
  knockout: 'Knockout',
  hotZone: 'Hot Zone',
  gemGrab: 'Gem Grab',
  heist: 'Heist',
};

const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

/** 地图名 → 文件名 slug：先去掉撇号，再把非字母数字压成单个连字符 */
export function mapSlug(mapName) {
  return mapName
    .toLowerCase()
    .replace(/['’`]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

const exists = async (p) => {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
};

async function fetchJson(url) {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'brawl-draft-app/thumb-fetcher' },
  });
  if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`);
  return res.json();
}

async function download(url, dest) {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'brawl-draft-app/thumb-fetcher' },
  });
  if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  await writeFile(dest, buf);
  return buf.length;
}

/** PNG 尺寸（读 IHDR，避免为拿宽高引依赖） */
function pngSize(buf) {
  if (buf.length < 24 || buf.readUInt32BE(0) !== 0x89504e47) return null;
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

async function main() {
  const force = process.argv.includes('--force');
  const meta = JSON.parse(await readFile(META_PATH, 'utf8'));
  const api = await fetchJson(API);
  const list = api.list ?? [];

  /** 同名地图分组 */
  const byName = new Map();
  for (const m of list) {
    const key = norm(m.name);
    if (!byName.has(key)) byName.set(key, []);
    byName.get(key).push(m);
  }

  await mkdir(OUT_DIR, { recursive: true });

  const manifest = [];
  const missing = [];
  const problems = [];

  for (const entry of meta.maps) {
    const cands = byName.get(norm(entry.map_name)) ?? [];
    if (cands.length === 0) {
      missing.push(entry.map_name);
      continue;
    }

    const wantMode = MODE_TO_GAME_MODE[entry.mode];
    const picked = cands
      .slice()
      .sort((a, b) => {
        const am = a.gameMode?.name === wantMode ? 0 : 1;
        const bm = b.gameMode?.name === wantMode ? 0 : 1;
        if (am !== bm) return am - bm;
        if (!!a.disabled !== !!b.disabled) return a.disabled ? 1 : -1;
        return b.id - a.id;
      })[0];

    const slug = mapSlug(entry.map_name);
    const file = `${slug}.png`;
    const dest = join(OUT_DIR, file);

    let bytes = 0;
    let size = null;
    try {
      if (!force && (await exists(dest))) {
        const buf = await readFile(dest);
        bytes = buf.length;
        size = pngSize(buf);
      } else {
        bytes = await download(picked.imageUrl, dest);
        size = pngSize(await readFile(dest));
      }
    } catch (e) {
      problems.push(`${entry.map_name}: ${e.message}`);
      continue;
    }

    manifest.push({
      slug,
      file: `maps/${file}`,
      map_name: entry.map_name,
      mode: entry.mode,
      source_id: picked.id,
      source_name: picked.name,
      source_mode: picked.gameMode?.name ?? null,
      disabled: !!picked.disabled,
      bytes,
      width: size?.width ?? null,
      height: size?.height ?? null,
    });
  }

  manifest.sort((a, b) => a.slug.localeCompare(b.slug));
  await writeFile(
    join(OUT_DIR, 'manifest.json'),
    `${JSON.stringify({ generated_at: new Date().toISOString(), count: manifest.length, maps: manifest }, null, 2)}\n`,
    'utf8',
  );

  console.log(`下载完成：${manifest.length}/${meta.maps.length} 张`);
  for (const m of manifest) {
    console.log(
      `  ${m.file.padEnd(34)} ${m.map_name.padEnd(18)} id=${m.source_id} ` +
        `${m.width}x${m.height} ${(m.bytes / 1024).toFixed(1)}KB${m.disabled ? ' [DISABLED]' : ''}` +
        `${m.source_mode !== MODE_TO_GAME_MODE[m.mode] ? ` [mode=${m.source_mode}]` : ''}`,
    );
  }
  if (missing.length) console.log(`\n未匹配（API 无同名地图）：${missing.join('、')}`);
  if (problems.length) console.log(`\n下载失败：\n  ${problems.join('\n  ')}`);

  const total = manifest.reduce((s, m) => s + m.bytes, 0);
  console.log(`\n总体积 ${(total / 1024).toFixed(0)}KB`);

  if (missing.length || problems.length) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
