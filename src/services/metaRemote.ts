/**
 * 远程元数据（brawl_meta.json）拉取：三段式降级链路。
 *
 * 背景：jsDelivr 对**分支引用**（`@main`）的文件在边缘节点缓存 12 小时
 * （响应头 `Cache-Control: public, max-age=604800, s-maxage=43200`），
 * 后端推送新数据后，App 可能半天都拉不到——这不是 URL 写错，而是 CDN 分支缓存。
 *
 * 解决办法是先把「分支」换成「精确 Commit SHA」再走 CDN：
 * 不可变引用（@sha）在 jsDelivr 上是永久缓存 + 毫秒级回源，天然绕过分支缓存。
 *
 * 链路顺序：
 *   1. GitHub Commit API 取 main 最新 sha（4s 超时）
 *      → `https://cdn.jsdelivr.net/gh/Dhik0/-brawl-draft-core-@<sha>/dist/brawl_meta.json`
 *   2. 第一兜底：jsDelivr 分支直连 `@main`（API 超时 / 限流 / 被墙时）
 *   3. 最终兜底：GitHub Raw 直连
 *
 * 每一段都带 `?t=<时间戳>` 防缓存参数（jsDelivr / Raw 的边缘缓存键含 query，
 * 等于强制回源）。**不**发 `Cache-Control: no-cache` 请求头：它不属于 CORS 安全
 * 列表头，跨域时会触发预检请求，而 jsDelivr / Raw 并未在
 * `Access-Control-Allow-Headers` 里放行它，反而会把请求直接打死。
 *
 * Capacitor Android 侧：页面 origin 是 `https://localhost`，上面三个域名的响应都带
 * `Access-Control-Allow-Origin: *`，请求头只有 CORS 安全列表内的 `Accept`，不触发预检，
 * 所以**不需要**启用 CapacitorHttp。原生 HTTP 插件会忽略 `cache: 'no-store'` 与
 * AbortSignal，反而让防缓存与超时控制失效，这里刻意继续用 WebView 的 fetch。
 */
import type { BrawlMeta } from '../types/meta';
import { fetchJsonWithRetry, type FetchJsonResult } from './http';

/* ------------------------------- 仓库常量 ------------------------------- */

/**
 * 一个「GitHub 仓库 + 分支 + 文件路径」的引用，三段式链路对它是通用的：
 * 数据仓库的 brawl_meta.json 与 App 仓库的 version.json 都走同一套逻辑。
 */
export interface RepoRef {
  owner: string;
  repo: string;
  branch: string;
  /** 文件在仓库内的相对路径（不带前导 /） */
  path: string;
}

/** 数据仓库 owner */
export const META_REPO_OWNER = 'Dhik0';
/** 数据仓库名：前后各有一个短横线，别漏 */
export const META_REPO_NAME = '-brawl-draft-core-';
/** 数据分支 */
export const META_BRANCH = 'main';
/** 数据文件在仓库内的路径 */
export const META_FILE_PATH = 'dist/brawl_meta.json';

export const META_REPO_REF: RepoRef = {
  owner: META_REPO_OWNER,
  repo: META_REPO_NAME,
  branch: META_BRANCH,
  path: META_FILE_PATH,
};

/** 最新提交接口（未认证 60 次/小时/IP，够用） */
export function commitApiUrl(ref: RepoRef): string {
  return `https://api.github.com/repos/${ref.owner}/${ref.repo}/commits/${ref.branch}`;
}

/** jsDelivr 分支直连：有 12h 边缘缓存，只作兜底 */
export function branchCdnUrl(ref: RepoRef): string {
  return `https://cdn.jsdelivr.net/gh/${ref.owner}/${ref.repo}@${ref.branch}/${ref.path}`;
}

/** GitHub Raw 直连：最终兜底 */
export function rawUrl(ref: RepoRef): string {
  return `https://raw.githubusercontent.com/${ref.owner}/${ref.repo}/${ref.branch}/${ref.path}`;
}

/** jsDelivr 精确版本地址（不可变引用，无分支缓存） */
export function pinnedUrl(ref: RepoRef, sha: string): string {
  return `https://cdn.jsdelivr.net/gh/${ref.owner}/${ref.repo}@${sha}/${ref.path}`;
}

export const COMMIT_API_URL = commitApiUrl(META_REPO_REF);
export const BRANCH_CDN_URL = branchCdnUrl(META_REPO_REF);
export const RAW_URL = rawUrl(META_REPO_REF);

