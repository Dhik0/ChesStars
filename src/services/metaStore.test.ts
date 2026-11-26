import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  builtinMetaUrl,
  BUILTIN_TIMEOUT_MS,
  MetaLoadError,
  MetaStore,
  type PullResult,
} from './metaStore';
import type { MetaCacheAdapter, MetaCacheHit } from './metaCache';
import { makeTestMeta } from './__testkit__/metaFixture';
import { pullMessage } from '../i18n/format';
import { translate } from '../i18n/translate';

const SHA = '54efc4bfccd9e4e0e787ee466aa1e27a6b0215d1';

/** 默认语言（简体中文）下的提示文案：服务层只回结构化结果，文案由这里组装 */
const msg = (result: PullResult): string =>
  pullMessage(
    result,
    (key, params) => translate('zh-CN', key, params),
    (n) => n.toLocaleString('zh-CN'),
  );

function res(
  body: unknown,
  init: { ok?: boolean; status?: number; age?: number } = {},
): Response {
  return {
    ok: init.ok ?? true,
    status: init.status ?? 200,
    headers: {
      get: (key: string) =>
        key.toLowerCase() === 'age' && init.age !== undefined ? String(init.age) : null,
    },
    json: async () => body,
  } as unknown as Response;
}

/** 三段式链路的 fetch 替身：提交接口给 sha，精确版本地址给数据 */
function routeFetch(meta: unknown) {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.startsWith('https://api.github.com/')) return res({ sha: SHA });
    if (url.includes(`@${SHA}`)) return res(meta);
    return res(null, { ok: false, status: 500 });
  });
}

/** 内置数据兜底：任何指向 data/brawl_meta.json 的请求都返回它 */
function routeBuiltin(meta: unknown) {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes('data/brawl_meta.json')) return res(meta);
    return res(null, { ok: false, status: 500 });
  });
}

function fakeCache(hit: MetaCacheHit | null, writeOk = true) {
  const adapter = {
    read: vi.fn(async () => hit),
    write: vi.fn(async () => writeOk),
  };
  return adapter satisfies MetaCacheAdapter;
}

/**
 * 用缓存完成启动，并让启动时的静默检查先失败收场。
 * 这样后续 `pullNow` 的行为不会被后台那次请求抢先改变。
 */
async function initOffline(cache: MetaCacheAdapter): Promise<MetaStore> {
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
  const store = new MetaStore(cache);
  await store.init();
  await new Promise((r) => setTimeout(r, 5));
  return store;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('MetaStore 缓存读写', () => {
  it('启动时优先用缓存，source = cache', async () => {
    const cached = makeTestMeta();
    const cache = fakeCache({ meta: cached, origin: 'indexeddb' });
    // 静默检查失败即可，本用例只关心首屏
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));

    const snap = await new MetaStore(cache).init();

    expect(snap.source).toBe('cache');
    expect(snap.updatedAt).toBe(cached.updated_at);
    expect(cache.read).toHaveBeenCalledTimes(1);
  });

  it('没有缓存时退回内置数据', async () => {
    const builtin = makeTestMeta({ updated_at: '2026-11-18T00:00:00Z' });
    const cache = fakeCache(null);
    vi.stubGlobal('fetch', routeBuiltin(builtin));

    const snap = await new MetaStore(cache).init();

    expect(snap.source).toBe('builtin');
    expect(builtinMetaUrl()).toContain('data/brawl_meta.json');
  });

  it('静默检查拿到更新后写入 IndexedDB 并切到 remote', async () => {
    const cached = makeTestMeta({ updated_at: '2026-11-20T00:00:00Z' });
    const remote = makeTestMeta({ updated_at: '2026-11-23T00:00:00Z' });
    const cache = fakeCache({ meta: cached, origin: 'indexeddb' });
    vi.stubGlobal('fetch', routeFetch(remote));

    const store = new MetaStore(cache);
    await store.init();
    await new Promise((r) => setTimeout(r, 20));

    expect(cache.write).toHaveBeenCalledTimes(1);
    expect(store.getSnapshot()?.source).toBe('remote');
    expect(store.getSnapshot()?.updatedAt).toBe(remote.updated_at);
  });

  it('远程更旧时不覆盖本地缓存', async () => {
    const cached = makeTestMeta({ updated_at: '2026-11-23T00:00:00Z' });
    const older = makeTestMeta({ updated_at: '2026-11-01T00:00:00Z' });
    const cache = fakeCache({ meta: cached, origin: 'indexeddb' });
    vi.stubGlobal('fetch', routeFetch(older));

    const store = new MetaStore(cache);
    await store.init();
    await new Promise((r) => setTimeout(r, 20));

    expect(cache.write).not.toHaveBeenCalled();
    expect(store.getSnapshot()?.source).toBe('cache');
  });
});

