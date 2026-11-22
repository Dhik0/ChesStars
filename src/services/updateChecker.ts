/**
 * GitHub Releases 新版本检测。
 *
 * 设计取向：**永不打扰**。启动时后台静默请求，超时/限流/断网一律当作「没有更新」，
 * 只有真的拿到更高版本号才返回 update；用户点「忽略此版本」后同一版本不再弹窗。
 */
import { APP_VERSION, GITHUB_RELEASES_API, GITHUB_RELEASES_PAGE } from '../config/app';
import { isNewerVersion, normalizeVersion } from '../utils/version';
import { fetchJsonWithRetry } from './http';

/** 启动检测的超时：比数据拉取更短，避免弱网下拖住后台线程太久 */
export const UPDATE_TIMEOUT_MS = 5000;
/** 额外重试次数：更新提示不值得反复重试，1 次足够 */
export const UPDATE_RETRIES = 1;

const LS_IGNORED = 'chesstars.update.ignored';
const NOTES_MAX = 1200;

export interface UpdateInfo {
  /** 去掉 v 前缀的版本号，如 1.2.0 */
  version: string;
  /** Release 正文摘要 */
  notes: string;
  /** Release 页面地址 */
  htmlUrl: string;
  publishedAt: string | null;
}

export type UpdateStatus = 'update' | 'latest' | 'error';

export interface UpdateCheckResult {
  status: UpdateStatus;
  /** 当前应用版本 */
  current: string;
  info?: UpdateInfo;
  /** 失败原因（仅 status === 'error'） */
  reason?: string;
}

/** GitHub Release 里我们关心的字段（其余忽略） */
interface GitHubRelease {
  tag_name?: unknown;
  name?: unknown;
  body?: unknown;
  html_url?: unknown;
  published_at?: unknown;
}

function readIgnored(): string[] {
  try {
    const raw = localStorage.getItem(LS_IGNORED);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : [];
  } catch {
    return [];
  }
}

/** 该版本是否已被用户「忽略」 */
export function isVersionIgnored(version: string): boolean {
  return readIgnored().includes(normalizeVersion(version));
}

/** 记住被忽略的版本（同一版本不再自动弹窗） */
export function ignoreVersion(version: string): void {
  const v = normalizeVersion(version);
  if (!v) return;
  const list = readIgnored();
  if (list.includes(v)) return;
  try {
    localStorage.setItem(LS_IGNORED, JSON.stringify([...list, v]));
  } catch {
    /* 存储失败不阻塞：最多下次再弹一次 */
  }
}

/**
 * Release 正文压成纯文本摘要。
 *
 * GitHub 的 body 是 Markdown，弹窗里直接渲染会出现一堆 `##` / `**` 噪音，
 * 所以做最轻量的清洗：去标题井号、列表符统一成「•」、去强调与代码标记、压空行。
 */
function summarizeNotes(body: unknown): string {
  if (typeof body !== 'string') return '';
  const text = body
    .replace(/\r\n/g, '\n')
    // 图片与 HTML 注释对摘要没有意义
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    // 标题井号
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    // 列表符
    .replace(/^\s{0,3}[-*+]\s+/gm, '• ')
    // 强调 / 行内代码 / 链接语法
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  if (text.length <= NOTES_MAX) return text;
  return `${text.slice(0, NOTES_MAX).trimEnd()}…`;
}

/**
 * 请求 GitHub 最新 Release 并与当前版本比较。
 * 不会抛异常——所有失败都收敛成 `{ status: 'error' }`。
 */
export async function checkForUpdate(): Promise<UpdateCheckResult> {
  const current = APP_VERSION;
  try {
    const { data } = await fetchJsonWithRetry<GitHubRelease>(GITHUB_RELEASES_API, {
      timeoutMs: UPDATE_TIMEOUT_MS,
      retries: UPDATE_RETRIES,
      backoffMs: 800,
      headers: { Accept: 'application/vnd.github+json' },
    });

    const tag = typeof data?.tag_name === 'string' ? data.tag_name : '';
    const version = normalizeVersion(tag);
    if (!version) {
      return { status: 'error', current, reason: '发布信息缺少版本号' };
    }

    if (!isNewerVersion(version, current)) {
      return { status: 'latest', current };
    }

    return {
      status: 'update',
      current,
      info: {
        version,
        notes: summarizeNotes(data.body),
        htmlUrl:
          typeof data.html_url === 'string' && data.html_url ? data.html_url : GITHUB_RELEASES_PAGE,
        publishedAt: typeof data.published_at === 'string' ? data.published_at : null,
      },
    };
  } catch (err) {
    return {
      status: 'error',
      current,
      reason: err instanceof Error ? err.message : String(err),
    };
  }
}