/** 数据文件的精确版本地址 */
export function pinnedCdnUrl(sha: string): string {
  return pinnedUrl(META_REPO_REF, sha);
}

/* ------------------------------- 超时策略 ------------------------------- */

/** 取 sha 的超时：拿不到就立刻走兜底，不值得等 */
export const COMMIT_TIMEOUT_MS = 4000;
/**
 * JSON 下载超时：1.9MB 在移动端弱网下 6s 明显不够（≈320KB/s 才勉强），
 * 放宽到 15s，链路本身有三段兜底，所以每段只尝试一次。
 */
export const META_DOWNLOAD_TIMEOUT_MS = 15000;
/** 每段下载的额外重试次数：0 = 单次尝试，失败就降级到下一段 */
export const META_DOWNLOAD_RETRIES = 0;

/* ------------------------------- 渠道标识 ------------------------------- */

/** 数据实际从哪一段拿到的 */
export type MetaChannel = 'cdn-sha' | 'cdn-branch' | 'raw' | 'custom';

export const META_CHANNEL_LABEL: Record<MetaChannel, string> = {
  'cdn-sha': 'jsDelivr@提交',
  'cdn-branch': 'jsDelivr@main',
  raw: 'GitHub Raw',
  custom: '自定义地址',
};

/* ------------------------------- 类型定义 ------------------------------- */

export interface MetaRemoteOptions {
  /** 设置页保存的自定义地址；给了就只走它（仍然带防缓存参数） */
  customUrl?: string | null;
  /** 单次下载超时，默认 15s */
  timeoutMs?: number;
  /** 每段额外重试次数，默认 0 */
  retries?: number;
  /** 防缓存参数用的时间戳，测试注入用 */
  cacheBust?: number;
}

export interface MetaRemoteResult<T = unknown> {
  data: T;
  /** 响应头 Last-Modified（数据日期兜底） */
  lastModified: string | null;
  /** 实际命中的链路 */
  channel: MetaChannel;
  /** 实际请求的地址（不含防缓存参数） */
  url: string;
  /** 降级过程中各段的失败原因，成功时也保留，便于排查 */
  failures: string[];
}

/** 三段链路全部失败：message 已拼好可读原因，供界面直接展示 */
export class MetaRemoteError extends Error {
  readonly failures: string[];

  constructor(failures: string[]) {
    super(failures.length ? failures.join(' ｜ ') : '所有远程链路均失败');
    this.name = 'MetaRemoteError';
    this.failures = failures;
  }
}

/* ------------------------------- 工具函数 ------------------------------- */

/** 追加防缓存参数（URL 已带 query 时用 & 连接） */
export function withCacheBust(url: string, stamp: number = Date.now()): string {
  const sep = url.includes('?') ? '&' : '?';
  return `${url}${sep}t=${stamp}`;
}

