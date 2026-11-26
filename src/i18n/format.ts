import { MetaLoadError, type PullResult } from '../services/metaStore';
import type { Translator } from './translate';

/**
 * 数据拉取结果 → 一句给用户看的话。
 *
 * 服务层只回结构化结果（`code` + 数据），文案在这里组装：
 * 这样「拉取」这件事与界面语言彻底解耦，服务层不需要认识任何语言。
 */
export function pullMessage(
  result: PullResult,
  t: Translator,
  formatNumber: (n: number) => string,
): string {
  const battles = result.battles !== undefined ? formatNumber(result.battles) : '';
  const params = { date: result.date ?? '', n: battles };

  switch (result.code) {
    case 'latest':
      return t('pull.latest', params);
    case 'updated':
      return result.persisted === false
        ? t('pull.updatedNoPersist', params)
        : t('pull.updated', params);
    case 'failed':
      return t('pull.failed');
    case 'notReady':
    default:
      return t('pull.notReady');
  }
}

/**
 * 首屏加载失败的原因 → 一句短话（超时 / 断网 / 状态码 / 文件损坏）。
 *
 * 只讲现象不讲链路：用户看到「连接超时」知道该重试，看到「服务器返回 404」
 * 知道该反馈，不需要知道三段式降级、CDN 或 IndexedDB 这些内部细节。
 */
export function loadErrorMessage(error: unknown, t: Translator): string | null {
  if (!(error instanceof MetaLoadError)) return null;

  switch (error.kind) {
    case 'timeout':
      return t('error.timeout');
    case 'offline':
      return t('error.offline');
    case 'http':
      return t('error.http', { code: String(error.status ?? '') });
    case 'invalid':
      return t('error.invalid');
    case 'unknown':
    default:
      return t('error.unknown');
  }
}
