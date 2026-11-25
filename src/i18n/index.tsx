import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { detectLang, saveLang, type Lang } from './langs';
import { translate, type TParams, type Translator } from './translate';
import {
  brawlerName,
  mapName,
  modeName,
  modeShortName,
  tierLabel,
} from './gameData';

/**
 * 轻量 i18n 上下文。
 *
 * 只做四件事：当前语言、切换语言（写 localStorage）、`t()` 查表、以及把游戏名词
 * （英雄 / 地图 / 模式 / 段位）包成当前语言的取值函数。没有加载器、没有异步词库，
 * 三个 JSON 随包一起进 bundle——这是移动端离线可用的前提。
 */
export interface I18n {
  lang: Lang;
  /** 切换语言：立即全局生效并写入 localStorage */
  setLang: (lang: Lang) => void;
  t: Translator;
  /** 英雄显示名（传英文原名） */
  brawler: (englishName: string) => string;
  /** 地图显示名（传数据里的英文地图名） */
  map: (englishMapName: string) => string;
  /** 模式全名 */
  mode: (mode: string) => string;
  /** 模式短名 */
  modeShort: (mode: string) => string;
  /** 段位标签（把数据里的中文段位翻成当前语言） */
  tier: (rawLabel: string) => string;
  /** 按当前语言做千分位格式化 */
  num: (value: number) => string;
}

const I18nContext = createContext<I18n | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  // 首次渲染就用检测结果，避免「先中文再闪成英文」
  const [lang, setLangState] = useState<Lang>(() => detectLang());

  const setLang = useCallback((next: Lang) => {
    setLangState(next);
    saveLang(next);
  }, []);

  const value = useMemo<I18n>(() => {
    const t: Translator = (key: string, params?: TParams) => translate(lang, key, params);
    return {
      lang,
      setLang,
      t,
      brawler: (englishName) => brawlerName(lang, englishName),
      map: (englishMapName) => mapName(lang, englishMapName),
      mode: (mode) => modeName(lang, mode),
      modeShort: (mode) => modeShortName(lang, mode),
      tier: (rawLabel) => tierLabel(lang, rawLabel),
      num: (value) => value.toLocaleString(lang),
    };
  }, [lang, setLang]);

  // 同步 <html lang> 与标题：系统朗读、浏览器翻译提示、分享卡片都读这两个
  useEffect(() => {
    if (typeof document === 'undefined') return;
    document.documentElement.lang = lang;
    document.title = translate(lang, 'app.title');
  }, [lang]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

/** 取当前语言的翻译能力；必须在 `I18nProvider` 内使用 */
export function useTranslation(): I18n {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useTranslation 必须在 I18nProvider 内使用');
  return ctx;
}

export { LANGS, LANG_LABEL, type Lang } from './langs';