function reason(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

const SHA_RE = /^[0-9a-f]{7,40}$/i;

/**
 * 解析 `updated_at` 为时间戳。
 *
 * 后端可能给出 6 位微秒（`2026-11-23T01:11:11.656144Z`），而 ISO 8601 只保证
 * 3 位毫秒；部分老 WebView 会直接解析失败。这里先把多余小数位截到 3 位。
 */
export function parseUpdatedAt(input: string | null | undefined): number {
  if (typeof input !== 'string') return Number.NaN;
  const text = input.trim();
  if (!text) return Number.NaN;
  const normalized = text.replace(/\.(\d{3})\d+/, '.$1');
  const parsed = Date.parse(normalized);
  return Number.isNaN(parsed) ? Date.parse(text) : parsed;
}

export interface ReplaceOptions {
  /** 本地是否已有缓存（决定「时间戳相同」时是否落盘） */
  hasCache: boolean;
}

/**
 * 是否需要用远程数据覆盖本地。
 *
 * 判定只看 `updated_at`（schema_version 由 validateMeta 单独把关）：
 *   - 远程更新 → 覆盖；
 *   - 远程更旧 → 不覆盖（避免把本地回滚成旧数据）；
 *   - 时间相同 → 只有本地还没有缓存时才落盘；
 *   - 远程时间戳解析不了 → 拒绝脏数据；本地解析不了 → 直接覆盖。
 */
export function shouldReplaceMeta(
  incoming: Pick<BrawlMeta, 'updated_at'>,
  current: Pick<BrawlMeta, 'updated_at'>,
  options: ReplaceOptions,
): boolean {
  const next = parseUpdatedAt(incoming?.updated_at);
  const prev = parseUpdatedAt(current?.updated_at);
  if (Number.isNaN(prev)) return true;
  if (Number.isNaN(next)) return false;
  if (next > prev) return true;
  if (next < prev) return false;
  return !options.hasCache;
}

/* ------------------------------- 链路实现 ------------------------------- */

async function download<T>(
  url: string,
  timeoutMs: number,
  retries: number,
  cacheBust?: number,
): Promise<FetchJsonResult<T>> {
  return fetchJsonWithRetry<T>(withCacheBust(url, cacheBust), {
    timeoutMs,
    retries,
    headers: { Accept: 'application/json' },
  });
}

/** 取目标仓库最新提交 sha；失败返回 null 并把原因记进 failures */
export async function resolveLatestSha(
  failures: string[] = [],
  cacheBust?: number,
  ref: RepoRef = META_REPO_REF,
): Promise<string | null> {
  try {
    const { data } = await fetchJsonWithRetry<{ sha?: unknown }>(
      withCacheBust(commitApiUrl(ref), cacheBust),
      {
        timeoutMs: COMMIT_TIMEOUT_MS,
        retries: 0,
        headers: { Accept: 'application/vnd.github.v3+json' },
      },
    );
    const sha = typeof data?.sha === 'string' ? data.sha.trim() : '';
    if (!SHA_RE.test(sha)) {
      failures.push('GitHub 提交接口：返回体缺少有效 sha');
      return null;
    }
    return sha;
  } catch (err) {
    failures.push(`GitHub 提交接口：${reason(err)}`);
    return null;
  }
}

/**
 * 按「sha 精确版本 → 分支 CDN → Raw」顺序拉取任意仓库的 JSON。
 * 全部失败时抛 MetaRemoteError（message 含三段原因）。
 */
export async function fetchRepoJson<T = unknown>(
  ref: RepoRef,
  options: MetaRemoteOptions = {},
): Promise<MetaRemoteResult<T>> {
  const timeoutMs = options.timeoutMs ?? META_DOWNLOAD_TIMEOUT_MS;
  const retries = Math.max(0, options.retries ?? META_DOWNLOAD_RETRIES);
  const failures: string[] = [];

  // 1) 精确 Commit SHA：绕开 jsDelivr 分支缓存
  const sha = await resolveLatestSha(failures, options.cacheBust, ref);
  if (sha) {
    const url = pinnedUrl(ref, sha);
    try {
      const res = await download<T>(url, timeoutMs, retries, options.cacheBust);
      return { ...res, channel: 'cdn-sha', url, failures };
    } catch (err) {
      failures.push(`jsDelivr@${sha.slice(0, 7)}：${reason(err)}`);
    }
  }

  // 2) 第一兜底：jsDelivr 分支直连
  const branchUrl = branchCdnUrl(ref);
  try {
    const res = await download<T>(branchUrl, timeoutMs, retries, options.cacheBust);
    return { ...res, channel: 'cdn-branch', url: branchUrl, failures };
  } catch (err) {
    failures.push(`jsDelivr@${ref.branch}：${reason(err)}`);
  }

  // 3) 最终兜底：GitHub Raw 直连
  const raw = rawUrl(ref);
  try {
    const res = await download<T>(raw, timeoutMs, retries, options.cacheBust);
    return { ...res, channel: 'raw', url: raw, failures };
  } catch (err) {
    failures.push(`GitHub Raw：${reason(err)}`);
  }

  throw new MetaRemoteError(failures);
}

/**
 * 拉取数据仓库的 brawl_meta.json。
 * 若用户在设置页配了自定义地址，则只走该地址、不做链路降级。
 */
export async function fetchMetaRemote<T = unknown>(
  options: MetaRemoteOptions = {},
): Promise<MetaRemoteResult<T>> {
  const timeoutMs = options.timeoutMs ?? META_DOWNLOAD_TIMEOUT_MS;
  const retries = Math.max(0, options.retries ?? META_DOWNLOAD_RETRIES);
  const failures: string[] = [];

  const custom = options.customUrl?.trim();
  if (custom && custom !== BRANCH_CDN_URL) {
    try {
      const res = await download<T>(custom, timeoutMs, retries, options.cacheBust);
      return { ...res, channel: 'custom', url: custom, failures };
    } catch (err) {
      failures.push(`自定义地址：${reason(err)}`);
      throw new MetaRemoteError(failures);
    }
  }

  return fetchRepoJson<T>(META_REPO_REF, options);
}
