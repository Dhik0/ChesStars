import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  BRANCH_CDN_URL,
  COMMIT_API_URL,
  fetchRepoJson,
  META_DOWNLOAD_TIMEOUT_MS,
  META_REPO_REF,
  MetaRemoteError,
  parseUpdatedAt,
  pinnedCdnUrl,
  RAW_URL,
  resolveLatestSha,
  shouldReplaceMeta,
  withCacheBust,
} from './metaRemote';

const SHA = '54efc4bfccd9e4e0e787ee466aa1e27a6b0215d1';

/** 最小 Response 替身：只提供 fetchOnce 用到的 ok / status / headers / json */
function res(
  body: unknown,
  init: { ok?: boolean; status?: number; lastModified?: string | null } = {},
): Response {
  return {
    ok: init.ok ?? true,
    status: init.status ?? 200,
    headers: {
      get: (key: string) =>
        key.toLowerCase() === 'last-modified' ? (init.lastModified ?? null) : null,
    },
    json: async () => body,
  } as unknown as Response;
}

/** 按 URL 分流的 fetch 替身 */
function routeFetch(handlers: {
  commit?: () => Response;
  sha?: () => Response;
  branch?: () => Response;
  raw?: () => Response;
}) {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.startsWith('https://api.github.com/')) {
      return handlers.commit ? handlers.commit() : res(null, { ok: false, status: 500 });
    }
    if (url.includes(`@${SHA}`)) {
      return handlers.sha ? handlers.sha() : res(null, { ok: false, status: 500 });
    }
    if (url.startsWith('https://cdn.jsdelivr.net/gh/')) {
      return handlers.branch ? handlers.branch() : res(null, { ok: false, status: 500 });
    }
    if (url.startsWith('https://raw.githubusercontent.com/')) {
      return handlers.raw ? handlers.raw() : res(null, { ok: false, status: 500 });
    }
    return res(null, { ok: false, status: 404 });
  });
}

const calledUrls = (fn: ReturnType<typeof vi.fn>) =>
  fn.mock.calls.map((c) => String(c[0] as string));

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('远程仓库地址常量', () => {
  // 仓库名前后各有一个短横线，写错任何一个都会 404 —— 这里钉死
  it('三段链路的 URL 与 Dhik0/-brawl-draft-core- 严格匹配', () => {
    expect(COMMIT_API_URL).toBe(
      'https://api.github.com/repos/Dhik0/-brawl-draft-core-/commits/main',
    );
    expect(BRANCH_CDN_URL).toBe(
      'https://cdn.jsdelivr.net/gh/Dhik0/-brawl-draft-core-@main/dist/brawl_meta.json',
    );
    expect(RAW_URL).toBe(
      'https://raw.githubusercontent.com/Dhik0/-brawl-draft-core-/main/dist/brawl_meta.json',
    );
    expect(pinnedCdnUrl(SHA)).toBe(
      `https://cdn.jsdelivr.net/gh/Dhik0/-brawl-draft-core-@${SHA}/dist/brawl_meta.json`,
    );
  });

  it('下载超时放宽到至少 15 秒（1.9MB 弱网）', () => {
    expect(META_DOWNLOAD_TIMEOUT_MS).toBeGreaterThanOrEqual(15000);
  });
});

describe('防缓存参数', () => {
  it('追加 t 时间戳，已有 query 时用 & 连接', () => {
    expect(withCacheBust('https://a.com/x.json', 123)).toBe('https://a.com/x.json?t=123');
    expect(withCacheBust('https://a.com/x.json?v=1', 123)).toBe('https://a.com/x.json?v=1&t=123');
  });
});

