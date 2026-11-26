import { buildIndex, type MetaIndex } from '../data/metaIndex';
import { validateMeta, type BrawlMeta, type MetaSource } from '../types/meta';
import { fetchJsonWithRetry, HttpError, HttpTimeoutError } from './http';
import { metaCache, type MetaCacheAdapter } from './metaCache';
import { fetchRepoJson, META_REPO_REF, shouldReplaceMeta } from './metaRemote';

/**
 * 数据仓库：离线优先 + 远程热更新（Stale-While-Revalidate）
 *
 * 读取优先级：
 *   1. IndexedDB 缓存（上次成功加载/更新的完整 JSON，旧 localStorage 数据会自动迁移）
 *      → source = 'cache'
 *   2. 打包内置 ./data/brawl_meta.json（断网零延迟兜底）→ source = 'builtin'
 *   3. 后台静默拉取远程数据，updated_at 更新则替换 → source = 'remote'
 *
 * 持久化细节见 `metaCache.ts`：容量上限由磁盘决定，只有 IndexedDB 本身写失败
 * （极端磁盘满 / 隐私模式）才退化成「本次启动内有效」。
 *
 * 远程请求走 `metaRemote.fetchRepoJson` 的三段式链路，细节见该模块注释。
 * 界面只需要知道「有没有更新、数据是哪天的」，链路与超时细节不外露。
 */

/**
 * 内置文件超时。
 *
 * 这份文件是首屏唯一的关键资源，而且**不再走网络优化**：国内直连时 8.6MB 在弱网下
 * 十几秒很正常，短超时只会把「慢」误判成「失败」。给到 20 秒（需求允许的 15~20s 上限），
 * 并且**不重试**——重试是从头再下一遍 8.6MB，只会让卡住的时间翻倍；
 * 失败后由界面给出原因 + 重试按钮，用户点一次时 Service Worker 的预缓存往往已经装好，
 * 第二次几乎瞬时命中。
 */
export const BUILTIN_TIMEOUT_MS = 20000;

/** 内置文件的重试次数：见上，重试等于重下 8.6MB，交给用户手动触发 */
export const BUILTIN_RETRIES = 0;

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

/**
 * 手动拉取的结果类型。
 * 服务层只回结构化结果，具体文案由界面按当前语言组装（`i18n/format.ts`）。
 */
export type PullCode = 'notReady' | 'latest' | 'updated' | 'failed';

