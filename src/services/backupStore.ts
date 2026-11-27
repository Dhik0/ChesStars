import { DEFAULT_LANG, LANG_STORAGE_KEY, isLang, type Lang } from '../i18n/langs';
import {
  MATCH_HISTORY_SCHEMA_VERSION,
  MATCH_HISTORY_STORAGE_KEY,
  normalizeMatchList,
  type MatchRecord,
} from './matchHistoryStore';
import {
  ACCENT_COLOR_KEY,
  DARK_PALETTE_KEY,
  MONET_ENABLED_KEY,
  THEME_MODE_KEY,
  isAccentColor,
  isDarkPalette,
  isThemeMode,
  type AccentColor,
  type DarkPalette,
  type ThemeMode,
} from './themeStore';

/**
 * 本地备份：把「战绩记录 + 外观/语言偏好」打包成一个 JSON 文件，也能反向恢复。
 *
 * 为什么需要它：这个应用所有数据都只存在本机 localStorage 里——换机、重装、
 * 清理缓存都会一次性丢掉全部战绩。备份文件是唯一能把数据带走的通道。
 *
 * 三条硬约束：
 *   1. **导入即覆盖**：语义是「恢复到备份那一刻」，不是合并。合并会让同一局
 *      出现两份（ID 相同也会因为时间戳不同变成两条），比覆盖更难收拾。
 *   2. **先校验再落盘**：`parseBackup` 只读不写，格式不对时一个字都不写进存储，
 *      用户的现有数据不会因为导入了一个错文件而消失。
 *   3. **偏好逐项兜底**：记录必须整体合法，偏好则逐字段回落默认值——
 *      文件来自旧版本时不该因为少一个字段就整份拒绝。
 */

export const BACKUP_SCHEMA = 'chesstars.backup';
export const BACKUP_VERSION = 1;

/** 备份文件里携带的偏好设置 */
export interface BackupPrefs {
  themeMode: ThemeMode;
  darkPalette: DarkPalette;
  monetEnabled: boolean;
  accentColor: AccentColor;
  lang: Lang;
}

export interface BackupFile {
  schema: string;
  version: number;
  exportedAt: string;
  appVersion: string;
  records: MatchRecord[];
  prefs: BackupPrefs;
}

/** 偏好缺字段时的兜底：与 themeStore / langs 的默认值保持一致 */
export const DEFAULT_BACKUP_PREFS: BackupPrefs = {
  themeMode: 'dark',
  darkPalette: 'oled',
  monetEnabled: false,
  accentColor: 'sky',
  lang: DEFAULT_LANG,
};

/** 导入失败的原因分类，界面据此给不同提示（都只说结论，不暴露内部结构） */
export type BackupParseError = 'json' | 'schema' | 'version' | 'records';

export type BackupParseResult =
  | { ok: true; file: BackupFile }
  | { ok: false; reason: BackupParseError };

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/** 生成备份内容。记录先过一遍归一化，导出的文件永远是自己能读回来的形状 */
export function buildBackup(input: {
  records: MatchRecord[];
  prefs: BackupPrefs;
  appVersion: string;
  now?: number;
}): BackupFile {
  const now = input.now ?? Date.now();
  return {
    schema: BACKUP_SCHEMA,
    version: BACKUP_VERSION,
    exportedAt: new Date(now).toISOString(),
    appVersion: input.appVersion,
    records: normalizeMatchList(input.records),
    prefs: { ...input.prefs },
  };
}

/** 偏好逐字段校验：认不出的字段各自回落，不影响其它字段 */
export function readBackupPrefs(raw: unknown): BackupPrefs {
  const src = isObj(raw) ? raw : {};
  return {
    themeMode: isThemeMode(src.themeMode) ? src.themeMode : DEFAULT_BACKUP_PREFS.themeMode,
    darkPalette: isDarkPalette(src.darkPalette)
      ? src.darkPalette
      : DEFAULT_BACKUP_PREFS.darkPalette,
    monetEnabled:
      typeof src.monetEnabled === 'boolean'
        ? src.monetEnabled
        : DEFAULT_BACKUP_PREFS.monetEnabled,
    accentColor: isAccentColor(src.accentColor)
      ? src.accentColor
      : DEFAULT_BACKUP_PREFS.accentColor,
    lang: isLang(src.lang) ? src.lang : DEFAULT_BACKUP_PREFS.lang,
  };
}

/**
 * 校验并解析备份文件（**纯函数，不写任何存储**）。
 *
 * 拒绝的情形：
 *   - 不是合法 JSON                → json
 *   - 不是本应用的备份 / 缺版本号   → schema
 *   - 备份来自更新版本的应用        → version
 *   - 没有 records 数组，或数组里一条都认不出 → records
 */
export function parseBackup(raw: string): BackupParseResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    return { ok: false, reason: 'json' };
  }
  if (!isObj(parsed)) return { ok: false, reason: 'schema' };
  if (parsed.schema !== BACKUP_SCHEMA) return { ok: false, reason: 'schema' };

  const version = typeof parsed.version === 'number' ? parsed.version : Number.NaN;
  if (!Number.isFinite(version) || version < 1) return { ok: false, reason: 'schema' };
  if (version > BACKUP_VERSION) return { ok: false, reason: 'version' };

  if (!Array.isArray(parsed.records)) return { ok: false, reason: 'records' };
  const records = normalizeMatchList(parsed.records);
  // 文件里有记录但一条都没通过校验：多半是别的应用的文件或严重损坏，
  // 这种时候静默导入等于清空用户现有战绩，必须拒绝。
  if (parsed.records.length > 0 && records.length === 0) {
    return { ok: false, reason: 'records' };
  }

  return {
    ok: true,
    file: {
      schema: BACKUP_SCHEMA,
      version,
      exportedAt: typeof parsed.exportedAt === 'string' ? parsed.exportedAt : '',
      appVersion: typeof parsed.appVersion === 'string' ? parsed.appVersion : '',
      records,
      prefs: readBackupPrefs(parsed.prefs),
    },
  };
}

/** 落盘目标：注入 localStorage，单测里换成假实现 */
export interface BackupTargetStorage {
  setItem(key: string, value: string): void;
}

/**
 * 把解析好的备份写进存储（覆盖战绩与全部偏好）。
 *
 * 写失败（配额满 / 隐私模式）返回 false——此时存储里可能只写进了一半，
 * 调用方应提示「导入失败」并让用户重启应用，而不是假装成功。
 */
export function applyBackup(file: BackupFile, storage: BackupTargetStorage): boolean {
  try {
    storage.setItem(
      MATCH_HISTORY_STORAGE_KEY,
      JSON.stringify({
        schemaVersion: MATCH_HISTORY_SCHEMA_VERSION,
        records: file.records,
      }),
    );
    storage.setItem(THEME_MODE_KEY, file.prefs.themeMode);
    storage.setItem(DARK_PALETTE_KEY, file.prefs.darkPalette);
    storage.setItem(MONET_ENABLED_KEY, file.prefs.monetEnabled ? 'true' : 'false');
    storage.setItem(ACCENT_COLOR_KEY, file.prefs.accentColor);
    storage.setItem(LANG_STORAGE_KEY, file.prefs.lang);
    return true;
  } catch {
    return false;
  }
}

/** 导出文件名：`chesstars-backup-2026-11-27.json`，按日期排序天然有序 */
export function backupFileName(now = Date.now()): string {
  const d = new Date(now);
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `chesstars-backup-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}.json`;
}
