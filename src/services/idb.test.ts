import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  IdbUnavailableError,
  idbDelete,
  idbGet,
  idbSet,
  isIdbSupported,
  openDb,
  resetIdbConnectionsForTest,
  type IdbStoreConfig,
} from './idb';
import { installFakeIndexedDb } from './__testkit__/fakeIndexedDb';

const CFG: IdbStoreConfig = { dbName: 'test-db', storeName: 'test-store', version: 1 };

beforeEach(() => {
  resetIdbConnectionsForTest();
});

afterEach(() => {
  vi.unstubAllGlobals();
  resetIdbConnectionsForTest();
});

describe('IndexedDB 封装', () => {
  it('写入后能原样读回（结构化克隆）', async () => {
    vi.stubGlobal('indexedDB', installFakeIndexedDb().factory);

    await idbSet(CFG, 'k', { meta: { a: 1 }, list: [1, 2, 3] });
    await expect(idbGet(CFG, 'k')).resolves.toEqual({ meta: { a: 1 }, list: [1, 2, 3] });
  });

  it('读取不存在的键返回 null', async () => {
    vi.stubGlobal('indexedDB', installFakeIndexedDb().factory);
    await expect(idbGet(CFG, 'missing')).resolves.toBeNull();
  });

  it('删除后读不到', async () => {
    vi.stubGlobal('indexedDB', installFakeIndexedDb().factory);

    await idbSet(CFG, 'k', 'v');
    await idbDelete(CFG, 'k');
    await expect(idbGet(CFG, 'k')).resolves.toBeNull();
  });

  it('同一配置只打开一次连接', async () => {
    const fake = installFakeIndexedDb();
    vi.stubGlobal('indexedDB', fake.factory);

    await openDb(CFG);
    await idbSet(CFG, 'k', 1);
    await idbGet(CFG, 'k');

    expect(fake.state.openCount).toBe(1);
  });

  it('写入失败（配额不足）时 reject，交给调用方降级', async () => {
    const quota = new Error('QuotaExceededError');
    vi.stubGlobal('indexedDB', installFakeIndexedDb({ writeError: quota }).factory);

    await expect(idbSet(CFG, 'k', { big: true })).rejects.toThrow('QuotaExceededError');
  });

  it('环境没有 indexedDB 时抛 IdbUnavailableError', async () => {
    vi.stubGlobal('indexedDB', undefined);

    expect(isIdbSupported()).toBe(false);
    await expect(idbGet(CFG, 'k')).rejects.toBeInstanceOf(IdbUnavailableError);
    await expect(idbSet(CFG, 'k', 1)).rejects.toBeInstanceOf(IdbUnavailableError);
  });

  it('不可克隆的值写入失败，不会污染已有数据', async () => {
    vi.stubGlobal('indexedDB', installFakeIndexedDb().factory);

    await idbSet(CFG, 'k', 'ok');
    await expect(idbSet(CFG, 'k', { fn: () => 1 })).rejects.toBeTruthy();
    await expect(idbGet(CFG, 'k')).resolves.toBe('ok');
  });
});
