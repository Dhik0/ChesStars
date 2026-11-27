/**
 * 「BP 与复盘设置」里的两项界面偏好 + 「重置设置」用的偏好清单。
 *
 * 与 themeStore 同一套约定：读写走纯函数 + 注入 storage，单测不需要 jsdom。
 * 偏好只影响展示层，不碰算分引擎与对局数据。
 */

export const PREFS_HIDE_BLOCKED_KEY = 'brawl.draft.prefs.hideBlocked';
export const PREFS_ADVANCED_TOOLS_KEY = 'brawl.draft.prefs.advancedTools';

export interface DisplayPrefs {
  /** 己方选人阶段，推荐栏是否跳过个人屏蔽名单（默认开 = 保持原行为） */
  hideBlocked: boolean;
  /** 空 Ban 入口与「查看算分明细」这类进阶入口是否显示（默认开） */
  advancedTools: boolean;
}

export const DEFAULT_DISPLAY_PREFS: DisplayPrefs = {
  hideBlocked: true,
  advancedTools: true,
};

export interface PrefsStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** 只认 'true' / 'false'，脏值一律回落默认，避免 Boolean('false') 陷阱 */
function readBool(raw: string | null, fallback: boolean): boolean {
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  return fallback;
}

/** 读不到存储（隐私模式 / node 单测）时全部按默认 */
export function readDisplayPrefs(storage: PrefsStorage | null): DisplayPrefs {
  if (!storage) return { ...DEFAULT_DISPLAY_PREFS };
  return {
    hideBlocked: readBool(storage.getItem(PREFS_HIDE_BLOCKED_KEY), DEFAULT_DISPLAY_PREFS.hideBlocked),
    advancedTools: readBool(
      storage.getItem(PREFS_ADVANCED_TOOLS_KEY),
      DEFAULT_DISPLAY_PREFS.advancedTools,
    ),
  };
}

export function writeDisplayPrefs(storage: PrefsStorage | null, prefs: DisplayPrefs): void {
  if (!storage) return;
  try {
    storage.setItem(PREFS_HIDE_BLOCKED_KEY, String(prefs.hideBlocked));
    storage.setItem(PREFS_ADVANCED_TOOLS_KEY, String(prefs.advancedTools));
  } catch {
    /* 写失败只影响「下次启动还记得」，本次会话照常生效 */
  }
}

export function browserPrefsStorage(): PrefsStorage | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/**
 * 「重置设置」要清掉的全部键。
 *
 * 只清偏好：战绩、BP 进度、元数据缓存都不属于「设置」，一律保留。
 * 清完后由调用方重新载入页面，让主题 / 语言 / 屏蔽名单等各处内存状态同步回落默认。
 */
export const PREFERENCE_KEYS: readonly string[] = [
  'brawl.draft.themeMode',
  'brawl.draft.darkPalette',
  'brawl.draft.monetEnabled',
  'brawl.draft.accentColor',
  'brawl.draft.lang',
  'brawl.draft.sfxMuted',
  'brawl.draft.blockedBrawlers',
  PREFS_HIDE_BLOCKED_KEY,
  PREFS_ADVANCED_TOOLS_KEY,
];

/** 返回成功清掉的键的数量（存储不可用时为 0） */
export function resetPreferences(storage: PrefsStorage | null): number {
  if (!storage) return 0;
  let removed = 0;
  for (const key of PREFERENCE_KEYS) {
    try {
      storage.removeItem(key);
      removed += 1;
    } catch {
      /* 单个键写保护不影响其它键 */
    }
  }
  return removed;
}
