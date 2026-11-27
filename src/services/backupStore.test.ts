import { describe, expect, it } from 'vitest';
import { LANG_STORAGE_KEY } from '../i18n/langs';
import {
  BACKUP_SCHEMA,
  BACKUP_VERSION,
  DEFAULT_BACKUP_PREFS,
  applyBackup,
  backupFileName,
  buildBackup,
  parseBackup,
  readBackupPrefs,
  type BackupPrefs,
} from './backupStore';
import { MATCH_HISTORY_STORAGE_KEY, createMatchRecord } from './matchHistoryStore';
import {
  ACCENT_COLOR_KEY,
  DARK_PALETTE_KEY,
  MONET_ENABLED_KEY,
  THEME_MODE_KEY,
} from './themeStore';

/**
 * 备份文件的单测。
 *
 * 重点在「坏文件绝不能清空用户数据」：`parseBackup` 必须是纯的，
 * 校验不通过时一个字节都不写；`applyBackup` 才是唯一的写入点。
 */

const PREFS: BackupPrefs = {
  themeMode: 'light',
  darkPalette: 'navy',
  monetEnabled: true,
  accentColor: 'violet',
  lang: 'zh-TW',
};

function sampleRecord(now = 1_700_000_000_000) {
  return createMatchRecord({
    mapId: 'Shooting Star',
    mode: 'bounty',
    firstPick: 'ally',
    bans: ['16000000'],
    allyPicks: [{ brawlerId: '16000000', pickOrder: 1 }],
    enemyPicks: [{ brawlerId: '16000001', pickOrder: 2 }],
    now,
  });
}

function fakeStorage(options: { fail?: boolean } = {}) {
  const data = new Map<string, string>();
  return {
    data,
    setItem(key: string, value: string) {
      if (options.fail) throw new Error('quota exceeded');
      data.set(key, value);
    },
  };
}

describe('buildBackup', () => {
  it('生成带 schema 与版本的完整结构', () => {
    const record = sampleRecord();
    const file = buildBackup({
      records: [record],
      prefs: PREFS,
      appVersion: '1.3.3',
      now: 1_700_000_000_000,
    });

    expect(file.schema).toBe(BACKUP_SCHEMA);
    expect(file.version).toBe(BACKUP_VERSION);
    expect(file.appVersion).toBe('1.3.3');
    expect(file.exportedAt).toBe(new Date(1_700_000_000_000).toISOString());
    expect(file.records).toHaveLength(1);
    expect(file.records[0]!.id).toBe(record.id);
    expect(file.prefs).toEqual(PREFS);
  });

  it('导出的记录已经归一化，脏数据不会带进文件', () => {
    const file = buildBackup({
      records: [{ nope: true } as never],
      prefs: PREFS,
      appVersion: '1.3.3',
    });
    expect(file.records).toEqual([]);
  });
});

describe('parseBackup：合法文件', () => {
  it('能读回自己导出的文件', () => {
    const record = sampleRecord();
    const raw = JSON.stringify(
      buildBackup({ records: [record], prefs: PREFS, appVersion: '1.3.3' }),
    );

    const parsed = parseBackup(raw);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.file.records).toHaveLength(1);
    expect(parsed.file.records[0]!.mapId).toBe('Shooting Star');
    expect(parsed.file.prefs).toEqual(PREFS);
  });

  it('空战绩也是合法备份（只恢复偏好）', () => {
    const raw = JSON.stringify(
      buildBackup({ records: [], prefs: PREFS, appVersion: '1.3.3' }),
    );
    const parsed = parseBackup(raw);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.file.records).toEqual([]);
  });
});

describe('parseBackup：坏文件', () => {
  it('不是 JSON', () => {
    expect(parseBackup('not json at all')).toEqual({ ok: false, reason: 'json' });
  });

  it('不是本应用的备份', () => {
    expect(parseBackup(JSON.stringify({ hello: 'world' }))).toEqual({
      ok: false,
      reason: 'schema',
    });
    expect(parseBackup('[]')).toEqual({ ok: false, reason: 'schema' });
  });

  it('缺版本号', () => {
    expect(parseBackup(JSON.stringify({ schema: BACKUP_SCHEMA, records: [] }))).toEqual({
      ok: false,
      reason: 'schema',
    });
  });

  it('来自更新版本的应用', () => {
    expect(
      parseBackup(
        JSON.stringify({ schema: BACKUP_SCHEMA, version: BACKUP_VERSION + 1, records: [] }),
      ),
    ).toEqual({ ok: false, reason: 'version' });
  });

  it('records 不是数组', () => {
    expect(
      parseBackup(JSON.stringify({ schema: BACKUP_SCHEMA, version: 1, records: 'oops' })),
    ).toEqual({ ok: false, reason: 'records' });
  });

  it('有记录但一条都认不出（等同于清空数据，必须拒绝）', () => {
    expect(
      parseBackup(
        JSON.stringify({ schema: BACKUP_SCHEMA, version: 1, records: [{ bad: 1 }, { bad: 2 }] }),
      ),
    ).toEqual({ ok: false, reason: 'records' });
  });
});

describe('readBackupPrefs', () => {
  it('缺字段 / 脏字段逐项回落默认值', () => {
    expect(readBackupPrefs(undefined)).toEqual(DEFAULT_BACKUP_PREFS);
    expect(readBackupPrefs({ themeMode: 'sepia', accentColor: 'neon', lang: 'ja' })).toEqual(
      DEFAULT_BACKUP_PREFS,
    );
  });

  it('合法字段照原样保留', () => {
    expect(readBackupPrefs(PREFS)).toEqual(PREFS);
  });
});

describe('applyBackup', () => {
  it('把战绩与全部偏好写进对应的存储键', () => {
    const storage = fakeStorage();
    const file = buildBackup({ records: [sampleRecord()], prefs: PREFS, appVersion: '1.3.3' });

    expect(applyBackup(file, storage)).toBe(true);

    const history = JSON.parse(storage.data.get(MATCH_HISTORY_STORAGE_KEY) ?? '{}') as {
      records?: unknown[];
    };
    expect(history.records).toHaveLength(1);
    expect(storage.data.get(THEME_MODE_KEY)).toBe('light');
    expect(storage.data.get(DARK_PALETTE_KEY)).toBe('navy');
    expect(storage.data.get(MONET_ENABLED_KEY)).toBe('true');
    expect(storage.data.get(ACCENT_COLOR_KEY)).toBe('violet');
    expect(storage.data.get(LANG_STORAGE_KEY)).toBe('zh-TW');
  });

  it('写失败时返回 false，由调用方提示用户', () => {
    const file = buildBackup({ records: [], prefs: PREFS, appVersion: '1.3.3' });
    expect(applyBackup(file, fakeStorage({ fail: true }))).toBe(false);
  });
});

describe('backupFileName', () => {
  it('按本地日期命名，天然有序', () => {
    expect(backupFileName(new Date(2026, 0, 5, 10, 30).getTime())).toBe(
      'chesstars-backup-2026-01-05.json',
    );
  });
});
