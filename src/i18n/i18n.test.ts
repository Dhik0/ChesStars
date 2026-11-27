import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { validateMeta, type BrawlMeta } from '../types/meta';
import { LANG_CHOICES, LANG_LABEL, LANGS, isLangChoice, matchLang } from './langs';
import { DICTS, translate } from './translate';
import {
  brawlerName,
  mapName,
  modeName,
  modeShortName,
  tierLabel,
} from './gameData';

/**
 * i18n 架构的守卫测试。
 *
 * 重点不是「某句翻译对不对」，而是三条结构性约束——它们一旦破了，
 * 社区认领翻译的人会拿到一份残缺模板：
 *   1. 三种语言的 key 集合必须完全一致；
 *   2. 同一个 key 的占位符必须一致（否则会漏参数或渲染出 `{n}`）；
 *   3. 游戏名词表必须覆盖数据里的全部英雄与地图。
 */

const META = validateMeta(
  JSON.parse(readFileSync(resolve(process.cwd(), 'public/data/brawl_meta.json'), 'utf-8')),
) as BrawlMeta;

const placeholders = (text: string): string[] =>
  [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]!).sort();

describe('词库结构', () => {
  it('三种语言的 key 集合完全一致', () => {
    const base = Object.keys(DICTS.en).sort();
    expect(Object.keys(DICTS['zh-CN']).sort()).toEqual(base);
    expect(Object.keys(DICTS['zh-TW']).sort()).toEqual(base);
  });

  it('没有空词条', () => {
    for (const lang of LANGS) {
      const empty = Object.entries(DICTS[lang])
        .filter(([, value]) => !value.trim())
        .map(([key]) => key);
      expect(empty, `${lang} 存在空词条`).toEqual([]);
    }
  });

  it('同一 key 的占位符在三种语言里一致', () => {
    const problems: string[] = [];
    for (const key of Object.keys(DICTS.en)) {
      const en = placeholders(DICTS.en[key]!);
      for (const lang of LANGS) {
        const other = placeholders(DICTS[lang][key] ?? '');
        if (other.join(',') !== en.join(',')) {
          problems.push(`${lang}:${key} → [${other}] ≠ [${en}]`);
        }
      }
    }
    expect(problems).toEqual([]);
  });

  it('未知 key 原样返回，缺参数时保留占位符', () => {
    expect(translate('en', 'no.such.key')).toBe('no.such.key');
    expect(translate('en', 'common.games', { n: 12 })).toContain('12');
    expect(translate('en', 'common.games')).toContain('{n}');
  });

  it('三种语言都有可读的语言自称', () => {
    expect(LANG_LABEL.en).toBe('English');
    expect(LANG_LABEL['zh-CN']).toBe('简体中文');
    expect(LANG_LABEL['zh-TW']).toBe('繁體中文');
  });

  it('语言悬浮选单固定为「跟随系统 → 简中 → 繁中 → English」四项', () => {
    expect(LANG_CHOICES).toEqual(['system', 'zh-CN', 'zh-TW', 'en']);
    for (const choice of LANG_CHOICES) expect(isLangChoice(choice)).toBe(true);
    expect(isLangChoice('fr')).toBe(false);
  });

  it('设置二级子页 / 偏好 / 重置词条三语齐全且不为空', () => {
    const keys = [
      'settings.sectionPreference',
      'settings.sectionGeneral',
      'settings.navAppearance',
      'settings.navDraft',
      'settings.navDraftHint',
      'settings.navData',
      'settings.languageHint',
      'settings.languageSystem',
      'settings.monetOnLabel',
      'settings.monetOffLabel',
      'settings.pageAppearance',
      'settings.pageDraft',
      'settings.pageData',
      'settings.themeDetails',
      'settings.draftSectionBlocked',
      'settings.draftSectionReview',
      'settings.draftBlocked',
      'settings.draftBlockedHint',
      'settings.draftBlockedCount',
      'settings.draftHideBlocked',
      'settings.draftHideBlockedHint',
      'settings.draftSfx',
      'settings.draftSfxHint',
      'settings.draftAdvanced',
      'settings.draftAdvancedHint',
      'settings.resetSection',
      'settings.reset',
      'settings.resetHint',
      'settings.resetConfirmHint',
      'settings.resetConfirm',
      'settings.resetCancel',
      'settings.resetDone',
    ];
    for (const key of keys) {
      for (const lang of LANGS) {
        expect(DICTS[lang][key]?.trim() ?? '', `${lang} 缺少 ${key}`).not.toBe('');
      }
    }
    // 唯一带参数的词条：三语都保留 {n}
    for (const lang of LANGS) {
      expect(DICTS[lang]['settings.draftBlockedCount']).toContain('{n}');
    }
  });
});

