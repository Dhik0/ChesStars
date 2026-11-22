#!/usr/bin/env node
/**
 * 批量拉取英雄头像到 public/brawlers/{id}.png（Brawlify borderless 原图）。
 *
 * 为什么本地化：
 *   1. 离线可用——地图和 meta 都在本地，头像再走 CDN 就等于半离线；
 *   2. 首屏不会白块——本地文件基本零延迟，不用等 CDN 往返；
 *   3. 有「本地头像文件」这个实体，官方重做某个英雄后重跑本脚本即可整批刷新。
 *
 * 源：https://cdn.brawlify.com/brawlers/borderless/{id}.png
 *     （api.brawlify.com 已下线，api.brawlapi.com 是其官方镜像，imageUrl2 指向同一地址）
 *
 * 用法：node scripts/fetch-avatars.mjs [--force]
 */
import { mkdir, readFile, writeFile, access } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const META = join(ROOT, 'public', 'data', 'brawl_meta.json');
const OUT = join(ROOT, 'public', 'brawlers');
const CDN = (id) => `https://cdn.brawlify.com/brawlers/borderless/${id}.png`;

const exists = async (p) => {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
};

async function download(url, dest) {
  const res = await fetch(url, { headers: { 'User-Agent': 'brawl-draft-app/avatar-fetcher' } });
  if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  await writeFile(dest, buf);
  return buf.length;
}

const main = async () => {
  const force = process.argv.includes('--force');
  const meta = JSON.parse(await readFile(META, 'utf8'));
  await mkdir(OUT, { recursive: true });

  let fetched = 0;
  let kept = 0;
  let total = 0;
  const failed = [];

  for (const b of meta.brawlers) {
    const dest = join(OUT, `${b.id}.png`);
    try {
      if (!force && (await exists(dest))) {
        kept += 1;
        total += (await readFile(dest)).length;
      } else {
        total += await download(CDN(b.id), dest);
        fetched += 1;
      }
    } catch (e) {
      failed.push(`${b.id} ${b.name}: ${e.message}`);
    }
  }

  console.log(`头像就绪：${meta.brawlers.length - failed.length}/${meta.brawlers.length}`);
  console.log(`  新下载 ${fetched} · 复用 ${kept} · 合计 ${(total / 1024).toFixed(0)}KB`);
  if (failed.length) {
    console.log('失败：');
    for (const f of failed) console.log('  ', f);
    process.exitCode = 1;
  }
};

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
