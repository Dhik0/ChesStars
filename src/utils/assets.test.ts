import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { BrawlMeta } from '../types/meta';
import { MODE_ORDER } from '../data/localization';
import { avatarCdnUrl, avatarUrl, modeIconUrl } from '../data/localization';
import { assetUrl } from './asset';

const META = JSON.parse(
  readFileSync(resolve(process.cwd(), 'public/data/brawl_meta.json'), 'utf-8'),
) as BrawlMeta;

const publicPath = (url: string) =>
  resolve(process.cwd(), 'public', url.replace(/^\.?\//, ''));

describe('静态资源路径', () => {
  it('走 BASE_URL，Capacitor 的 file:// 下也能加载', () => {
    const url = assetUrl('brawlers/16000000.png');
    expect(url.startsWith('./') || url.startsWith('/')).toBe(true);
    expect(url.endsWith('brawlers/16000000.png')).toBe(true);
  });

  it('不重复拼斜杠', () => {
    expect(assetUrl('/modes/heist.png')).not.toMatch(/\/\/modes/);
  });
});

describe('英雄头像资源完整性', () => {
  it('头像走本地静态文件，不再直连 CDN', () => {
    expect(avatarUrl(16000007)).not.toMatch(/^https?:/);
    expect(avatarUrl(16000007).endsWith('brawlers/16000007.png')).toBe(true);
  });

  it('CDN 地址仍保留，作为本地缺失时的兜底', () => {
    expect(avatarCdnUrl(16000007)).toBe(
      'https://cdn.brawlify.com/brawlers/borderless/16000007.png',
    );
  });

  it('108 名英雄都有本地头像文件', () => {
    const missing = META.brawlers.filter((b) => !existsSync(publicPath(avatarUrl(b.id))));
    expect(missing.map((b) => `${b.id} ${b.name}`)).toEqual([]);
  });

  it('杰西（16000007）头像文件存在且不是空文件', () => {
    const p = publicPath(avatarUrl(16000007));
    expect(existsSync(p)).toBe(true);
    expect(readFileSync(p).length).toBeGreaterThan(1024);
  });
});

describe('模式图标资源完整性', () => {
  it('6 个模式都有本地图标文件', () => {
    const missing = MODE_ORDER.filter((m) => !existsSync(publicPath(modeIconUrl(m))));
    expect(missing).toEqual([]);
  });

  it('图标路径按 mode key 拼，不依赖中文名', () => {
    expect(modeIconUrl('brawlBall').endsWith('modes/brawlBall.png')).toBe(true);
  });
});