describe('三段式降级链路', () => {
  it('1) sha 可用时走 jsDelivr 精确版本，不再请求兜底', async () => {
    const fetchMock = routeFetch({
      commit: () => res({ sha: SHA }),
      sha: () => res({ updated_at: '2026-11-23T01:11:11Z' }, { lastModified: 'Mon, 23 Nov 2026 01:11:11 GMT' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const out = await fetchRepoJson<{ updated_at: string }>(META_REPO_REF, { cacheBust: 1 });

    expect(out.channel).toBe('cdn-sha');
    expect(out.url).toBe(pinnedCdnUrl(SHA));
    expect(out.lastModified).toBe('Mon, 23 Nov 2026 01:11:11 GMT');
    expect(out.failures).toEqual([]);
    // 只打了 2 次：取 sha + 取文件
    expect(fetchMock).toHaveBeenCalledTimes(2);
    // 每一段都带防缓存参数
    for (const url of calledUrls(fetchMock)) expect(url).toContain('t=1');
  });

  it('2) 提交接口失败（403 限流）时回退 jsDelivr @main', async () => {
    const fetchMock = routeFetch({
      commit: () => res(null, { ok: false, status: 403 }),
      branch: () => res({ ok: 1 }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const out = await fetchRepoJson(META_REPO_REF, { cacheBust: 2 });

    expect(out.channel).toBe('cdn-branch');
    expect(out.url).toBe(BRANCH_CDN_URL);
    expect(out.failures[0]).toContain('GitHub 提交接口');
    expect(out.failures[0]).toContain('403');
  });

  it('2) 拿到 sha 但精确版本下载失败时回退 @main', async () => {
    const fetchMock = routeFetch({
      commit: () => res({ sha: SHA }),
      sha: () => res(null, { ok: false, status: 503 }),
      branch: () => res({ ok: 1 }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const out = await fetchRepoJson(META_REPO_REF);

    expect(out.channel).toBe('cdn-branch');
    expect(out.failures[0]).toContain(`jsDelivr@${SHA.slice(0, 7)}`);
    expect(out.failures[0]).toContain('503');
  });

  it('3) 前两段都失败时最终走 GitHub Raw', async () => {
    const fetchMock = routeFetch({
      commit: () => res({ sha: SHA }),
      sha: () => res(null, { ok: false, status: 503 }),
      branch: () => res(null, { ok: false, status: 404 }),
      raw: () => res({ ok: 1 }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const out = await fetchRepoJson(META_REPO_REF);

    expect(out.channel).toBe('raw');
    expect(out.url).toBe(RAW_URL);
    expect(out.failures).toHaveLength(2);
  });

  it('3) 提交接口返回体没有 sha 时也要能降级', async () => {
    const fetchMock = routeFetch({
      commit: () => res({ message: 'no sha' }),
      branch: () => res({ ok: 1 }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const out = await fetchRepoJson(META_REPO_REF);
    expect(out.channel).toBe('cdn-branch');
    expect(out.failures[0]).toContain('缺少有效 sha');
  });

  it('全部失败时抛 MetaRemoteError，message 含三段原因', async () => {
    const fetchMock = routeFetch({
      commit: () => res(null, { ok: false, status: 403 }),
      branch: () => res(null, { ok: false, status: 404 }),
      raw: () => res(null, { ok: false, status: 500 }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const err = await fetchRepoJson(META_REPO_REF).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(MetaRemoteError);
    const failures = (err as MetaRemoteError).failures;
    expect(failures).toHaveLength(3);
    expect(failures[0]).toContain('GitHub 提交接口');
    expect(failures[1]).toContain('jsDelivr@main');
    expect(failures[2]).toContain('GitHub Raw');
    expect((err as MetaRemoteError).message).toContain('｜');
  });

  it('resolveLatestSha 单独调用失败时返回 null 并记录原因', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(res(null, { ok: false, status: 403 })),
    );
    const failures: string[] = [];
    await expect(resolveLatestSha(failures)).resolves.toBeNull();
    expect(failures[0]).toContain('403');
  });
});

describe('updated_at 增量判断', () => {
  const meta = (updated_at: string) => ({ updated_at });

  it('远程更新 → 覆盖', () => {
    expect(
      shouldReplaceMeta(meta('2026-11-23T01:11:11Z'), meta('2026-11-22T14:23:19Z'), {
        hasCache: true,
      }),
    ).toBe(true);
  });

  it('远程更旧 → 不覆盖（避免回滚成旧数据）', () => {
    expect(
      shouldReplaceMeta(meta('2026-11-22T14:23:19Z'), meta('2026-11-23T01:11:11Z'), {
        hasCache: true,
      }),
    ).toBe(false);
  });

  it('时间相同：有缓存不覆盖，无缓存（仅内置数据）才落盘', () => {
    const t = '2026-11-23T01:11:11Z';
    expect(shouldReplaceMeta(meta(t), meta(t), { hasCache: true })).toBe(false);
    expect(shouldReplaceMeta(meta(t), meta(t), { hasCache: false })).toBe(true);
  });

  it('远程时间戳不可解析 → 拒绝脏数据；本地不可解析 → 直接覆盖', () => {
    expect(shouldReplaceMeta(meta('not-a-date'), meta('2026-11-23T01:11:11Z'), { hasCache: true })).toBe(
      false,
    );
    expect(shouldReplaceMeta(meta('2026-11-23T01:11:11Z'), meta(''), { hasCache: true })).toBe(true);
  });

  it('兼容后端 6 位微秒的时间戳', () => {
    const micro = '2026-11-23T01:11:11.656144Z';
    expect(Number.isNaN(parseUpdatedAt(micro))).toBe(false);
    expect(parseUpdatedAt(micro)).toBe(parseUpdatedAt('2026-11-23T01:11:11.656Z'));
    expect(
      shouldReplaceMeta(meta(micro), meta('2026-11-23T01:11:11Z'), { hasCache: true }),
    ).toBe(true);
  });
});
