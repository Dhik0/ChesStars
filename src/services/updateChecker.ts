/**
 * App 新版本检测：双通道，永不打扰。
 *
 * 通道 1（主）：仓库根目录 `version.json`，复用数据拉取那套三段式链路
 *   `commit API → jsDelivr@<sha>/version.json → jsDelivr@main/version.json → Raw`。
 *   好处：不吃 GitHub API 的 60 次/小时限流，还能顺带下发下载镜像、QQ 群链接。
 * 通道 2（兜底）：GitHub Releases API，只在 version.json 全链路失败时才请求。
 *
 * 设计取向不变：启动时后台静默请求，超时/限流/断网一律当作「没有更新」，
 * 只有真的拿到更高版本号才返回 update；用户点「忽略此版本」后同一版本不再弹窗。
 */
import {
  APP_VERSION,
  GITHUB_OWNER,
  GITHUB_RELEASES_API,
  GITHUB_RELEASES_PAGE,
  GITHUB_REPO_NAME,
  VERSION_MANIFEST_PATH,
} from '../config/app';
import { isNewerVersion, isValidVersion, normalizeVersion } from '../utils/version';
import { fetchJsonWithRetry } from './http';
import { fetchRepoJson, type RepoRef } from './metaRemote';

/** 启动检测的超时：比数据拉取更短，避免弱网下拖住后台线程太久 */
export const UPDATE_TIMEOUT_MS = 5000;
/** 额外重试次数：更新提示不值得反复重试，1 次足够 */
export const UPDATE_RETRIES = 1;

/**
 * version.json 只有几百字节，不需要 15 秒：
 * 给 6 秒足够，失败就尽快降到下一段。
 */
export const MANIFEST_TIMEOUT_MS = 6000;

/** 国内加速镜像前缀（version.json 没下发时的默认值） */
export const DEFAULT_MIRROR_PREFIXES: readonly string[] = [
  'https://ghfast.top/',
  'https://gh-proxy.com/',
];

const LS_IGNORED = 'chesstars.update.ignored';
const NOTES_MAX = 1200;

/** App 仓库的版本清单位置 */
export const APP_MANIFEST_REF: RepoRef = {
  owner: GITHUB_OWNER,
  repo: GITHUB_REPO_NAME,
  branch: 'main',
  path: VERSION_MANIFEST_PATH,
};

export interface UpdateInfo {
  /** 去掉 v 前缀的版本号，如 1.2.0 */
  version: string;
  /** 更新摘要（纯文本） */
  notes: string;
  /** Release 页面地址 */
  htmlUrl: string;
  /** APK 直链（GitHub 原链）；拿不到时为 null */
  apkUrl: string | null;
  /** 国内加速前缀，可能为空数组（为空时直接用 apkUrl） */
  mirrorPrefixes: readonly string[];
  /** QQ 群分享链接，未配置时为 null */
  qqGroupUrl: string | null;
  publishedAt: string | null;
}

export type UpdateStatus = 'update' | 'latest' | 'error';

/** 结果来自哪条通道，排查用 */
export type UpdateChannel = 'manifest' | 'releases';

export interface UpdateCheckResult {
  status: UpdateStatus;
  /** 当前应用版本 */
  current: string;
  info?: UpdateInfo;
  /** 失败原因（仅 status === 'error'） */
  reason?: string;
  /** 命中的通道 */
  via?: UpdateChannel;
}

/** 仓库根目录 version.json 的结构 */
export interface VersionManifest {
  version: string;
  releaseUrl: string;
  apkUrl: string;
  mirrorPrefixes: string[];
  qqGroupUrl: string;
  notes: string;
}

/** GitHub Release 里我们关心的字段（其余忽略） */
interface GitHubRelease {
  tag_name?: unknown;
  name?: unknown;
  body?: unknown;
  html_url?: unknown;
  published_at?: unknown;
  assets?: unknown;
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

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/** 只接受 http(s) 链接，其余（含空串）一律当没配 */
function httpUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  return /^https?:\/\//i.test(text) ? text : null;
}

function httpList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((v) => (typeof v === 'string' ? v.trim() : ''))
    .filter((v) => /^https?:\/\//i.test(v));
}

/**
 * 校验 version.json。字段缺失时抛错，交给上层降级到 Releases 通道，
 * 避免把半截配置（例如没有 apkUrl）当成有效更新推给用户。
 */
