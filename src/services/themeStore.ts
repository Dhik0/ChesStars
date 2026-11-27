/**
 * 主题状态：外观模式（深色 / 浅色 / 跟随系统）+ 深色主题色（纯黑 OLED / 经典深蓝）。
 *
 * 设计要点：
 *   1. **纯函数优先**：`resolveTheme` / `readThemeConfig` / `applyResolvedTheme` 都不读全局，
 *      环境（localStorage、document、matchMedia）由 `createThemeStore(env)` 注入，
 *      这样单测可以在 node 里跑，不需要 jsdom。
 *   2. **首屏不闪**：真正的最先一次落笔在 `index.html` 的同步内联脚本里（React 挂载前）。
 *      这里负责后续的每一次切换，两边共用同一份键名与取值（见 `THEME_*_KEY`）。
 *   3. **状态栏同步**：每次生效主题变化都写 `<meta name="theme-color">`，
 *      安卓 WebView / 移动端浏览器顶栏的颜色才会跟着变。
 */

export type ThemeMode = 'dark' | 'light' | 'system';
export type DarkPalette = 'oled' | 'navy';
/** 实际落到 `data-theme` 上的值：两套深色 + 一套浅色 */
export type ResolvedTheme = 'oled' | 'navy' | 'light';

export const THEME_MODE_KEY = 'brawl.draft.themeMode';
export const DARK_PALETTE_KEY = 'brawl.draft.darkPalette';

/** 老用户升级后直接进纯黑：两个默认值都必须与 index.html 的内联脚本一致 */
export const DEFAULT_THEME_MODE: ThemeMode = 'dark';
export const DEFAULT_DARK_PALETTE: DarkPalette = 'oled';

/** 状态栏 / 浏览器顶栏底色（与 index.css 里各主题的 `--c-app` 同值） */
export const THEME_COLORS: Record<ResolvedTheme, string> = {
  oled: '#000000',
  navy: '#020617',
  light: '#f8fafc',
};

/** `color-scheme` 跟着生效主题走：浅色主题下原生控件（滚动条 / 输入光标）才不会黑底 */
export const THEME_COLOR_SCHEME: Record<ResolvedTheme, 'light' | 'dark'> = {
  oled: 'dark',
  navy: 'dark',
  light: 'light',
};

export interface ThemeState {
  mode: ThemeMode;
  darkPalette: DarkPalette;
  resolved: ResolvedTheme;
}

export function isThemeMode(value: unknown): value is ThemeMode {
  return value === 'dark' || value === 'light' || value === 'system';
}

export function isDarkPalette(value: unknown): value is DarkPalette {
  return value === 'oled' || value === 'navy';
}

/**
 * 生效主题的唯一判定入口。
 *
 *   - 显式浅色 → light
 *   - 跟随系统且系统不是深色 → light
 *   - 其余（深色 / 跟随系统且系统是深色）→ 按 darkPalette 取 oled 或 navy
 */
export function resolveTheme(
  mode: ThemeMode,
  darkPalette: DarkPalette,
  systemPrefersDark: boolean,
): ResolvedTheme {
  if (mode === 'light') return 'light';
  if (mode === 'system' && !systemPrefersDark) return 'light';
  return darkPalette === 'navy' ? 'navy' : 'oled';
}

/* ------------------------------------------------------------------ *
 * 环境注入：让单测可以完全脱离浏览器
 * ------------------------------------------------------------------ */

export interface ThemeStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface ThemeAttributeTarget {
  setAttribute(name: string, value: string): void;
}

export interface ThemeDocumentLike {
  documentElement: ThemeAttributeTarget;
  querySelector(selector: string): ThemeAttributeTarget | null;
}

export interface ThemeMediaQueryLike {
  matches: boolean;
  addEventListener?: (type: 'change', listener: (event: { matches: boolean }) => void) => void;
  removeEventListener?: (type: 'change', listener: (event: { matches: boolean }) => void) => void;
  /** 老 WebView（Android 5~6）只有已废弃的 addListener */
  addListener?: (listener: (event: { matches: boolean }) => void) => void;
  removeListener?: (listener: (event: { matches: boolean }) => void) => void;
}

export interface ThemeEnv {
  storage: ThemeStorage | null;
  document: ThemeDocumentLike | null;
  /** `(prefers-color-scheme: dark)` 的媒体查询对象；不支持时为 null */
  media: ThemeMediaQueryLike | null;
}

/** 读不到（隐私模式 / 存储被禁用）时当作没设置过，绝不让主题读取抛错 */
function safeStorage(raw: Storage | undefined): ThemeStorage | null {
  if (!raw) return null;
  return {
    getItem: (key) => {
      try {
        return raw.getItem(key);
      } catch {
        return null;
      }
    },
    setItem: (key, value) => {
      try {
        raw.setItem(key, value);
      } catch {
        /* 写失败只影响「下次启动还记得」，本次会话照常生效 */
      }
    },
  };
}

