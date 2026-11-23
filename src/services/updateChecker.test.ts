import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import pkg from '../../package.json';
import { APP_VERSION } from '../config/app';
import {
  checkForUpdate,
  ignoreVersion,
  isVersionIgnored,
  mirrorDownloadUrl,
  parseVersionManifest,
} from './updateChecker';

function fakeResponse(body: unknown, init: { ok?: boolean; status?: number } = {}) {
  return {
    ok: init.ok ?? true,
    status: init.status ?? 200,
    headers: { get: () => null },
    json: async () => body,
  } as unknown as Response;
}

/** node 环境下没有 localStorage，这里给一个内存实现 */
function stubStorage() {
  const map = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => {
      map.set(k, v);
    },
    removeItem: (k: string) => {
      map.delete(k);
    },
  });
  return map;
}

beforeEach(() => {
  stubStorage();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('GitHub Release 版本检测', () => {
  // 版本号唯一来源是 package.json（构建时注入 __APP_VERSION__），这里直接比对，发版不用改测试
  it('当前版本与 package.json 一致', () => {
    expect(APP_VERSION).toBe(pkg.version);
  });

  it('tag_name 去掉 v 前缀后大于当前版本 → update', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        fakeResponse({
          tag_name: 'v9.9.9',
          body: '## 更新\n\n- 新增空 Ban\n- 修复若干问题',
          html_url: 'https://github.com/Dhik0/ChesStars/releases/tag/v9.9.9',
          published_at: '2026-11-22T10:00:00Z',
        }),
      ),
    );

    const res = await checkForUpdate();
    expect(res.status).toBe('update');
    expect(res.info?.version).toBe('9.9.9');
    expect(res.info?.notes).toContain('空 Ban');
    expect(res.info?.htmlUrl).toContain('/releases/tag/v9.9.9');
    // Markdown 噪音被清掉：没有标题井号、没有列表符、没有强调标记
    expect(res.info?.notes).not.toContain('##');
    expect(res.info?.notes).not.toContain('- ');
    expect(res.info?.notes).toContain('• 新增空 Ban');
  });

  it('同版本或更低版本 → latest', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(fakeResponse({ tag_name: `v${APP_VERSION}` })),
    );
    expect((await checkForUpdate()).status).toBe('latest');

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(fakeResponse({ tag_name: 'v0.9.0' })));
    expect((await checkForUpdate()).status).toBe('latest');
  });

  it('网络失败 / 限流一律收敛成 error，不抛异常', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(fakeResponse(null, { ok: false, status: 403 })));
    const res = await checkForUpdate();
    expect(res.status).toBe('error');
    expect(res.reason).toContain('403');
  });

  it('缺少 tag_name 时按 error 处理', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(fakeResponse({ name: 'no tag' })));
    expect((await checkForUpdate()).status).toBe('error');
  });

  it('忽略过的版本会被记住，用于抑制重复弹窗', () => {
    expect(isVersionIgnored('1.2.0')).toBe(false);
    ignoreVersion('v1.2.0');
    expect(isVersionIgnored('1.2.0')).toBe(true);
    // 重复写入不会产生脏数据
    ignoreVersion('1.2.0');
    expect(isVersionIgnored('1.3.0')).toBe(false);
  });
});

/* ------------------------------------------------------------------ */
/* 双通道检测：version.json 优先，Releases API 兜底                      */
/* ------------------------------------------------------------------ */

const SHA = '54efc4bfccd9e4e0e787ee466aa1e27a6b0215d1';

function routedFetch(handlers: {
  commit?: () => Response;
  manifest?: () => Response;
  releases?: () => Response;
}) {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes('/commits/main')) {
      return handlers.commit ? handlers.commit() : fakeResponse({ sha: SHA });
    }
    if (url.includes('version.json')) {
      return handlers.manifest
        ? handlers.manifest()
        : fakeResponse(null, { ok: false, status: 404 });
    }
    if (url.includes('/releases/latest')) {
      return handlers.releases ? handlers.releases() : fakeResponse(null, { ok: false, status: 404 });
    }
    return fakeResponse(null, { ok: false, status: 404 });
  });
}

const MANIFEST = {
  version: '9.9.9',
  releaseUrl: 'https://github.com/Dhik0/ChesStars/releases/tag/v9.9.9',
  apkUrl: 'https://github.com/Dhik0/ChesStars/releases/download/v9.9.9/ChesStars-v9.9.9.apk',
  mirrorPrefixes: ['https://ghfast.top/', 'https://gh-proxy.com/'],
  qqGroupUrl: 'https://qm.qq.com/q/abcdef',
  notes: '- 新增国内加速下载\n- 修复若干问题',
};