describe('MetaStore.pullNow', () => {
  it('拉到新数据：写缓存并返回「已更新」', async () => {
    const cached = makeTestMeta({ updated_at: '2026-11-20T00:00:00Z' });
    const remote = makeTestMeta({ updated_at: '2026-11-23T00:00:00Z', total_battles: 1234 });
    const cache = fakeCache({ meta: cached, origin: 'indexeddb' });
    const store = await initOffline(cache);
    vi.stubGlobal('fetch', routeFetch(remote));

    const result = await store.pullNow();

    expect(result.ok).toBe(true);
    expect(result.updated).toBe(true);
    expect(cache.write).toHaveBeenCalledWith(remote);
    expect(result.code).toBe('updated');
    expect(msg(result)).toContain('已更新至 2026-11-23');
    expect(msg(result)).toContain('1,234 场对局');
    // 写盘成功时不能出现降级提示
    expect(msg(result)).not.toContain('仅本次启动内有效');
  });

  it('IndexedDB 写入失败时降级为内存生效并给出提示', async () => {
    const cached = makeTestMeta({ updated_at: '2026-11-20T00:00:00Z' });
    const remote = makeTestMeta({ updated_at: '2026-11-23T00:00:00Z' });
    const cache = fakeCache({ meta: cached, origin: 'indexeddb' }, false);
    const store = await initOffline(cache);
    vi.stubGlobal('fetch', routeFetch(remote));

    const result = await store.pullNow();

    expect(result.updated).toBe(true);
    // 本次会话仍然用新数据
    expect(store.getSnapshot()?.updatedAt).toBe(remote.updated_at);
    expect(msg(result)).toContain('（本地存储空间不足，仅本次启动内有效）');
  });

  it('远程没有更新时返回「已是最新」', async () => {
    const cached = makeTestMeta();
    const cache = fakeCache({ meta: cached, origin: 'indexeddb' });
    vi.stubGlobal('fetch', routeFetch(cached));

    const store = new MetaStore(cache);
    await store.init();
    const result = await store.pullNow();

    expect(result.updated).toBe(false);
    expect(msg(result)).toContain('当前已是最新数据');
  });

  it('拉取失败时提示检查网络', async () => {
    const cached = makeTestMeta();
    const cache = fakeCache({ meta: cached, origin: 'indexeddb' });
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));

    const store = new MetaStore(cache);
    await store.init();
    const result = await store.pullNow();

    expect(result.ok).toBe(false);
    expect(msg(result)).toBe('拉取失败：数据源不可用，请稍后再试');
  });

  it('时间戳相同且已落盘后，不再重复覆盖', async () => {
    const cached = makeTestMeta();
    const cache = fakeCache({ meta: cached, origin: 'indexeddb' });
    vi.stubGlobal('fetch', routeFetch(cached));

    const store = new MetaStore(cache);
    await store.init();
    await store.pullNow();
    const second = await store.pullNow();

    expect(second.updated).toBe(false);
    expect(cache.write).not.toHaveBeenCalled();
  });
});

describe('首屏加载失败的原因分类', () => {
  /** 取 init 抛出的错误对象 */
  const initError = async (store: MetaStore): Promise<unknown> =>
    store.init().catch((e: unknown) => e);

  it('内置文件返回 404 → http，并带上状态码', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => res(null, { ok: false, status: 404 })));
    const err = await initError(new MetaStore(fakeCache(null)));

    expect(err).toBeInstanceOf(MetaLoadError);
    expect((err as MetaLoadError).kind).toBe('http');
    expect((err as MetaLoadError).status).toBe(404);
  });

  it('断网（fetch 抛 TypeError）→ offline', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    const err = await initError(new MetaStore(fakeCache(null)));

    expect((err as MetaLoadError).kind).toBe('offline');
  });

  it('超过内置超时 → timeout，且只请求一次（不重复下 8MB）', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn(
      (_url: RequestInfo | URL, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            const err = new Error('aborted');
            err.name = 'AbortError';
            reject(err);
          });
        }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const store = new MetaStore(fakeCache(null));
    const pending = initError(store);
    await vi.advanceTimersByTimeAsync(BUILTIN_TIMEOUT_MS + 10);
    const err = await pending;
    vi.useRealTimers();

    expect((err as MetaLoadError).kind).toBe('timeout');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('失败后可以重试：第二次 init 会重新发起请求', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(res(null, { ok: false, status: 500 }))
      .mockResolvedValueOnce(res(makeTestMeta()));
    vi.stubGlobal('fetch', fetchMock);

    const store = new MetaStore(fakeCache(null));
    await expect(store.init()).rejects.toBeInstanceOf(MetaLoadError);
    const snap = await store.init();

    expect(snap.source).toBe('builtin');
    // 只数内置文件的请求：成功后的静默检查打的是远端仓库，不算在内
    const builtinCalls = fetchMock.mock.calls.filter((c) =>
      String(c[0]).includes('data/brawl_meta.json'),
    );
    expect(builtinCalls).toHaveLength(2);
  });
});

