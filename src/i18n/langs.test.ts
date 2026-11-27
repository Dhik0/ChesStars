// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import {
  LANG_CHOICES,
  LANG_STORAGE_KEY,
  clearSavedLang,
  detectLang,
  isLangChoice,
  readLangChoice,
  readSavedLang,
  saveLang,
  systemLang,
} from './langs';

/**
 * 「跟随系统」这一项的守卫：选单要能记住手动选择，也要能彻底清掉它。
 * 这几条直接影响悬浮语言选单里那个 ✓ 落在哪一行。
 */

afterEach(() => {
  window.localStorage.clear();
});

describe('语言选单项', () => {
  it('顺序固定：跟随系统 → 简中 → 繁中 → English', () => {
    expect(LANG_CHOICES).toEqual(['system', 'zh-CN', 'zh-TW', 'en']);
    for (const choice of LANG_CHOICES) expect(isLangChoice(choice)).toBe(true);
    expect(isLangChoice('ja')).toBe(false);
  });

  it('没有手动选择时当前项是跟随系统', () => {
    expect(readSavedLang()).toBeNull();
    expect(readLangChoice()).toBe('system');
  });

  it('手动选择后当前项就是那门语言', () => {
    saveLang('zh-TW');
    expect(readLangChoice()).toBe('zh-TW');
    expect(detectLang()).toBe('zh-TW');
  });

  it('选回跟随系统会清掉记忆，并立刻按系统语言渲染', () => {
    saveLang('zh-CN');
    clearSavedLang();
    expect(window.localStorage.getItem(LANG_STORAGE_KEY)).toBeNull();
    expect(readLangChoice()).toBe('system');
    expect(detectLang()).toBe(systemLang());
  });

  it('存储里的脏值当作没选过', () => {
    window.localStorage.setItem(LANG_STORAGE_KEY, 'klingon');
    expect(readSavedLang()).toBeNull();
    expect(readLangChoice()).toBe('system');
  });
});
