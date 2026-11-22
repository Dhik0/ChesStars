import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { BrawlMeta } from '../types/meta';
import { mapImageUrl, mapSlug } from './mapImage';

const META = JSON.parse(
  readFileSync(resolve(process.cwd(), 'public/data/brawl_meta.json'), 'utf-8'),
) as BrawlMeta;

interface ManifestEntry {
  slug: string;
  file: string;
  map_name: string;
  mode: string;
  source_id: number;
  width: number;
  height: number;
}

const MANIFEST = JSON.parse(
  readFileSync(resolve(process.cwd(), 'public/maps/manifest.json'), 'utf-8'),
) as { count: number; maps: ManifestEntry[] };

describe('mapSlug', () => {
  it('英文名转成稳定的短横线 slug', () => {
    expect(mapSlug('Hard Rock Mine')).toBe('hard-rock-mine');
    expect(mapSlug('Center Stage')).toBe('center-stage');
    expect(mapSlug('Double Swoosh')).toBe('double-swoosh');
  });

  it('撇号直接去掉，不产生多余连字符', () => {
    expect(mapSlug("Belle's Rock")).toBe('belles-rock');
  });

  it('大小写与多余标点归一', () => {
    expect(mapSlug('Ring of Fire')).toBe(mapSlug('RING OF FIRE'));
    expect(mapSlug('Out in the Open')).toBe('out-in-the-open');
  });
});

describe('mapImageUrl', () => {
  it('走 BASE_URL，保证 Capacitor 的 file:// 下也能加载', () => {
    const url = mapImageUrl('Hard Rock Mine');
    expect(url.startsWith('./') || url.startsWith('/')).toBe(true);
    expect(url.endsWith('maps/hard-rock-mine.png')).toBe(true);
  });
});

describe('地图缩略图资源完整性', () => {
  it('manifest 覆盖全部地图，且每张图片文件真实存在', () => {
    const missing: string[] = [];
    for (const m of META.maps) {
      const slug = mapSlug(m.map_name);
      const hit = MANIFEST.maps.find((x) => x.slug === slug);
      if (!hit) {
        missing.push(`${m.map_name}（manifest 无记录）`);
        continue;
      }
      if (hit.map_name !== m.map_name) missing.push(`${m.map_name}（manifest 名字不符）`);
      if (!existsSync(resolve(process.cwd(), 'public', hit.file))) {
        missing.push(`${m.map_name}（${hit.file} 不存在）`);
      }
    }
    expect(missing).toEqual([]);
  });

  it('manifest 条数与地图数一致，没有孤儿图片', () => {
    expect(MANIFEST.maps).toHaveLength(META.maps.length);
    expect(MANIFEST.count).toBe(MANIFEST.maps.length);
  });

  it('slug 唯一，不会两张图互相覆盖', () => {
    const slugs = MANIFEST.maps.map((m) => m.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });
});
