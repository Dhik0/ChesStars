/**
 * 极简 IndexedDB 封装（原生 API，零依赖）。
 *
 * 只覆盖本项目需要的四个动作：开库、读、写、删。
 * 键值都是外部键（out-of-line key），一个库一个 store，够用就好。
 *
 * 失败语义刻意保持「可判断」：
 *   - 环境不支持 / 打开超时 / 打开被拒 → 抛 `IdbUnavailableError`；
 *   - 写入触发配额上限（磁盘满、隐私模式限额）→ 抛原生的 QuotaExceededError。
 * 调用方据此决定「还能不能持久化」，而不是在这里吞掉错误。
 */

export interface IdbStoreConfig {
  dbName: string;
  storeName: string;
  /** schema 版本，新增 store 时才需要 +1 */
  version?: number;
}

/** 打开超时：开库被别的标签页 block 住时不至于把启动流程一起拖死 */
export const IDB_OPEN_TIMEOUT_MS = 3000;

/** IndexedDB 不可用（无实现 / 打开失败 / 超时） */
export class IdbUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'IdbUnavailableError';
  }
}

/** 当前环境是否提供 IndexedDB（SSR、极老 WebView 没有） */
export function isIdbSupported(): boolean {
  try {
    return typeof indexedDB !== 'undefined' && indexedDB !== null;
  } catch {
    return false;
  }
}

function toError(err: unknown, fallback: string): Error {
  if (err instanceof Error) return err;
  return new IdbUnavailableError(fallback);
}

function requestResult<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(toError(req.error, 'IndexedDB 请求失败'));
  });
}

/** 已打开的连接按「库名 + store」缓存，避免每次读写都重新 open */
const openConnections = new Map<string, Promise<IDBDatabase>>();

/**
 * 打开（必要时创建）数据库。
 *
 * 同一个配置只 open 一次；失败会把缓存清掉，让下次调用可以重试
 * （例如用户刚清完磁盘空间）。
 */
export function openDb(
  config: IdbStoreConfig,
  timeoutMs: number = IDB_OPEN_TIMEOUT_MS,
): Promise<IDBDatabase> {
  const cacheKey = `${config.dbName}::${config.storeName}`;
  const cached = openConnections.get(cacheKey);
  if (cached) return cached;

  const opening = new Promise<IDBDatabase>((resolve, reject) => {
    if (!isIdbSupported()) {
      reject(new IdbUnavailableError('当前环境不支持 IndexedDB'));
      return;
    }

    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new IdbUnavailableError('IndexedDB 打开超时'));
    }, timeoutMs);

    const fail = (err: unknown): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(toError(err, 'IndexedDB 打开失败'));
    };

    let req: IDBOpenDBRequest;
    try {
      req = indexedDB.open(config.dbName, config.version ?? 1);
    } catch (err) {
      fail(err);
      return;
    }

    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(config.storeName)) {
        db.createObjectStore(config.storeName);
      }
    };

    req.onsuccess = () => {
      const db = req.result;
      if (settled) {
        // 超时后连接才回来：直接关掉，避免泄漏
        db.close();
        return;
      }
      settled = true;
      clearTimeout(timer);
      // 别的标签页要升级 schema 时主动让路
      db.onversionchange = () => db.close();
      resolve(db);
    };

    req.onerror = () => fail(req.error);
    // onblocked 只说明有旧连接挡着，不主动失败；等超时兜底
    req.onblocked = () => undefined;
  });

  openConnections.set(cacheKey, opening);
  void opening.catch(() => openConnections.delete(cacheKey));
  return opening;
}

/** 读取一个键；不存在返回 null */
export async function idbGet<T>(config: IdbStoreConfig, key: IDBValidKey): Promise<T | null> {
  const db = await openDb(config);
  const tx = db.transaction(config.storeName, 'readonly');
  const value = await requestResult<T | undefined>(tx.objectStore(config.storeName).get(key));
  return value === undefined ? null : value;
}

/**
 * 写入一个键。
 *
 * 用事务的 `complete` 而不是请求的 `success` 来判定成功：
 * 配额不足时请求可能先 success、事务随后 abort，只有 complete 才算真正落盘。
 */
export async function idbSet(
  config: IdbStoreConfig,
  key: IDBValidKey,
  value: unknown,
): Promise<void> {
  const db = await openDb(config);
  await new Promise<void>((resolve, reject) => {
    let tx: IDBTransaction;
    try {
      tx = db.transaction(config.storeName, 'readwrite');
    } catch (err) {
      reject(toError(err, 'IndexedDB 事务创建失败'));
      return;
    }

    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(toError(tx.error, 'IndexedDB 写入失败'));
    tx.onabort = () => reject(toError(tx.error, 'IndexedDB 写入中止'));

    try {
      tx.objectStore(config.storeName).put(value, key);
    } catch (err) {
      try {
        tx.abort();
      } catch {
        /* 已经结束的事务 abort 会抛，忽略 */
      }
      reject(toError(err, 'IndexedDB 写入失败'));
    }
  });
}

/** 删除一个键（不存在也算成功） */
export async function idbDelete(config: IdbStoreConfig, key: IDBValidKey): Promise<void> {
  const db = await openDb(config);
  await new Promise<void>((resolve, reject) => {
    let tx: IDBTransaction;
    try {
      tx = db.transaction(config.storeName, 'readwrite');
    } catch (err) {
      reject(toError(err, 'IndexedDB 事务创建失败'));
      return;
    }

    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(toError(tx.error, 'IndexedDB 删除失败'));
    tx.onabort = () => reject(toError(tx.error, 'IndexedDB 删除中止'));

    try {
      tx.objectStore(config.storeName).delete(key);
    } catch (err) {
      try {
        tx.abort();
      } catch {
        /* 同上 */
      }
      reject(toError(err, 'IndexedDB 删除失败'));
    }
  });
}

/** 仅供测试：清掉连接缓存，避免用例之间互相影响 */
export function resetIdbConnectionsForTest(): void {
  openConnections.clear();
}
