import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  LEGACY_LS_META_KEY,
  META_CACHE_KEY,
  META_DB,
  readLegacyMeta,
  readMetaCache,
  writeMetaCache,
} from './metaCache';
import { resetIdbConnectionsForTest } from './idb';
import { installFakeIndexedDb } from './__testkit__/fakeIndexedDb';
import { makeTestMeta } from './__testkit__/metaFixture';

/** node 环境没有 localStorage，给一个内存实现 */
function stubLocalStorage() {
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

let ls: Map<string, string>;

beforeEach(() => {
  resetIdbConnectionsForTest();
  ls = stubLocalStorage();
});

afterEach(() => {
  vi.unstubAllGlobals();
  resetIdbConnectionsForTest();
});

/** 直接翻 IndexedDB 里的原始记录，验证版本/时间戳确实落盘了 */
function storedRecord(fake: ReturnType<typeof installFakeIndexedDb>): unknown {
  return fake.databases.get(META_DB.dbName)?.stores.get(META_DB.storeName)?.get(META_CACHE_KEY);
}

describe('meta 缓存（IndexedDB）', () => {
  it('写入后能读回，并带上版本与时间戳', async () => {
    const fake = installFakeIndexedDb();
    vi.stubGlobal('indexedDB', fake.factory);

    const meta = makeTestMeta();
    await expect(writeMetaCache(meta)).resolves.toBe(true);

    const record = storedRecord(fake) as {
      schemaVersion: number;
      updatedAt: string;
      savedAt: number;
    };
    expect(record.schemaVersion).toBe(5);
    expect(record.updatedAt).toBe(meta.updated_at);
    expect(typeof record.savedAt).toBe('number');

    const hit = await readMetaCache();
    expect(hit?.origin).toBe('indexeddb');
    expect(hit?.meta.updated_at).toBe(meta.updated_at);
    expect(hit?.meta.total_battles).toBe(meta.total_battles);
  });

  it('缓存为空时返回 null', async () => {
    vi.stubGlobal('indexedDB', installFakeIndexedDb().factory);
    await expect(readMetaCache()).resolves.toBeNull();
  });

  it('旧 localStorage 缓存迁移到 IndexedDB 后删除旧键', async () => {
    const fake = installFakeIndexedDb();
    vi.stubGlobal('indexedDB', fake.factory);

    const legacy = makeTestMeta({ updated_at: '2026-11-20T00:00:00Z' });
    ls.set(LEGACY_LS_META_KEY, JSON.stringify(legacy));

    const hit = await readMetaCache();
    expect(hit?.origin).toBe('legacy');
    expect(hit?.meta.updated_at).toBe('2026-11-20T00:00:00Z');

    // 迁移完成后：IndexedDB 有数据，旧键被清掉
    expect(storedRecord(fake)).toBeTruthy();
    expect(ls.has(LEGACY_LS_META_KEY)).toBe(false);
  });

  it('IndexedDB 不可用时仍能用旧缓存，且不删旧键', async () => {
    vi.stubGlobal('indexedDB', undefined);

    const legacy = makeTestMeta();
    ls.set(LEGACY_LS_META_KEY, JSON.stringify(legacy));

    const hit = await readMetaCache();
    expect(hit?.origin).toBe('legacy');
    expect(hit?.meta.updated_at).toBe(legacy.updated_at);
    // 没能迁移，旧键必须留着，否则数据就丢了
    expect(ls.has(LEGACY_LS_META_KEY)).toBe(true);
  });

  it('旧缓存损坏时当作没有缓存', async () => {
    vi.stubGlobal('indexedDB', installFakeIndexedDb().factory);
    ls.set(LEGACY_LS_META_KEY, '{"schema_version":5}');

    await expect(readMetaCache()).resolves.toBeNull();
    expect(readLegacyMeta()).toBeNull();
  });

  it('IndexedDB 写入失败时返回 false，旧键保留', async () => {
    const quota = new Error('QuotaExceededError');
    vi.stubGlobal('indexedDB', installFakeIndexedDb({ writeError: quota }).factory);

    const legacy = makeTestMeta();
    ls.set(LEGACY_LS_META_KEY, JSON.stringify(legacy));

    await expect(writeMetaCache(makeTestMeta())).resolves.toBe(false);
    // 写不进去也不能把旧键删掉
    expect(ls.has(LEGACY_LS_META_KEY)).toBe(true);
  });

  it('写入成功后清理残留的旧键', async () => {
    vi.stubGlobal('indexedDB', installFakeIndexedDb().factory);
    ls.set(LEGACY_LS_META_KEY, JSON.stringify(makeTestMeta()));

    await expect(writeMetaCache(makeTestMeta())).resolves.toBe(true);
    expect(ls.has(LEGACY_LS_META_KEY)).toBe(false);
  });

  it('IndexedDB 里的记录损坏时退回旧缓存', async () => {
    const fake = installFakeIndexedDb();
    vi.stubGlobal('indexedDB', fake.factory);

    fake.databases.set(META_DB.dbName, {
      version: 1,
      stores: new Map([[META_DB.storeName, new Map([[META_CACHE_KEY, { meta: 'garbage' }]])]]),
    });
    const legacy = makeTestMeta({ updated_at: '2026-11-19T00:00:00Z' });
    ls.set(LEGACY_LS_META_KEY, JSON.stringify(legacy));

    const hit = await readMetaCache();
    expect(hit?.origin).toBe('legacy');
    expect(hit?.meta.updated_at).toBe('2026-11-19T00:00:00Z');
  });
});
