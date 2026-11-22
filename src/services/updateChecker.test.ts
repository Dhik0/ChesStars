import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import pkg from '../../package.json';
import { APP_VERSION } from '../config/app';
import { checkForUpdate, ignoreVersion, isVersionIgnored } from './updateChecker';

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
