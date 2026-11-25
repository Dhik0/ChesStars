import type { PullResult } from '../services/metaStore';
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
