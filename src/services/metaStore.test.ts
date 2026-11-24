import { afterEach, describe, expect, it, vi } from 'vitest';
import { builtinMetaUrl, MetaStore } from './metaStore';
import type { MetaCacheAdapter, MetaCacheHit } from './metaCache';
import { makeTestMeta } from './__testkit__/metaFixture';

const SHA = '54efc4bfccd9e4e0e787ee466aa1e27a6b0215d1';

function res(body: unknown, init: { ok?: boolean; status?: number } = {}): Response {
  return {
    ok: init.ok ?? true,
    status: init.status ?? 200,
    headers: { get: () => null },
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
    expect(result.message).toContain('已更新至 2026-11-23');
    expect(result.message).toContain('1,234 场对局');
    // 写盘成功时不能出现降级提示
    expect(result.message).not.toContain('仅本次启动内有效');
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
    expect(result.message).toContain('（本地存储空间不足，仅本次启动内有效）');
  });

  it('远程没有更新时返回「已是最新」', async () => {
    const cached = makeTestMeta();
    const cache = fakeCache({ meta: cached, origin: 'indexeddb' });
    vi.stubGlobal('fetch', routeFetch(cached));

    const store = new MetaStore(cache);
    await store.init();
    const result = await store.pullNow();

    expect(result.updated).toBe(false);
    expect(result.message).toContain('当前已是最新数据');
  });

  it('拉取失败时提示检查网络', async () => {
    const cached = makeTestMeta();
    const cache = fakeCache({ meta: cached, origin: 'indexeddb' });
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));

    const store = new MetaStore(cache);
    await store.init();
    const result = await store.pullNow();

    expect(result.ok).toBe(false);
    expect(result.message).toBe('拉取失败，请检查网络后重试');
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
