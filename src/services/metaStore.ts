import { buildIndex, type MetaIndex } from '../data/metaIndex';
import { validateMeta, type BrawlMeta, type MetaSource } from '../types/meta';
import { fetchJsonWithRetry } from './http';
import { fetchRepoJson, META_REPO_REF, shouldReplaceMeta } from './metaRemote';

/**
 * 数据仓库：离线优先 + 远程热更新（Stale-While-Revalidate）
 *
 * 读取优先级：
 *   1. localStorage 缓存（上次成功加载/更新的完整 JSON）→ source = 'cache'
 *   2. 打包内置 ./data/brawl_meta.json（断网零延迟兜底）→ source = 'builtin'
 *   3. 后台静默拉取远程数据，updated_at 更新则替换 → source = 'remote'
 *
 * 远程请求走 `metaRemote.fetchRepoJson` 的三段式链路，细节见该模块注释。
 * 界面只需要知道「有没有更新、数据是哪天的」，链路与超时细节不外露。
 */

const LS_META = 'brawl.meta.v2.payload';

/** 内置文件是本地产物，超时给宽一点，不重试 */
export const BUILTIN_TIMEOUT_MS = 15000;

/** 内置兜底文件路径：兼容 dev（/）与 Capacitor（./）两种 base */
export function builtinMetaUrl(): string {
  const base = import.meta.env.BASE_URL || './';
  return `${base}${base.endsWith('/') ? '' : '/'}data/brawl_meta.json`;
}

export interface MetaSnapshot {
  meta: BrawlMeta;
  index: MetaIndex;
  source: MetaSource;
  /** 当前数据文件自带的更新时间（原始 ISO 串） */
  updatedAt: string;
  /** 格式化后的数据日期（YYYY-MM-DD），给界面直接展示 */
  dataDate: string | null;
  totalBattles: number;
}

export interface PullResult {
  ok: boolean;
  /** 远程数据是否比当前新 */
  updated: boolean;
  message: string;
}

type Listener = (snap: MetaSnapshot) => void;

