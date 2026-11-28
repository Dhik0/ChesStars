/**
 * 「BP 与复盘设置」里的界面偏好 + 「重置设置」用的偏好清单。
 *
 * 与 themeStore 同一套约定：读写走纯函数 + 注入 storage，单测不需要 jsdom。
 * 偏好只影响展示层，不碰算分引擎与对局数据。
 * 旧存储里残留的进阶开关键不再读取，会被直接忽略。
 */

export const PREFS_HIDE_BLOCKED_KEY = 'brawl.draft.prefs.hideBlocked';
/** 屏蔽名单与 utils/blockedBrawlers 共用同一个键和同一份数据（正整数 ID 数组） */
export const PREFS_BLOCKED_BRAWLERS_KEY = 'brawl.draft.blockedBrawlers';

export interface DisplayPrefs {
  /** 己方选人阶段，推荐栏是否跳过个人屏蔽名单（默认开 = 保持原行为） */
  hideBlocked: boolean;
}

export const DEFAULT_DISPLAY_PREFS: DisplayPrefs = {
  hideBlocked: true,
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
  };
}

export function writeDisplayPrefs(storage: PrefsStorage | null, prefs: DisplayPrefs): void {
  if (!storage) return;
  try {
    storage.setItem(PREFS_HIDE_BLOCKED_KEY, String(prefs.hideBlocked));
  } catch {
    /* 写失败只影响「下次启动还记得」，本次会话照常生效 */
  }
}

/** 与 utils/blockedBrawlers 的 sanitize 同规则：只留正整数 ID、去重、保序 */
function sanitizeBlockedIds(raw: unknown): number[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<number>();
  const out: number[] = [];
  for (const value of raw) {
    if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) continue;
    if (seen.has(value)) continue;
    seen.add(value);
    out.push(value);
  }
  return out;
}

/** 读取屏蔽名单；JSON 损坏 / 存储不可用时返回空数组 */
export function readBlockedIds(storage: PrefsStorage | null): number[] {
  if (!storage) return [];
  try {
    const raw = storage.getItem(PREFS_BLOCKED_BRAWLERS_KEY);
    if (!raw) return [];
    return sanitizeBlockedIds(JSON.parse(raw) as unknown);
  } catch {
    return [];
  }
}

/** 批量写入屏蔽名单（设置页的批量屏蔽入口用） */
export function writeBlockedIds(storage: PrefsStorage | null, ids: number[]): void {
  if (!storage) return;
  try {
    storage.setItem(PREFS_BLOCKED_BRAWLERS_KEY, JSON.stringify(sanitizeBlockedIds(ids)));
  } catch {
    /* 写失败只影响下次启动，本次会话的内存状态仍然有效 */
  }
}

/** 清空屏蔽名单 */
export function clearBlockedIds(storage: PrefsStorage | null): void {
  writeBlockedIds(storage, []);
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
  PREFS_BLOCKED_BRAWLERS_KEY,
  PREFS_HIDE_BLOCKED_KEY,
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
