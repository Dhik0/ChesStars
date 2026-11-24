/**
 * 测试用的最小 IndexedDB 替身。
 *
 * node 环境没有 IndexedDB，又不想为了跑单元测试引入额外依赖，
 * 所以这里只实现本项目实际用到的子集：open / onupgradeneeded /
 * transaction / objectStore.get|put|delete / 事务 complete|abort。
 *
 * 行为对齐真实实现的关键两点：
 *   1. 写入按 structuredClone 克隆（存不了函数等不可克隆值）；
 *   2. 事务的 complete 在操作之后异步触发，写入失败走 abort。
 */

type Handler = ((ev: unknown) => void) | null;

class FakeRequest {
  result: unknown = undefined;
  error: unknown = null;
  onsuccess: Handler = null;
  onerror: Handler = null;
  onupgradeneeded: Handler = null;
  onblocked: Handler = null;
}

interface FakeDatabase {
  version: number;
  stores: Map<string, Map<unknown, unknown>>;
}

export interface FakeIdbState {
  /** 非空时所有写操作都以该错误 abort（模拟配额不足） */
  writeError: Error | null;
  /** 记录 open 次数，用于断言「连接被复用」 */
  openCount: number;
}

function makeTransaction(
  store: Map<unknown, unknown>,
  state: FakeIdbState,
): Record<string, unknown> {
  let ops = 0;
  let done = 0;

  const tx: Record<string, unknown> & {
    error: unknown;
    oncomplete: Handler;
    onerror: Handler;
    onabort: Handler;
  } = { error: null, oncomplete: null, onerror: null, onabort: null };

  const schedule = (fn: () => void): void => {
    ops += 1;
    queueMicrotask(() => {
      fn();
      done += 1;
      if (done === ops) queueMicrotask(() => tx.oncomplete?.({}));
    });
  };

  const fail = (req: FakeRequest, err: unknown): void => {
    tx.error = err;
    req.error = err;
    req.onerror?.({});
    tx.onabort?.({});
  };

  tx.objectStore = () => ({
    get(key: unknown) {
      const req = new FakeRequest();
      schedule(() => {
        req.result = store.get(key);
        req.onsuccess?.({});
      });
      return req;
    },
    put(value: unknown, key: unknown) {
      const req = new FakeRequest();
      schedule(() => {
        if (state.writeError) {
          fail(req, state.writeError);
          return;
        }
        try {
          store.set(key, structuredClone(value));
        } catch (err) {
          fail(req, err);
          return;
        }
        req.result = key;
        req.onsuccess?.({});
      });
      return req;
    },
    delete(key: unknown) {
      const req = new FakeRequest();
      schedule(() => {
        if (state.writeError) {
          fail(req, state.writeError);
          return;
        }
        store.delete(key);
        req.result = undefined;
        req.onsuccess?.({});
      });
      return req;
    },
  });

  return tx;
}

/**
 * 安装一个内存版 indexedDB。
 * 调用方负责 `vi.stubGlobal('indexedDB', factory)`。
 */
export function installFakeIndexedDb(options: { writeError?: Error | null } = {}): {
  factory: unknown;
  state: FakeIdbState;
  databases: Map<string, FakeDatabase>;
} {
  const databases = new Map<string, FakeDatabase>();
  const state: FakeIdbState = { writeError: options.writeError ?? null, openCount: 0 };

  const factory = {
    open(name: string, version = 1) {
      state.openCount += 1;
      const req = new FakeRequest();
      queueMicrotask(() => {
        let db = databases.get(name);
        const created = !db;
        if (!db) {
          db = { version, stores: new Map() };
          databases.set(name, db);
        }

        const current = db;
        const conn = {
          name,
          objectStoreNames: {
            contains: (storeName: string) => current.stores.has(storeName),
          },
          createObjectStore: (storeName: string) => {
            if (!current.stores.has(storeName)) current.stores.set(storeName, new Map());
            return {};
          },
          transaction: (storeName: string) => {
            const store = current.stores.get(storeName);
            if (!store) throw new Error(`store 不存在: ${storeName}`);
            return makeTransaction(store, state);
          },
          close: () => undefined,
          onversionchange: null,
        };

        req.result = conn;
        if (created) req.onupgradeneeded?.({});
        req.onsuccess?.({});
      });
      return req;
    },
  };

  return { factory, state, databases };
}