export interface PullResult {
  ok: boolean;
  /** 远程数据是否比当前新 */
  updated: boolean;
  code: PullCode;
  /** 数据日期（YYYY-MM-DD），仅 latest / updated 有 */
  date?: string;
  /** 总对局数，仅 latest / updated 有 */
  battles?: number;
  /** 是否成功落盘；false = 仅本次启动内有效（仅 updated 有意义） */
  persisted?: boolean;
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

function reason(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * 首屏数据加载失败的「可分类」原因。
 *
 * 服务层只回种类与状态码，具体文案由 `i18n/format.ts` 按当前语言组装——
 * 与 `PullResult` 同一套约定，服务层不认识任何语言。
 */
export type MetaLoadFailureKind = 'timeout' | 'offline' | 'http' | 'invalid' | 'unknown';

export class MetaLoadError extends Error {
  readonly kind: MetaLoadFailureKind;
  /** 仅 kind === 'http' 时有值 */
  readonly status?: number;

  constructor(kind: MetaLoadFailureKind, message: string, status?: number) {
    super(message);
    this.name = 'MetaLoadError';
    this.kind = kind;
    this.status = status;
  }
}

/**
 * 网络层错误 → 分类。
 *
 * 顺序不能反：`HttpTimeoutError` / `HttpError` 都是 Error 子类，
 * 先判类型再落到「断网」（fetch 在断网 / DNS 失败 / CORS 被拒时抛的是 TypeError）。
 */
function classifyNetworkError(err: unknown): MetaLoadError {
  if (err instanceof HttpTimeoutError) {
    return new MetaLoadError('timeout', `内置数据加载超时：${reason(err)}`);
  }
  if (err instanceof HttpError) {
    return new MetaLoadError('http', `内置数据加载失败：${reason(err)}`, err.status);
  }
  if (err instanceof TypeError) {
    return new MetaLoadError('offline', `内置数据加载失败：${reason(err)}`);
  }
  return new MetaLoadError('unknown', `内置数据加载失败：${reason(err)}`);
}

/**
 * 数据仓库。
 *
 * 缓存读写全部走 `MetaCacheAdapter`（默认实现是 IndexedDB）：
 * 读是异步的，所以 `init()` 会等一次缓存读取；写失败也不抛错，
 * 只把 `false` 交给调用方，由它决定要不要提示「仅本次启动内有效」。
 */
export class MetaStore {
  private snapshot: MetaSnapshot | null = null;
  private listeners = new Set<Listener>();
  private initPromise: Promise<MetaSnapshot> | null = null;
  /** 静默检查去重：同一次启动不并发打多次远程 */
  private silentPromise: Promise<void> | null = null;
  /** 本地是否已有可用缓存（决定 updated_at 相同时要不要落盘） */
  private hasCache = false;

  constructor(private readonly cache: MetaCacheAdapter = metaCache) {}

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

  /**
   * 走三段式链路拉一次远程，并把结构校验过一遍。
   *
   * 每次调用都带一个**新的**防缓存时间戳（三段链路共用同一个值）。
   * 这是「手动拉取却提示已是最新」的根因所在：请求一旦命中浏览器磁盘缓存或
   * CDN 边缘缓存，拿回来的就是旧文件，与本地一比自然「没有更新」。
   */
  private async loadRemote(): Promise<{ meta: BrawlMeta; lastModified: string | null }> {
    const res = await fetchRepoJson<unknown>(META_REPO_REF, { cacheBust: Date.now() });
    return { meta: validateMeta(res.data), lastModified: res.lastModified };
  }

  /**
   * 拉内置文件——首屏唯一的阻塞项。
   *
   * 网络失败与结构异常分开归类，界面才能把「超时 / 断网 / 状态码 / 文件损坏」讲清楚。
   * 这里刻意**不**加 `?t=` 防缓存参数：线上这份文件由 Service Worker 预缓存，
   * 加了会绕开预缓存，断网时就取不到了。
   */
  private async loadBuiltin(): Promise<{ meta: BrawlMeta; lastModified: string | null }> {
    let data: unknown;
    let lastModified: string | null;
    try {
      const res = await fetchJsonWithRetry(builtinMetaUrl(), {
        timeoutMs: BUILTIN_TIMEOUT_MS,
        retries: BUILTIN_RETRIES,
      });
      data = res.data;
      lastModified = res.lastModified;
    } catch (err) {
      throw classifyNetworkError(err);
    }

    try {
      return { meta: validateMeta(data), lastModified };
    } catch (err) {
      throw new MetaLoadError('invalid', `内置数据格式异常：${reason(err)}`);
    }
  }

  /** 首次加载：缓存优先，其次内置，全部失败才报错 */
  async init(): Promise<MetaSnapshot> {
    if (this.snapshot) return this.snapshot;
    if (this.initPromise) return this.initPromise;

    this.initPromise = (async () => {
      // 1) 本地缓存：有就直接进界面，远端检查放后台
      const cached = await this.cache.read();
      this.hasCache = cached !== null;
      if (cached) {
        this.setMeta(cached.meta, 'cache');
        // 有缓存也不阻塞：后台静默检查更新
        void this.silentCheck();
        return this.snapshot!;
      }

      // 2) 冷启动（新浏览器 / 无痕 / 刚清过缓存）：只等同源内置文件。
      //    远端三段链路一律在进入界面之后异步跑，绝不挡在首屏前面——
      //    弱网下它每段都可能超时，叠起来就是「一直转圈」。
      const { meta, lastModified } = await this.loadBuiltin();
      this.setMeta(meta, 'builtin', lastModified);
      void this.silentCheck();
      return this.snapshot!;
    })();

    try {
      return await this.initPromise;
    } catch (err) {
      // 失败不能把 initPromise 永久钉住，否则界面上的「重试」拿到的永远是同一个失败结果
      this.initPromise = null;
      throw err;
    }
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
          // 写盘失败也不影响本次会话可用，只是重启后会退回上一份缓存
          if (await this.cache.write(remote.meta)) this.hasCache = true;
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
    if (!this.snapshot) return { ok: false, updated: false, code: 'notReady' };

    try {
      const remote = await this.loadRemote();
      if (!this.snapshot) return { ok: false, updated: false, code: 'notReady' };

      const date = toLocalDateString(remote.meta.updated_at) ?? remote.meta.updated_at;
      const battles = remote.meta.total_battles;

      // 对比基准是「本地当前正在用的那份数据」（缓存 / 内置 / 本会话已拉到的远端），
      // 而不是再拿缓存跟缓存比——loadRemote 已经强制走了一次网络（带防缓存参数）。
      if (!shouldReplaceMeta(remote.meta, this.snapshot.meta, { hasCache: this.hasCache })) {
        // 远端没有更新（甚至比本地更旧）：报本地当前数据的日期，
        // 不能把远端那份旧日期当成「最新」讲给用户。
        return {
          ok: true,
          updated: false,
          code: 'latest',
          date: this.snapshot.dataDate ?? date,
          battles: this.snapshot.totalBattles,
        };
      }

      // 只有 IndexedDB 真的写不进去（磁盘满等极端情况）才降级为内存生效
      const persisted = await this.cache.write(remote.meta);
      if (persisted) this.hasCache = true;
      this.setMeta(remote.meta, 'remote', remote.lastModified);

      return { ok: true, updated: true, code: 'updated', date, battles, persisted };
    } catch {
      return { ok: false, updated: false, code: 'failed' };
    }
  }
}

export const metaStore = new MetaStore();
