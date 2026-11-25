import en from './locales/en.json';
import zhCN from './locales/zh-CN.json';
import zhTW from './locales/zh-TW.json';
import { DEFAULT_LANG, type Lang } from './langs';

/**
 * 词库查表 + 插值。
 *
 * 这一层刻意保持**纯函数、无 React**：算分引擎（`utils/draftEngine.ts`）也要用同一套
 * 文案，如果把它绑在 Context 上，引擎就只能靠全局状态拿翻译，单测会变得不可控。
 */

export type TParams = Record<string, string | number>;
/** 翻译函数签名：`t('common.games', { n: 12 })` */
export type Translator = (key: string, params?: TParams) => string;

export type Dictionary = Record<string, string>;

export const DICTS: Record<Lang, Dictionary> = {
  en,
  'zh-CN': zhCN,
  'zh-TW': zhTW,
};

/** `{name}` 形式的占位符；缺参数时原样保留，便于一眼看出漏传 */
function interpolate(template: string, params?: TParams): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (whole, key: string) =>
    Object.prototype.hasOwnProperty.call(params, key) ? String(params[key]) : whole,
  );
}

/**
 * 取词条：当前语言 → 英文 → 简体 → key 本身。
 *
 * 英文作为第二兜底，是因为 `en.json` 是词条结构的事实基准：新增 key 时先有英文，
 * 其他语言缺失也不会把界面渲染成一片 `settings.xxx`。
 */
export function translate(lang: Lang, key: string, params?: TParams): string {
  const raw =
    DICTS[lang]?.[key] ??
    DICTS.en[key] ??
    DICTS[DEFAULT_LANG][key] ??
    key;
  return interpolate(raw, params);
}

/** 把语言绑定成 `t`，供 Context 与算分引擎复用 */
export function translatorFor(lang: Lang): Translator {
  return (key, params) => translate(lang, key, params);
}
