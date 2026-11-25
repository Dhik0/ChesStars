/**
 * 支持的语言与语言检测 / 持久化。
 *
 * 这里刻意不引第三方 i18n 库：需求只有「查表 + 插值 + 切换」，自己写 40 行
 * 比多一个依赖更可控，也让包体积保持在 Capacitor 壳里的理想范围。
 *
 * 新增一门语言（社区认领）只需三步：
 *   1. 复制 `locales/en.json` 为 `locales/xx.json` 并逐条翻译；
 *   2. 在下面的 `Lang` / `LANGS` / `LANG_LABEL` 里登记；
 *   3. 在 `translate.ts` 的 `DICTS` 里挂上这份 JSON。
 * 游戏名词（英雄 / 地图）见 `gameData.ts` 顶部的说明。
 */

export type Lang = 'en' | 'zh-CN' | 'zh-TW';

/** 首期支持的语言（顺序即设置页选择器的展示顺序） */
export const LANGS: readonly Lang[] = ['en', 'zh-CN', 'zh-TW'];

/**
 * 检测不到任何线索时的兜底语言。
 *
 * 首次启动只认系统语言：繁体地区（zh-TW / zh-HK / zh-MO）走繁中，简中地区走简中，
 * 其余一切地区一律英文——所以兜底也必须是英文，不能落在简中上。
 */
export const DEFAULT_LANG: Lang = 'en';

/**
 * 语言选择器上的文案：各语言用**自己的写法**，不做翻译。
 * 这样用户在完全看不懂当前界面时也能认出母语入口。
 */
export const LANG_LABEL: Record<Lang, string> = {
  en: 'English',
  'zh-CN': '简体中文',
  'zh-TW': '繁體中文',
};

/** 手动选择的持久化键（与 `brawl.draft.map` 同一命名空间） */
export const LANG_STORAGE_KEY = 'brawl.draft.lang';

export function isLang(value: unknown): value is Lang {
  return value === 'en' || value === 'zh-CN' || value === 'zh-TW';
}

/**
 * BCP-47 标签 → 支持的语言。
 *
 * 规则（与需求一致）：
 *   - `zh-Hant` / `zh-TW` / `zh-HK` / `zh-MO` 及其变体 → 繁体（国际服译名）
 *   - 其余 `zh*`（zh、zh-CN、zh-Hans、zh-SG…）→ 简体
 *   - 其他一切语言 → 英文
 */
export function matchLang(tag: string | null | undefined): Lang {
  const raw = (tag ?? '').trim().toLowerCase();
  if (!raw) return 'en';
  if (raw.startsWith('zh')) {
    const traditional =
      raw.includes('hant') ||
      raw.includes('-tw') ||
      raw.includes('-hk') ||
      raw.includes('-mo');
    return traditional ? 'zh-TW' : 'zh-CN';
  }
  return 'en';
}

/** 读取用户手动选择；没有或读不到时返回 null */
export function readSavedLang(): Lang | null {
  if (typeof window === 'undefined') return null;
  try {
    const value = window.localStorage.getItem(LANG_STORAGE_KEY);
    return isLang(value) ? value : null;
  } catch {
    // 隐私模式 / 存储被禁用：当作没选过
    return null;
  }
}

/** 记住手动选择；写失败不影响本次会话 */
export function saveLang(lang: Lang): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(LANG_STORAGE_KEY, lang);
  } catch {
    /* 存储不可用：本次会话内仍然生效 */
  }
}

/**
 * 自动检测：手动选择 > 系统语言 > 兜底。
 * 只取系统语言列表的**首项**——用户装了多语言系统时，首项才是他真正在用的语言。
 */
export function detectLang(): Lang {
  const saved = readSavedLang();
  if (saved) return saved;
  if (typeof navigator === 'undefined') return DEFAULT_LANG;
  const primary = navigator.languages?.[0] ?? navigator.language;
  return primary ? matchLang(primary) : DEFAULT_LANG;
}
