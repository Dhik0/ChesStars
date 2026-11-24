/**
 * meta 缓存持久化层：IndexedDB 为主，旧 localStorage 键只用于一次性迁移。
 *
 * 为什么换存储：brawl_meta.json 已经 1.9MB 上下，localStorage 的 5MB 配额
 * （字符串还要按 UTF-16 双字节算）早就顶到天花板，写失败就退化成「本次启动有效」。
 * IndexedDB 存的是结构化对象，配额按磁盘可用空间走，不需要再做取舍。
 *
 * 迁移策略（只做一次，且是安全的单向迁移）：
 *   - 读：先 IndexedDB；读不到再看旧键 `brawl.meta.v2.payload`；
 *   - 旧键有数据 → 写入 IndexedDB → **写入成功后**才删旧键，释放 5MB 配额；
 *   - 写失败（配额、隐私模式）→ 旧键原样保留，下次启动再试。
 */
import { validateMeta, type BrawlMeta } from '../types/meta';
import { idbGet, idbSet, type IdbStoreConfig } from './idb';

/** 缓存库配置 */
export const META_DB: IdbStoreConfig = {
  dbName: 'chesstars',
  storeName: 'meta',
  version: 1,
};

/** IndexedDB 里的记录键 */
export const META_CACHE_KEY = 'brawl.meta';

/** 旧版 localStorage 键：迁移完成后删除 */
export const LEGACY_LS_META_KEY = 'brawl.meta.v2.payload';

/**
 * 落盘记录：除了 meta 本身，还带上版本与时间戳，
 * 便于以后排查「这份缓存是哪来的、什么时候写的」。
 */
export interface MetaCacheRecord {
  meta: BrawlMeta;
  /** 冗余的 schema 版本，方便未来做无解析的快速判断 */
  schemaVersion: number;
  /** 数据自带的更新时间 */
  updatedAt: string;
  /** 写入时刻（毫秒时间戳） */
  savedAt: number;
}

export type MetaCacheOrigin = 'indexeddb' | 'legacy';

export interface MetaCacheHit {
  meta: BrawlMeta;
  /** 数据是从哪儿读到的；迁移场景下为 'legacy' */
  origin: MetaCacheOrigin;
}

/** 存储适配器：MetaStore 只依赖这两个动作，测试可注入替身 */
export interface MetaCacheAdapter {
  read(): Promise<MetaCacheHit | null>;
  /** 返回 false 表示没能持久化（调用方据此提示用户） */
  write(meta: BrawlMeta): Promise<boolean>;
}

function toRecord(meta: BrawlMeta): MetaCacheRecord {
  return {
    meta,
    schemaVersion: meta.schema_version,
    updatedAt: meta.updated_at,
    savedAt: Date.now(),
  };
}

/**
 * 把任意读出来的值还原成 BrawlMeta。
 *
 * 兼容两种形状：本模块写入的 `{ meta, ... }` 记录，以及裸 meta 对象
 * （早期手工写入或将来别处写入的数据）。校验不过一律当没有。
 */
function parseRecord(raw: unknown): BrawlMeta | null {
  if (!raw || typeof raw !== 'object') return null;
  const candidate = (raw as { meta?: unknown }).meta ?? raw;
  try {
    return validateMeta(candidate);
  } catch {
    return null;
  }
}

function legacyStorage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    // 某些隐私模式下访问 localStorage 本身就会抛
    return null;
  }
}

/** 读取旧版 localStorage 缓存；没有或已损坏返回 null */
export function readLegacyMeta(): BrawlMeta | null {
  const storage = legacyStorage();
  if (!storage) return null;
  try {
    const raw = storage.getItem(LEGACY_LS_META_KEY);
    if (!raw) return null;
    return validateMeta(JSON.parse(raw) as unknown);
  } catch {
    return null;
  }
}

/** 删除旧键，把 5MB 配额还回去；失败不影响主流程 */
export function removeLegacyMetaKey(): void {
  const storage = legacyStorage();
  if (!storage) return;
  try {
    storage.removeItem(LEGACY_LS_META_KEY);
  } catch {
    /* 删不掉就留着，最多多占一点配额 */
  }
}

/**
 * 读缓存：IndexedDB 优先；为空则尝试把旧 localStorage 缓存迁移过来。
 * 任何异常都收敛成 null（缓存是加速项，不能拖垮启动）。
 */
export async function readMetaCache(): Promise<MetaCacheHit | null> {
  try {
    const record = await idbGet<unknown>(META_DB, META_CACHE_KEY);
    const meta = parseRecord(record);
    if (meta) return { meta, origin: 'indexeddb' };
  } catch {
    /* IndexedDB 不可用（无实现 / 打开失败）：继续看旧键 */
  }

  const legacy = readLegacyMeta();
  if (!legacy) return null;

  try {
    await idbSet(META_DB, META_CACHE_KEY, toRecord(legacy));
    // 只有确认写进 IndexedDB 之后才删旧键，避免迁移中途失败把数据弄丢
    removeLegacyMetaKey();
  } catch {
    /* 迁移失败：旧键保留，本次仍用这份数据，下次启动再试 */
  }
  return { meta: legacy, origin: 'legacy' };
}

/**
 * 写缓存：只有 IndexedDB 真的写失败才返回 false。
 * 写入成功后顺手清掉旧 localStorage 键，避免两份数据长期并存。
 */
export async function writeMetaCache(meta: BrawlMeta): Promise<boolean> {
  try {
    await idbSet(META_DB, META_CACHE_KEY, toRecord(meta));
  } catch {
    return false;
  }
  removeLegacyMetaKey();
  return true;
}

/** 默认适配器：MetaStore 直接用它 */
export const metaCache: MetaCacheAdapter = {
  read: readMetaCache,
  write: writeMetaCache,
};