describe('version.json 主通道', () => {
  it('优先走版本清单，拿到更新时带上下载入口', async () => {
    const fetchMock = routedFetch({ manifest: () => fakeResponse(MANIFEST) });
    vi.stubGlobal('fetch', fetchMock);

    const res = await checkForUpdate();

    expect(res.status).toBe('update');
    expect(res.via).toBe('manifest');
    expect(res.info?.version).toBe('9.9.9');
    expect(res.info?.apkUrl).toBe(MANIFEST.apkUrl);
    expect(res.info?.mirrorPrefixes).toEqual(MANIFEST.mirrorPrefixes);
    expect(res.info?.qqGroupUrl).toBe(MANIFEST.qqGroupUrl);
    // Markdown 列表符被清洗成「•」
    expect(res.info?.notes).toContain('• 新增国内加速下载');
    // 主通道命中后不该再打 Releases 接口（省限流额度）
    expect(fetchMock.mock.calls.map((c) => String(c[0])).some((u) => u.includes('/releases/'))).toBe(
      false,
    );
  });

  it('版本号不高于当前 → latest', async () => {
    vi.stubGlobal(
      'fetch',
      routedFetch({ manifest: () => fakeResponse({ ...MANIFEST, version: APP_VERSION }) }),
    );
    const res = await checkForUpdate();
    expect(res.status).toBe('latest');
    expect(res.via).toBe('manifest');
  });

  it('清单结构不合法（缺 apkUrl）→ 自动降级到 Releases 接口', async () => {
    const fetchMock = routedFetch({
      manifest: () => fakeResponse({ version: '9.9.9', notes: 'x' }),
      releases: () =>
        fakeResponse({
          tag_name: 'v9.9.9',
          html_url: 'https://github.com/Dhik0/ChesStars/releases/tag/v9.9.9',
          assets: [
            { name: 'ChesStars-v9.9.9.apk', browser_download_url: MANIFEST.apkUrl },
          ],
        }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const res = await checkForUpdate();

    expect(res.via).toBe('releases');
    expect(res.info?.apkUrl).toBe(MANIFEST.apkUrl);
    // 兜底通道也给默认镜像前缀
    expect(res.info?.mirrorPrefixes[0]).toBe('https://ghfast.top/');
  });

  it('两条通道都失败时，reason 里两段原因都在', async () => {
    vi.stubGlobal('fetch', routedFetch({}));
    const res = await checkForUpdate();
    expect(res.status).toBe('error');
    expect(res.reason).toContain('版本清单');
    expect(res.reason).toContain('Releases 接口');
  });

  it('version.json 的 version 允许带 v 前缀', () => {
    expect(parseVersionManifest({ ...MANIFEST, version: 'v9.9.9' }).version).toBe('9.9.9');
    expect(() => parseVersionManifest({ version: 'abc' })).toThrow();
    expect(() => parseVersionManifest({ version: '9.9.9' })).toThrow(/apkUrl/);
  });
});

describe('国内加速下载地址', () => {
  const apk = 'https://github.com/Dhik0/ChesStars/releases/download/v9.9.9/ChesStars-v9.9.9.apk';

  it('用第一个前缀拼接 APK 直链', () => {
    expect(mirrorDownloadUrl(['https://ghfast.top/', 'https://gh-proxy.com/'], apk)).toBe(
      `https://ghfast.top/${apk}`,
    );
  });

  it('前缀缺结尾斜杠时自动补上', () => {
    expect(mirrorDownloadUrl(['https://ghfast.top'], apk)).toBe(`https://ghfast.top/${apk}`);
  });

  it('前缀为空 / 无 APK 直链时退回原值', () => {
    expect(mirrorDownloadUrl([], apk)).toBe(apk);
    expect(mirrorDownloadUrl(['https://ghfast.top/'], null)).toBeNull();
  });
});

describe('仓库 version.json 与 package.json 保持一致', () => {
  it('版本号 / 发布页 / APK 直链三处对齐', () => {
    const manifest = JSON.parse(
      readFileSync(resolve(process.cwd(), 'version.json'), 'utf-8'),
    ) as Record<string, unknown>;

    expect(manifest.version).toBe(pkg.version);
    expect(manifest.releaseUrl).toBe(
      `https://github.com/Dhik0/ChesStars/releases/tag/v${pkg.version}`,
    );
    expect(manifest.apkUrl).toBe(
      `https://github.com/Dhik0/ChesStars/releases/download/v${pkg.version}/ChesStars-v${pkg.version}.apk`,
    );
    expect(Array.isArray(manifest.mirrorPrefixes)).toBe(true);
    expect(typeof manifest.qqGroupUrl).toBe('string');
  });
});