/* ------------------------------------------------------------------ */
/* 拿到的到底是最新数据，还是 CDN 的旧副本（Web 与原生同一套顺序）        */
/* ------------------------------------------------------------------ */

/** 按 URL 分流的 fetch 替身：模拟「提交接口被限流 + Raw / 反代不可用」 */
function freshFirstFetch(handlers: {
  raw?: () => Response;
  mirror?: () => Response;
  branch?: () => Response;
  commit?: () => Response;
}) {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.startsWith('https://api.github.com/')) {
      return handlers.commit ? handlers.commit() : res(null, { ok: false, status: 403 });
    }
    if (url.includes('ghfast.top')) {
      return handlers.mirror ? handlers.mirror() : res(null, { ok: false, status: 500 });
    }
    if (url.startsWith('https://raw.githubusercontent.com/')) {
      return handlers.raw ? handlers.raw() : res(null, { ok: false, status: 500 });
    }
    if (url.includes('cdn.jsdelivr.net')) {
      return handlers.branch ? handlers.branch() : res(null, { ok: false, status: 500 });
    }
    return res(null, { ok: false, status: 404 });
  });
}

describe('远端数据的新鲜度判定', () => {
  it('Raw 拿到新数据时直接更新（不再落到分支缓存）', async () => {
    const cached = makeTestMeta({ updated_at: '2026-11-25T10:07:43Z', total_battles: 1738719 });
    const fresh = makeTestMeta({ updated_at: '2026-11-26T06:06:50Z', total_battles: 2266003 });
    const cache = fakeCache({ meta: cached, origin: 'indexeddb' });
    // 先用缓存启动、让启动时的静默检查失败，保证下面的对比基准仍是本地缓存
    const store = await initOffline(cache);
    const fetchMock = freshFirstFetch({ raw: () => res(fresh) });
    vi.stubGlobal('fetch', fetchMock);

    const result = await store.pullNow();

    expect(result.code).toBe('updated');
    expect(msg(result)).toContain('2,266,003');
    // 分支地址一次都不该被请求：它可能就是那份旧缓存
    expect(fetchMock.mock.calls.map((c) => String(c[0])).some((u) => u.includes('cdn.jsdelivr'))).toBe(
      false,
    );
  });

  it('只拿到 jsDelivr 分支缓存副本时，报「缓存副本」而不是「已是最新」', async () => {
    const cached = makeTestMeta({ updated_at: '2026-11-26T06:06:50Z', total_battles: 2266003 });
    // 边缘节点上那份：6 小时前缓存，场次还停留在 173 万
    const staleCopy = makeTestMeta({ updated_at: '2026-11-25T10:07:43Z', total_battles: 1738719 });
    const cache = fakeCache({ meta: cached, origin: 'indexeddb' });
    vi.stubGlobal(
      'fetch',
      freshFirstFetch({ branch: () => res(staleCopy, { age: 24603 }) }),
    );

    const store = new MetaStore(cache);
    await store.init();
    const result = await store.pullNow();

    expect(result.code).toBe('stale');
    expect(result.ok).toBe(false);
    expect(result.staleHours).toBeGreaterThanOrEqual(6);
    expect(msg(result)).toContain('缓存副本');
    expect(msg(result)).not.toContain('已是最新');
    // 旧副本不能覆盖本地更新的数据
    expect(cache.write).not.toHaveBeenCalled();
  });

  it('分支缓存刚回源（Age 很小）时，才算真的「已是最新」', async () => {
    const cached = makeTestMeta();
    const cache = fakeCache({ meta: cached, origin: 'indexeddb' });
    vi.stubGlobal('fetch', freshFirstFetch({ branch: () => res(cached, { age: 3 }) }));

    const store = new MetaStore(cache);
    await store.init();
    const result = await store.pullNow();

    expect(result.code).toBe('latest');
    expect(result.ok).toBe(true);
  });

  it('全部源都失败时给出具体原因（403 → 被限流），绝不报「已是最新」', async () => {
    const cached = makeTestMeta();
    const cache = fakeCache({ meta: cached, origin: 'indexeddb' });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => res(null, { ok: false, status: 403 })),
    );

    const store = new MetaStore(cache);
    await store.init();
    const result = await store.pullNow();

    expect(result.code).toBe('failed');
    expect(result.reason).toBe('blocked');
    expect(msg(result)).toContain('拒绝访问');
    expect(msg(result)).not.toContain('已是最新');
  });

  it('全部源都连不上时，原因是「断网」', async () => {
    const cached = makeTestMeta();
    const cache = fakeCache({ meta: cached, origin: 'indexeddb' });
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));

    const store = new MetaStore(cache);
    await store.init();
    const result = await store.pullNow();

    expect(result.code).toBe('failed');
    expect(result.reason).toBe('offline');
    expect(msg(result)).toContain('网络已断开');
  });
});