/** 浏览器环境；非浏览器（SSR / node 单测）返回空壳 */
export function browserThemeEnv(): ThemeEnv {
  const hasWindow = typeof window !== 'undefined';
  return {
    storage: hasWindow ? safeStorage(window.localStorage) : null,
    document: typeof document !== 'undefined' ? (document as unknown as ThemeDocumentLike) : null,
    media:
      hasWindow && typeof window.matchMedia === 'function'
        ? (window.matchMedia('(prefers-color-scheme: dark)') as unknown as ThemeMediaQueryLike)
        : null,
  };
}

/* ------------------------------------------------------------------ *
 * 读写
 * ------------------------------------------------------------------ */

export interface ThemeConfig {
  mode: ThemeMode;
  darkPalette: DarkPalette;
}

/** 读持久化配置：缺失或非法一律回落到默认值（老用户升级即纯黑深色） */
export function readThemeConfig(storage: ThemeStorage | null): ThemeConfig {
  const rawMode = storage?.getItem(THEME_MODE_KEY) ?? null;
  const rawPalette = storage?.getItem(DARK_PALETTE_KEY) ?? null;
  return {
    mode: isThemeMode(rawMode) ? rawMode : DEFAULT_THEME_MODE,
    darkPalette: isDarkPalette(rawPalette) ? rawPalette : DEFAULT_DARK_PALETTE,
  };
}

/** 系统当前是否深色；拿不到媒体查询时按深色处理（应用本来就是深色优先） */
export function systemPrefersDark(env: Pick<ThemeEnv, 'media'>): boolean {
  return env.media ? env.media.matches : true;
}

/**
 * 把生效主题写到 DOM：`data-theme` + 两个 meta。
 *
 * `data-theme` 是 CSS 变量的唯一开关（见 index.css），
 * `theme-color` 决定移动端浏览器顶栏 / 安卓状态栏的底色，
 * `color-scheme` 决定原生控件按浅色还是深色渲染。
 */
export function applyResolvedTheme(theme: ResolvedTheme, doc: ThemeDocumentLike | null): void {
  if (!doc) return;
  doc.documentElement.setAttribute('data-theme', theme);
  doc.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME_COLORS[theme]);
  doc
    .querySelector('meta[name="color-scheme"]')
    ?.setAttribute('content', THEME_COLOR_SCHEME[theme]);
}

/* ------------------------------------------------------------------ *
 * Store
 * ------------------------------------------------------------------ */

export interface ThemeStore {
  getState(): ThemeState;
  /** 返回取消订阅函数；配合 `useSyncExternalStore` 使用 */
  subscribe(listener: (state: ThemeState) => void): () => void;
  /** 挂载：落一次主题 + 开始监听系统配色变化（可重复调用，内部只生效一次） */
  init(): void;
  setMode(mode: ThemeMode): void;
  setDarkPalette(palette: DarkPalette): void;
  /** 卸载监听（HMR / 单测收尾用） */
  dispose(): void;
}

export function createThemeStore(env: ThemeEnv = browserThemeEnv()): ThemeStore {
  const config = readThemeConfig(env.storage);
  let mode = config.mode;
  let darkPalette = config.darkPalette;
  let resolved = resolveTheme(mode, darkPalette, systemPrefersDark(env));

  const listeners = new Set<(state: ThemeState) => void>();
  /** 快照对象要缓存：`useSyncExternalStore` 靠引用相等判断是否重渲染 */
  let snapshot: ThemeState = { mode, darkPalette, resolved };
  let started = false;

  const onSystemChange = (): void => {
    // 只有「跟随系统」需要实时响应；显式深色 / 浅色不受系统影响
    if (mode !== 'system') return;
    refresh(mode, darkPalette);
  };

  function refresh(nextMode: ThemeMode, nextPalette: DarkPalette): void {
    mode = nextMode;
    darkPalette = nextPalette;
    resolved = resolveTheme(mode, darkPalette, systemPrefersDark(env));
    snapshot = { mode, darkPalette, resolved };
    applyResolvedTheme(resolved, env.document);
    for (const listener of listeners) listener(snapshot);
  }

  return {
    getState: () => snapshot,

    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },

    init() {
      if (started) return;
      started = true;
      // index.html 的内联脚本已经落过一次，这里再落一次是为了覆盖「脚本被 CSP 拦掉」等极端情况
      applyResolvedTheme(resolved, env.document);
      const media = env.media;
      if (!media) return;
      if (typeof media.addEventListener === 'function') {
        media.addEventListener('change', onSystemChange);
      } else if (typeof media.addListener === 'function') {
        media.addListener(onSystemChange);
      }
    },

    setMode(next) {
      if (!isThemeMode(next)) return;
      env.storage?.setItem(THEME_MODE_KEY, next);
      refresh(next, darkPalette);
    },

    setDarkPalette(next) {
      if (!isDarkPalette(next)) return;
      env.storage?.setItem(DARK_PALETTE_KEY, next);
      refresh(mode, next);
    },

    dispose() {
      const media = env.media;
      if (!media) return;
      if (typeof media.removeEventListener === 'function') {
        media.removeEventListener('change', onSystemChange);
      } else if (typeof media.removeListener === 'function') {
        media.removeListener(onSystemChange);
      }
      started = false;
    },
  };
}

/** 全局单例：界面只跟它打交道 */
export const themeStore: ThemeStore = createThemeStore();
