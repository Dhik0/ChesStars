import { buildIndex, type MetaIndex } from '../data/metaIndex';
import {
  validateMeta,
  type BrawlMeta,
  type MetaSource,
} from '../types/meta';
import { fetchJsonWithRetry } from './http';

/**
 * 数据仓库：离线优先 + 远程热更新（Stale-While-Revalidate）
 *
 * 读取优先级：
 *   1. localStorage 缓存（上次成功加载/更新的完整 JSON）→ source = 'cache'
 *   2. 打包内置 ./data/brawl_meta.json（断网零延迟兜底）→ source = 'builtin'
 *   3. 后台静默拉取远程 URL，成功且 updated_at 更新则替换 → source = 'remote'
 *
 * 所有远程请求都走 fetchJsonWithRetry：6 秒超时 + 最多 3 次尝试 + 指数退避，
 * 适配国内弱网/代理抖动——首包超时再试就通是常态。
 */

/** 默认远程更新地址（jsDelivr 加速的 GitHub 仓库） */
export const DEFAULT_REMOTE_URL =
  'https://cdn.jsdelivr.net/gh/Dhik0/-brawl-draft-core-@main/dist/brawl_meta.json';

const LS_META = 'brawl.meta.v2.payload';
const LS_URL = 'brawl.meta.v2.remoteUrl';

/** 远程检查单次超时（毫秒） */
export const REMOTE_TIMEOUT_MS = 6000;
/** 远程检查额外重试次数（总尝试次数 = 1 + 该值） */
export const REMOTE_RETRIES = 2;
/** 内置文件是本地产物，超时给宽一点，不重试 */
export const BUILTIN_TIMEOUT_MS = 15000;

/** 内置兜底文件路径：兼容 dev（/）与 Capacitor（./）两种 base */
export function builtinMetaUrl(): string {
  const base = import.meta.env.BASE_URL || './';
  return `${base}${base.endsWith('/') ? '' : '/'}data/brawl_meta.json`;
}

/** 数据日期的来源：JSON 自带字段 / HTTP Last-Modified / 都没有 */
export type DataDateSource = 'json' | 'header' | 'none';

export interface MetaSnapshot {
  meta: BrawlMeta;
  index: MetaIndex;
  source: MetaSource;
  /** 当前数据文件自带的更新时间（原始 ISO 串） */
  updatedAt: string;
  /** 格式化后的数据日期（YYYY-MM-DD），给界面直接展示 */
  dataDate: string | null;
  /** dataDate 取自哪里 */
  dataDateSource: DataDateSource;
  totalBattles: number;
  remoteUrl: string;
  /** 最近一次远程检查的失败原因（成功后清空） */
  lastError: string | null;
  loading: boolean;
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
 * 解析数据日期：优先 JSON 自带字段（updated_at / generated_at / date），
 * 都没有时退回 HTTP `Last-Modified` 响应头。
 */
function resolveDataDate(
  meta: BrawlMeta,
  lastModified: string | null,
): { date: string | null; source: DataDateSource } {
  const extra = meta as unknown as Record<string, unknown>;
  for (const candidate of [meta.updated_at, extra.generated_at, extra.date]) {
    if (typeof candidate === 'string' && candidate.trim()) {
      const date = toLocalDateString(candidate);
      if (date) return { date, source: 'json' };
    }
  }
  const fromHeader = toLocalDateString(lastModified);
  if (fromHeader) return { date: fromHeader, source: 'header' };
  return { date: null, source: 'none' };
}

function readUrl(): string {
  try {
    return localStorage.getItem(LS_URL) ?? DEFAULT_REMOTE_URL;
  } catch {
    return DEFAULT_REMOTE_URL;
  }
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
    // 配额不足（如无痕模式）时静默失败，不影响本次会话使用
    return false;
  }
}

function isNewer(incoming: BrawlMeta, current: BrawlMeta): boolean {
  const a = Date.parse(incoming.updated_at);
  const b = Date.parse(current.updated_at);
  if (Number.isNaN(a)) return false;
  if (Number.isNaN(b)) return true;
  return a > b;
}

class MetaStore {
  private snapshot: MetaSnapshot | null = null;
  private listeners = new Set<Listener>();
  private initPromise: Promise<MetaSnapshot> | null = null;

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