describe('语言检测', () => {
  it('繁体地区映射到 zh-TW', () => {
    for (const tag of ['zh-TW', 'zh-HK', 'zh-MO', 'zh-Hant', 'zh-Hant-TW']) {
      expect(matchLang(tag)).toBe('zh-TW');
    }
  });

  it('其余中文变体映射到 zh-CN', () => {
    for (const tag of ['zh', 'zh-CN', 'zh-Hans', 'zh-SG', 'zh-Hans-CN']) {
      expect(matchLang(tag)).toBe('zh-CN');
    }
  });

  it('非中文语言一律回落到 en', () => {
    for (const tag of ['en-US', 'ja-JP', 'ko-KR', 'de', 'fr-FR', '', null, undefined]) {
      expect(matchLang(tag)).toBe('en');
    }
  });
});

describe('游戏名词表覆盖率', () => {
  it('数据里的每个英雄都有简中 / 繁中译名', () => {
    const missing = META.brawlers.filter(
      (b) => brawlerName('zh-CN', b.name) === b.name || brawlerName('zh-TW', b.name) === b.name,
    );
    expect(missing.map((b) => b.name)).toEqual([]);
  });

  it('数据里的每张地图都有简中 / 繁中译名', () => {
    const missing = META.maps.filter(
      (m) => mapName('zh-CN', m.map_name) === m.map_name || mapName('zh-TW', m.map_name) === m.map_name,
    );
    expect(missing.map((m) => m.map_name)).toEqual([]);
  });

  it('英文模式下保留官方英文原名', () => {
    expect(brawlerName('en', 'CROW')).toBe('CROW');
    expect(mapName('en', 'Shooting Star')).toBe('Shooting Star');
  });

  it('国服与国际服译名差异按语言分别解析', () => {
    // 黑鸦（国服） / 鴉（国际服繁中）
    expect(brawlerName('zh-CN', 'CROW')).toBe('黑鸦');
    expect(brawlerName('zh-TW', 'CROW')).toBe('鴉');
    // 麦乐迪（国服） / 美樂蒂（国际服繁中）
    expect(brawlerName('zh-CN', 'MELODIE')).toBe('麦乐迪');
    expect(brawlerName('zh-TW', 'MELODIE')).toBe('美樂蒂');
  });

  it('未收录的名字优雅回退原文', () => {
    expect(brawlerName('zh-CN', 'NOT A BRAWLER')).toBe('NOT A BRAWLER');
    expect(mapName('zh-TW', 'Unknown Map')).toBe('Unknown Map');
  });

  it('模式全名 / 短名按语言解析', () => {
    expect(modeName('zh-CN', 'brawlBall')).toBe('乱斗足球');
    expect(modeName('en', 'brawlBall')).toBe('Brawl Ball');
    expect(modeName('zh-TW', 'brawlBall')).toBe('亂鬥足球');
    expect(modeShortName('zh-CN', 'brawlBall')).toBe('足球');
    // 未知模式回退成原字符串，不会渲染成 key
    expect(modeName('en', 'unknownMode')).toBe('unknownMode');
  });

  it('段位标签只翻译段位名，罗马数字原样保留', () => {
    expect(tierLabel('en', '传奇 I')).toBe('Legendary I');
    expect(tierLabel('zh-TW', '大师 III')).toBe('大師 III');
    expect(tierLabel('zh-CN', '职业')).toBe('职业');
    expect(tierLabel('en', '自定义段位')).toBe('自定义段位');
  });
});
