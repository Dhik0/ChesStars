import { describe, expect, it } from 'vitest';
import {
  DEFAULT_DISPLAY_PREFS,
  PREFERENCE_KEYS,
  PREFS_ADVANCED_TOOLS_KEY,
  PREFS_HIDE_BLOCKED_KEY,
  readDisplayPrefs,
  resetPreferences,
  writeDisplayPrefs,
  type PrefsStorage,
} from './prefsStore';

/** 最小 storage 替身：单测跑在 node，不需要 jsdom */
function fakeStorage(initial: Record<string, string> = {}): PrefsStorage & {
  data: Map<string, string>;
} {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => {
      data.set(key, value);
    },
    removeItem: (key) => {
      data.delete(key);
    },
  };
}

describe('界面偏好读写', () => {
  it('没存过时保持原行为：隐藏已屏蔽英雄 + 进阶入口常开', () => {
    expect(readDisplayPrefs(null)).toEqual(DEFAULT_DISPLAY_PREFS);
    expect(readDisplayPrefs(fakeStorage())).toEqual({ hideBlocked: true, advancedTools: true });
  });

  it('写入后能原样读回', () => {
    const storage = fakeStorage();
    writeDisplayPrefs(storage, { hideBlocked: false, advancedTools: false });
    expect(storage.getItem(PREFS_HIDE_BLOCKED_KEY)).toBe('false');
    expect(storage.getItem(PREFS_ADVANCED_TOOLS_KEY)).toBe('false');
    expect(readDisplayPrefs(storage)).toEqual({ hideBlocked: false, advancedTools: false });
  });

  it('脏值不会被 Boolean() 陷阱读成 true', () => {
    const storage = fakeStorage({
      [PREFS_HIDE_BLOCKED_KEY]: 'false',
      [PREFS_ADVANCED_TOOLS_KEY]: 'yes',
    });
    expect(readDisplayPrefs(storage)).toEqual({ hideBlocked: false, advancedTools: true });
  });
});

describe('重置设置', () => {
  it('只清偏好键，战绩 / 元数据 / BP 地图一个都不动', () => {
    const storage = fakeStorage({
      ...Object.fromEntries(PREFERENCE_KEYS.map((k) => [k, 'x'])),
      'brawl.draft.matchHistory': 'keep',
      'brawl.draft.map': 'keep',
      'brawl.draft.metaCache': 'keep',
    });
    const removed = resetPreferences(storage);

    expect(removed).toBe(PREFERENCE_KEYS.length);
    for (const key of PREFERENCE_KEYS) expect(storage.getItem(key)).toBeNull();
    expect(storage.getItem('brawl.draft.matchHistory')).toBe('keep');
    expect(storage.getItem('brawl.draft.map')).toBe('keep');
    expect(storage.getItem('brawl.draft.metaCache')).toBe('keep');
  });

  it('清完后偏好回落到默认，存储不可用时不抛错', () => {
    const storage = fakeStorage({ [PREFS_HIDE_BLOCKED_KEY]: 'false' });
    resetPreferences(storage);
    expect(readDisplayPrefs(storage)).toEqual(DEFAULT_DISPLAY_PREFS);
    expect(resetPreferences(null)).toBe(0);
  });

  it('偏好清单覆盖主题、语言、音效与屏蔽名单', () => {
    expect(PREFERENCE_KEYS).toEqual(
      expect.arrayContaining([
        'brawl.draft.themeMode',
        'brawl.draft.darkPalette',
        'brawl.draft.monetEnabled',
        'brawl.draft.accentColor',
        'brawl.draft.lang',
        'brawl.draft.sfxMuted',
        'brawl.draft.blockedBrawlers',
      ]),
    );
  });
});