  private setMeta(
    meta: BrawlMeta,
    source: MetaSource,
    lastError: string | null,
    lastModified: string | null = null,
  ): void {
    const { date, source: dateSource } = resolveDataDate(meta, lastModified);
    this.snapshot = {
      meta,
      index: buildIndex(meta),
      source,
      updatedAt: meta.updated_at,
      dataDate: date,
      dataDateSource: dateSource,
      totalBattles: meta.total_battles,
      remoteUrl: readUrl(),
      lastError,
      loading: false,
    };
    this.emit();
  }

  /** 首次加载：缓存优先，其次内置，全部失败才报错 */
  async init(): Promise<MetaSnapshot> {
    if (this.snapshot) return this.snapshot;
    if (this.initPromise) return this.initPromise;

    this.initPromise = (async () => {
      const cached = readCache();
      if (cached) {
        this.setMeta(cached, 'cache', null);
        // 有缓存也不阻塞：后台静默检查更新
        void this.silentCheck();
        return this.snapshot!;
      }

      try {
        const { data, lastModified } = await fetchJsonWithRetry(builtinMetaUrl(), {
          timeoutMs: BUILTIN_TIMEOUT_MS,
          retries: 1,
        });
        const meta = validateMeta(data);
        this.setMeta(meta, 'builtin', null, lastModified);
        void this.silentCheck();
        return this.snapshot!;
      } catch (err) {
        const reason = err instanceof Error ? err.message : String(err);
        throw new Error(`内置数据加载失败：${reason}`);
      }
    })();

    return this.initPromise;
  }

  /** 启动时静默检查：超时/失败一律忽略，只记录原因 */
  async silentCheck(): Promise<void> {
    if (!this.snapshot) return;
    const url = readUrl();
    try {
      const { data, lastModified } = await fetchJsonWithRetry(url, {
        timeoutMs: REMOTE_TIMEOUT_MS,
        retries: REMOTE_RETRIES,
      });
      const meta = validateMeta(data);
      if (isNewer(meta, this.snapshot.meta)) {
        writeCache(meta);
        this.setMeta(meta, 'remote', null, lastModified);
      } else if (this.snapshot.lastError) {
        this.snapshot = { ...this.snapshot, lastError: null };
        this.emit();
      }
    } catch (err) {
      if (!this.snapshot) return;
      const reason = err instanceof Error ? err.message : String(err);
      this.snapshot = { ...this.snapshot, lastError: `远程检查失败：${reason}` };
      this.emit();
    }
  }

  /** 手动「立即拉取最新数据」，返回可读结果 */
  async pullNow(): Promise<PullResult> {
    if (!this.snapshot) return { ok: false, updated: false, message: '数据尚未初始化' };
    const url = readUrl();
    this.snapshot = { ...this.snapshot, loading: true };
    this.emit();

    try {
      const { data, lastModified } = await fetchJsonWithRetry(url, {
        timeoutMs: REMOTE_TIMEOUT_MS,
        retries: REMOTE_RETRIES,
      });
      const meta = validateMeta(data);
      if (isNewer(meta, this.snapshot.meta)) {
        writeCache(meta);
        this.setMeta(meta, 'remote', null, lastModified);
        const date = this.snapshot?.dataDate ?? toLocalDateString(meta.updated_at) ?? meta.updated_at;
        return {
          ok: true,
          updated: true,
          message: `已更新至 ${date}（${meta.total_battles.toLocaleString()} 场对局）`,
        };
      }
      this.snapshot = { ...this.snapshot, loading: false, lastError: null };
      this.emit();
      return { ok: true, updated: false, message: '已是最新数据' };
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      this.snapshot = { ...this.snapshot, loading: false, lastError: `拉取失败：${reason}` };
      this.emit();
      return { ok: false, updated: false, message: `拉取失败：${reason}` };
    }
  }

  /** 保存远程地址（空字符串回退默认值） */
  setRemoteUrl(url: string): void {
    const trimmed = url.trim() || DEFAULT_REMOTE_URL;
    try {
      localStorage.setItem(LS_URL, trimmed);
    } catch {
      /* 忽略存储失败 */
    }
    if (this.snapshot) {
      this.snapshot = { ...this.snapshot, remoteUrl: trimmed };
      this.emit();
    }
  }

  /** 清除本地缓存，回到内置数据 */
  async clearCache(): Promise<void> {
    try {
      localStorage.removeItem(LS_META);
    } catch {
      /* 忽略 */
    }
    const { data, lastModified } = await fetchJsonWithRetry(builtinMetaUrl(), {
      timeoutMs: BUILTIN_TIMEOUT_MS,
      retries: 1,
    });
    this.setMeta(validateMeta(data), 'builtin', null, lastModified);
  }
}

export const metaStore = new MetaStore();