export function parseVersionManifest(raw: unknown): VersionManifest {
  if (!isObj(raw)) throw new Error('version.json 根节点必须是对象');

  const version = normalizeVersion(typeof raw.version === 'string' ? raw.version : '');
  if (!version || !isValidVersion(version)) throw new Error('version.json 缺少有效 version');

  const apkUrl = httpUrl(raw.apkUrl);
  if (!apkUrl) throw new Error('version.json 缺少有效 apkUrl');

  return {
    version,
    releaseUrl: httpUrl(raw.releaseUrl) ?? GITHUB_RELEASES_PAGE,
    apkUrl,
    mirrorPrefixes: httpList(raw.mirrorPrefixes),
    qqGroupUrl: httpUrl(raw.qqGroupUrl) ?? '',
    notes: typeof raw.notes === 'string' ? raw.notes : '',
  };
}

/**
 * 国内加速下载地址：`${mirrorPrefixes[0]}${apkUrl}`。
 * 前缀没写结尾斜杠时补一个（ghfast.top 这类服务两种写法都有人用），
 * 前缀为空或 apkUrl 缺失时返回 apkUrl 本身。
 */
export function mirrorDownloadUrl(
  prefixes: readonly string[],
  apkUrl: string | null,
): string | null {
  if (!apkUrl) return null;
  const prefix = prefixes.map((p) => p.trim()).find((p) => /^https?:\/\//i.test(p));
  if (!prefix) return apkUrl;
  return `${prefix.endsWith('/') ? prefix : `${prefix}/`}${apkUrl}`;
}

/** 从 Release 资产里挑 APK 直链（优先名字里带版本号的那个） */
function pickApkAsset(assets: unknown, version: string): string | null {
  if (!Array.isArray(assets)) return null;
  const apks = assets
    .filter(isObj)
    .filter((a) => typeof a.name === 'string' && /\.apk$/i.test(a.name));
  const preferred = apks.find((a) => (a.name as string).includes(version)) ?? apks[0];
  return preferred ? httpUrl(preferred.browser_download_url) : null;
}

/** 通道 1：version.json（三段式链路） */
async function checkViaManifest(current: string): Promise<UpdateCheckResult> {
  const res = await fetchRepoJson<unknown>(APP_MANIFEST_REF, { timeoutMs: MANIFEST_TIMEOUT_MS });
  const manifest = parseVersionManifest(res.data);

  const info: UpdateInfo = {
    version: manifest.version,
    notes: summarizeNotes(manifest.notes),
    htmlUrl: manifest.releaseUrl,
    apkUrl: manifest.apkUrl,
    mirrorPrefixes: manifest.mirrorPrefixes,
    qqGroupUrl: manifest.qqGroupUrl || null,
    publishedAt: null,
  };

  return isNewerVersion(manifest.version, current)
    ? { status: 'update', current, info, via: 'manifest' }
    : { status: 'latest', current, info, via: 'manifest' };
}

/** 通道 2：GitHub Releases API（兜底） */
async function checkViaReleases(current: string): Promise<UpdateCheckResult> {
  const { data } = await fetchJsonWithRetry<GitHubRelease>(GITHUB_RELEASES_API, {
    timeoutMs: UPDATE_TIMEOUT_MS,
    retries: UPDATE_RETRIES,
    backoffMs: 800,
    headers: { Accept: 'application/vnd.github+json' },
  });

  const tag = typeof data?.tag_name === 'string' ? data.tag_name : '';
  const version = normalizeVersion(tag);
  if (!version) throw new Error('发布信息缺少版本号');

  const info: UpdateInfo = {
    version,
    notes: summarizeNotes(data.body),
    htmlUrl:
      typeof data.html_url === 'string' && data.html_url ? data.html_url : GITHUB_RELEASES_PAGE,
    apkUrl: pickApkAsset(data.assets, version),
    mirrorPrefixes: DEFAULT_MIRROR_PREFIXES,
    qqGroupUrl: null,
    publishedAt: typeof data.published_at === 'string' ? data.published_at : null,
  };

  return isNewerVersion(version, current)
    ? { status: 'update', current, info, via: 'releases' }
    : { status: 'latest', current, info, via: 'releases' };
}

/**
 * 检查新版本：先 version.json，全链路失败再问 Releases API。
 * 不会抛异常——所有失败都收敛成 `{ status: 'error' }` 并带上两段原因。
 */
export async function checkForUpdate(): Promise<UpdateCheckResult> {
  const current = APP_VERSION;
  const failures: string[] = [];

  try {
    return await checkViaManifest(current);
  } catch (err) {
    failures.push(`版本清单：${err instanceof Error ? err.message : String(err)}`);
  }

  try {
    return await checkViaReleases(current);
  } catch (err) {
    failures.push(`Releases 接口：${err instanceof Error ? err.message : String(err)}`);
  }

  return { status: 'error', current, reason: failures.join(' ｜ ') };
}
