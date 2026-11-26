/**
 * 网页端版本检测（零后端成本）。
 *
 * 网页没有安装包，「有没有新版本」只能由页面自己问服务器：构建产物根目录的
 * `version.json`（由 vite.config.ts 在构建时生成，只含 version + buildTime）。
 * 页面里注入的 `__APP_VERSION__` 是**当前这份 JS 构建**的版本，两者不一致就说明
 * 线上已经部署了更新的版本，刷新即可拿到。
 *
 * 两条硬性约束：
 *   1. 每次请求都带新的 `?t=` 时间戳，且 http 层统一 `cache: 'no-store'`——
 *      否则浏览器磁盘缓存 / CDN 边缘缓存会把上一版清单喂回来，永远检测不到更新；
 *   2. 只在真的更高时才报 update，任何失败（404 / 断网 / 清单损坏）都收敛成 error，
 *      启动时的静默检查直接忽略 error，绝不用红字打扰用户。
 */
import { APP_VERSION, webVersionManifestUrl } from '../config/app';
import { isNewerVersion, isValidVersion, normalizeVersion } from '../utils/version';
import { fetchJsonWithRetry } from './http';
import { withCacheBust } from './metaRemote';

/** 清单只有几十字节：4 秒足够，失败不重试（下次启动或手动点一次即可） */
export const WEB_CHECK_TIMEOUT_MS = 4000;

/**
 * 版本检测的统一结果形状。
 *
 * 原生壳走 `updateChecker.checkForUpdate()`（APK 下载引导），Web 走本模块，
 * 设置页只认识这一种结果，界面代码不用分叉。
 */
export interface UpdateCheckOutcome {
  status: 'update' | 'latest' | 'error';
  /** 当前构建的版本号 */
  current: string;
  /** 远端版本号，仅 status === 'update' 时有 */
  version?: string;
  /** 失败原因，仅排查用，不展示给用户 */
  reason?: string;
}

/** 网页版本清单结构 */
export interface WebVersionManifest {
  version: string;
  /** 构建时间（ISO 串），仅供排查，不参与比较 */
  buildTime?: string;
}

/** 校验并归一化清单；结构不对就抛错，交给上层收敛成 error */
export function parseWebVersionManifest(raw: unknown): WebVersionManifest {
  const source = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : null;
  const version = normalizeVersion(typeof source?.version === 'string' ? source.version : '');
  if (!version || !isValidVersion(version)) throw new Error('version.json 缺少有效 version');

  return {
    version,
    buildTime: typeof source?.buildTime === 'string' ? source.buildTime : undefined,
  };
}

/** 拉一次线上清单（强制回源），失败返回 null */
export async function fetchWebVersionManifest(): Promise<WebVersionManifest | null> {
  try {
    const { data } = await fetchJsonWithRetry<unknown>(withCacheBust(webVersionManifestUrl()), {
      timeoutMs: WEB_CHECK_TIMEOUT_MS,
      retries: 0,
    });
    return parseWebVersionManifest(data);
  } catch {
    return null;
  }
}

/**
 * 对比线上版本与当前构建版本。
 * 远端更高 → update；相同或更低 → latest；拿不到清单 → error。
 */
export async function checkWebUpdate(): Promise<UpdateCheckOutcome> {
  const current = APP_VERSION;
  const manifest = await fetchWebVersionManifest();
  if (!manifest) return { status: 'error', current, reason: '版本清单获取失败' };

  return isNewerVersion(manifest.version, current)
    ? { status: 'update', current, version: manifest.version }
    : { status: 'latest', current };
}