/** 任意时间串 → 本地时区的 YYYY-MM-DD；解析不了返回 null */
export function toLocalDateString(input: string | null | undefined): string | null {
  if (!input) return null;
  const text = input.trim();
  if (!text) return null;

  const d = new Date(text);
  if (!Number.isNaN(d.getTime())) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  // 兜底：形如 2026-11-22 的裸日期，避开各端 Date 解析差异
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(text);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

/**
 * 数据日期：优先 JSON 自带字段（updated_at / generated_at / date），
 * 都没有时退回 HTTP `Last-Modified` 响应头。
 */
function resolveDataDate(meta: BrawlMeta, lastModified: string | null): string | null {
  const extra = meta as unknown as Record<string, unknown>;
  for (const candidate of [meta.updated_at, extra.generated_at, extra.date]) {
    if (typeof candidate === 'string' && candidate.trim()) {
      const date = toLocalDateString(candidate);
      if (date) return date;
    }
  }
  return toLocalDateString(lastModified);
}

function readCache(): BrawlMeta | null {
  try {
    const raw = localStorage.getItem(LS_META);
    if (!raw) return null;
    return validateMeta(JSON.parse(raw) as unknown);
  } catch {
    return null;
  }
}

function writeCache(meta: BrawlMeta): boolean {
  try {
    localStorage.setItem(LS_META, JSON.stringify(meta));
    return true;
  } catch {
    // 配额不足（无痕模式 / 老设备 localStorage 上限偏小）时写不进去：
    // 本次会话仍然可用，但重启会退回上一次缓存，调用方需要把这件事告诉用户。
    return false;
  }
}

function reason(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** 数据日期 + 场次的可读描述，如「2026-11-23，101,440 场对局」 */
function describeMeta(meta: BrawlMeta): string {
  const date = toLocalDateString(meta.updated_at) ?? meta.updated_at;
  return `${date}，${meta.total_battles.toLocaleString()} 场对局`;
}

class MetaStore {
  private snapshot: MetaSnapshot | null = null;
  private listeners = new Set<Listener>();
  private initPromise: Promise<MetaSnapshot> | null = null;
  /** 静默检查去重：同一次启动不并发打多次远程 */
  private silentPromise: Promise<void> | null = null;
  /** 本地是否已有可用缓存（决定 updated_at 相同时要不要落盘） */
  private hasCache = false;

  getSnapshot(): MetaSnapshot | null {
    return this.snapshot;
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit(): void {
    if (!this.snapshot) return;
    for (const fn of this.listeners) fn(this.snapshot);
  }

  private setMeta(meta: BrawlMeta, source: MetaSource, lastModified: string | null = null): void {
    this.snapshot = {
      meta,
      index: buildIndex(meta),
      source,
      updatedAt: meta.updated_at,
      dataDate: resolveDataDate(meta, lastModified),
      totalBattles: meta.total_battles,
    };
    this.emit();
  }

  /** 走三段式链路拉一次远程，并把结构校验过一遍 */
  private async loadRemote(): Promise<{ meta: BrawlMeta; lastModified: string | null }> {
    const res = await fetchRepoJson<unknown>(META_REPO_REF);
    return { meta: validateMeta(res.data), lastModified: res.lastModified };
  }

  /** 首次加载：缓存优先，其次内置，全部失败才报错 */
  async init(): Promise<MetaSnapshot> {
    if (this.snapshot) return this.snapshot;
    if (this.initPromise) return this.initPromise;

    this.initPromise = (async () => {
      const cached = readCache();
      this.hasCache = cached !== null;
      if (cached) {
        this.setMeta(cached, 'cache');
        // 有缓存也不阻塞：后台静默检查更新
        void this.silentCheck();
        return this.snapshot!;
      }

      try {
        const { data, lastModified } = await fetchJsonWithRetry(builtinMetaUrl(), {
          timeoutMs: BUILTIN_TIMEOUT_MS,
          retries: 1,
        });
        this.setMeta(validateMeta(data), 'builtin', lastModified);
        void this.silentCheck();
        return this.snapshot!;
      } catch (err) {
        throw new Error(`内置数据加载失败：${reason(err)}`);
      }
    })();

    return this.initPromise;
  }

  /** 启动时静默检查：超时/失败一律忽略（用户手动拉取时才需要看到失败原因） */
  async silentCheck(): Promise<void> {
    if (!this.snapshot) return;
    if (this.silentPromise) return this.silentPromise;

    this.silentPromise = (async () => {
      try {
        const remote = await this.loadRemote();
        if (!this.snapshot) return;
        if (shouldReplaceMeta(remote.meta, this.snapshot.meta, { hasCache: this.hasCache })) {
          if (writeCache(remote.meta)) this.hasCache = true;
          this.setMeta(remote.meta, 'remote', remote.lastModified);
        }
      } catch {
        /* 静默失败：下次启动或用户手动拉取时再试 */
      } finally {
        this.silentPromise = null;
      }
    })();

    return this.silentPromise;
  }

  /**
   * 手动「立即拉取最新数据」：强制走网络，不查任何冷却时间，
   * 并把「已更新 / 已是最新 / 失败」明确回报给界面。
   */
  async pullNow(): Promise<PullResult> {
    if (!this.snapshot) return { ok: false, updated: false, message: '数据尚未初始化' };

    try {
      const remote = await this.loadRemote();
      if (!this.snapshot) return { ok: false, updated: false, message: '数据尚未初始化' };

      if (!shouldReplaceMeta(remote.meta, this.snapshot.meta, { hasCache: this.hasCache })) {
        return {
          ok: true,
          updated: false,
          message: `当前已是最新数据（${describeMeta(remote.meta)}）`,
        };
      }

      const persisted = writeCache(remote.meta);
      if (persisted) this.hasCache = true;
      this.setMeta(remote.meta, 'remote', remote.lastModified);

      const date = toLocalDateString(remote.meta.updated_at) ?? remote.meta.updated_at;
      const tail = persisted ? '' : '（本地存储空间不足，仅本次启动内有效）';
      return {
        ok: true,
        updated: true,
        message: `已更新至 ${date}（${remote.meta.total_battles.toLocaleString()} 场对局）${tail}`,
      };
    } catch {
      return { ok: false, updated: false, message: '拉取失败，请检查网络后重试' };
    }
  }
}

export const metaStore = new MetaStore();
