/**
 * 主题状态：四档外观模式（自动 / 浅色 / Tonal 深色 / OLED 纯黑）+ Monet 色彩微染
 * （开关 + 强调色预设）。
 *
 * 设计要点：
 *   1. **纯函数优先**：`resolveTheme` / `readThemeConfig` / `applyResolvedTheme` 都不读全局，
 *      环境（localStorage、document、matchMedia）由 `createThemeStore(env)` 注入，
 *      这样单测可以在 node 里跑，不需要 jsdom。
 *   2. **首屏不闪**：真正的最先一次落笔在 `index.html` 的同步内联脚本里（React 挂载前）。
 *      这里负责后续的每一次切换，两边共用同一份键名与取值（见 `THEME_*_KEY`）。
 *   3. **状态栏同步**：每次生效主题变化都写 `<meta name="theme-color">`，
 *      安卓 WebView / 移动端浏览器顶栏的颜色才会跟着变。
 *   4. **Monet 微染只落属性**：这里只负责把 `data-monet` / `data-accent` 写到 `<html>`，
 *      具体染多少、染哪里全部由 index.css 的 `color-mix()` 决定——
 *      组件不需要知道「现在是不是微染模式」，样式自然跟着走。
 */

export type ThemeMode = 'system' | 'light' | 'dark' | 'oled';
/**
 * 旧版「深色主题色」枚举（四档主题之前）。
 *
 * 现在深色档由 `ThemeMode` 直接表达，这个类型只为两件事保留：
 *   1. 读旧本地存储 / 旧备份文件——`'navy'` 读入即并入 `'dark'`，`'oled'` 仍是纯黑；
 *   2. 备份文件里的 `prefs.darkPalette` 字段（`backupStore` 依赖它）。
 * 界面不再让用户单独选深色盘。
 */
export type DarkPalette = 'oled' | 'navy' | 'dark';
/** 实际落到 `data-theme` 上的值：Tonal 深色 / OLED 纯黑 / 浅色 */
export type ResolvedTheme = 'dark' | 'oled' | 'light';

/**
 * Monet 微染的强调色预设。
 *
 * 只提供「色相」这一层选择：底色、卡片灰阶、文字层级仍由主题决定，
 * 强调色只往表面里掺一点同色系，避免变成一堆互不相干的彩色卡片。
 */
export type AccentColor = 'mint' | 'sky' | 'violet' | 'amber' | 'sakura' | 'custom';

/**
 * 自定义强调色：0–255 的整数通道 + 0–1 的透明度。
 * 存 JSON 字符串到 localStorage；`data-accent='custom'` 时由 applyResolvedTheme
 * 写成 `--custom-accent-rgb` / `--custom-accent-alpha` 两个 CSS 变量，
 * 具体如何掺进卡片仍由 index.css 的 color-mix 决定（微染 ≤7% 的硬线不变）。
 */
export interface CustomAccent {
  r: number;
  g: number;
  b: number;
  a: number;
}

export const DEFAULT_CUSTOM_ACCENT: CustomAccent = { r: 124, g: 232, b: 216, a: 1 };

export interface AccentPreset {
  key: AccentColor;
  /** 色标 / 预览用。真实渲染走 index.css 里的 RGB 通道表，界面不读这个值 */
  hex: string;
}

/**
 * 顺序即设置页色板的展示顺序（冷色在前，暖色在后）。
 *
 * 这里只放低饱和的粉彩色：微染开启后强调色会大面积铺在按钮、开关与分组标题上，
 * 高饱和的 400/500 阶贴深色底会刺眼。色值必须与 index.css 的 `--accent-rgb` 一致。
 */
export const ACCENT_PRESETS: readonly AccentPreset[] = [
  { key: 'mint', hex: '#7CE8D8' },
  { key: 'sky', hex: '#7AA2F7' },
  { key: 'violet', hex: '#B794F4' },
  { key: 'amber', hex: '#F6AD55' },
  { key: 'sakura', hex: '#F687B3' },
];

export const THEME_MODE_KEY = 'brawl.draft.themeMode';
export const DARK_PALETTE_KEY = 'brawl.draft.darkPalette';
export const MONET_ENABLED_KEY = 'brawl.draft.monetEnabled';
export const ACCENT_COLOR_KEY = 'brawl.draft.accentColor';
export const CUSTOM_ACCENT_KEY = 'brawl.draft.customAccent';

/** 首次启动的默认档：Tonal 深色。必须与 index.html 的内联脚本一致 */
export const DEFAULT_THEME_MODE: ThemeMode = 'dark';
/** 微染默认关闭：中性灰阶是默认观感，彩色需要用户自己打开 */
export const DEFAULT_MONET_ENABLED = false;
export const DEFAULT_ACCENT_COLOR: AccentColor = 'sky';

/** 状态栏 / 浏览器顶栏底色（与 index.css 里各主题的 `--c-app` 同值） */
export const THEME_COLORS: Record<ResolvedTheme, string> = {
  dark: '#101418',
  oled: '#000000',
  light: '#f7f9fc',
};

/** `color-scheme` 跟着生效主题走：浅色主题下原生控件（滚动条 / 输入光标）才不会黑底 */
export const THEME_COLOR_SCHEME: Record<ResolvedTheme, 'light' | 'dark'> = {
  dark: 'dark',
  oled: 'dark',
  light: 'light',
};

export interface ThemeState {
  mode: ThemeMode;
  monetEnabled: boolean;
  accentColor: AccentColor;
  customAccent: CustomAccent;
  resolved: ResolvedTheme;
}

export function isThemeMode(value: unknown): value is ThemeMode {
  return value === 'dark' || value === 'light' || value === 'system' || value === 'oled';
}

export function isDarkPalette(value: unknown): value is DarkPalette {
  return value === 'oled' || value === 'navy' || value === 'dark';
}

export function isAccentColor(value: unknown): value is AccentColor {
  return (
    value === 'mint' ||
    value === 'sky' ||
    value === 'violet' ||
    value === 'amber' ||
    value === 'sakura' ||
    value === 'custom'
  );
}

/** 通道必须是 0–255 的整数；透明度 0–1。任何脏值整条丢弃，回落到默认色 */
export function parseCustomAccent(raw: string | null): CustomAccent | null {
  if (!raw) return null;
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!value || typeof value !== 'object') return null;
  const v = value as Record<string, unknown>;
  const channel = (x: unknown): x is number =>
    typeof x === 'number' && Number.isInteger(x) && x >= 0 && x <= 255;
  const alpha = v.a;
  if (!channel(v.r) || !channel(v.g) || !channel(v.b)) return null;
  if (typeof alpha !== 'number' || !Number.isFinite(alpha) || alpha < 0 || alpha > 1) return null;
  return { r: v.r, g: v.g, b: v.b, a: alpha };
}

/**
 * 自定义色的实心文字色：按 WCAG 相对亮度决定深色字还是白字。
 * 粉彩 / 浅色底配深字（对齐预设的 #101319），深底配白字，避免高饱和色配白字糊成一片。
 */
export function customAccentOn(accent: CustomAccent): string {
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  const luminance = 0.2126 * lin(accent.r) + 0.7152 * lin(accent.g) + 0.0722 * lin(accent.b);
  return luminance > 0.42 ? '#101319' : '#ffffff';
}

/**
 * 生效主题的唯一判定入口。
 *
 *   - 显式浅色 → light
 *   - 跟随系统 → 系统深色取 Tonal 深色，系统浅色取 light
 *   - 显式深色 / 纯黑 → 原样
 */
export function resolveTheme(mode: ThemeMode, systemDark: boolean): ResolvedTheme {
  if (mode === 'light') return 'light';
  if (mode === 'system') return systemDark ? 'dark' : 'light';
  return mode === 'oled' ? 'oled' : 'dark';
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
  /** 自定义强调色需要落 CSS 变量；node 单测的替身可以省略 */
  style?: { setProperty(name: string, value: string): void };
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
  monetEnabled: boolean;
  accentColor: AccentColor;
  customAccent: CustomAccent;
}

/**
 * 旧值迁移。
 *
 * 四档主题之前，「深色」还分纯黑与经典深蓝两套，分别存在 `themeMode` 与
 * `darkPalette` 两个键里。这里按老键的组合还原用户当时看到的样子：
 *   - `navy` → Tonal 深色（经典深蓝已并入 `dark`）
 *   - `dark` + `oled` → 仍然是纯黑
 * 新版本每次切换都会把 `darkPalette` 写成镜像值，所以这两条只对旧存档生效。
 */
function readMode(rawMode: string | null, rawPalette: string | null): ThemeMode {
  if (rawMode === 'system' || rawMode === 'light' || rawMode === 'oled') return rawMode;
  if (rawMode === 'dark' || rawMode === null) {
    return rawPalette === 'oled' ? 'oled' : 'dark';
  }
  return DEFAULT_THEME_MODE;
}

/** 读持久化配置：缺失或非法一律回落到默认值（首次启动即 Tonal 深色 + 无微染） */
export function readThemeConfig(storage: ThemeStorage | null): ThemeConfig {
  const rawMode = storage?.getItem(THEME_MODE_KEY) ?? null;
  const rawPalette = storage?.getItem(DARK_PALETTE_KEY) ?? null;
  const rawMonet = storage?.getItem(MONET_ENABLED_KEY) ?? null;
  const rawAccent = storage?.getItem(ACCENT_COLOR_KEY) ?? null;
  const parsedCustom = parseCustomAccent(storage?.getItem(CUSTOM_ACCENT_KEY) ?? null);
  const accentColor = isAccentColor(rawAccent) ? rawAccent : DEFAULT_ACCENT_COLOR;
  return {
    mode: readMode(rawMode, rawPalette),
    // 只认字符串 'true' / 'false'：其它任何脏值都当没设置过，不要用 Boolean('false') 那种陷阱
    monetEnabled: rawMonet === 'true' ? true : rawMonet === 'false' ? false : DEFAULT_MONET_ENABLED,
    // custom 但没有合法的自定义值 → 回落到预设，避免渲染出 --custom-accent-rgb 空串
    accentColor: accentColor === 'custom' && !parsedCustom ? DEFAULT_ACCENT_COLOR : accentColor,
    customAccent: parsedCustom ?? DEFAULT_CUSTOM_ACCENT,
  };
}

/** 系统当前是否深色；拿不到媒体查询时按深色处理（应用本来就是深色优先） */
export function systemPrefersDark(env: Pick<ThemeEnv, 'media'>): boolean {
  return env.media ? env.media.matches : true;
}

export interface ThemeAppearance {
  monetEnabled: boolean;
  accentColor: AccentColor;
  customAccent?: CustomAccent;
}

const DEFAULT_APPEARANCE: ThemeAppearance = {
  monetEnabled: DEFAULT_MONET_ENABLED,
  accentColor: DEFAULT_ACCENT_COLOR,
  customAccent: DEFAULT_CUSTOM_ACCENT,
};

/**
 * 把生效主题写到 DOM：`data-theme` + `data-monet` / `data-accent` + 两个 meta。
 *
 * `data-theme` 是 CSS 变量的唯一开关（见 index.css），
 * `data-monet` / `data-accent` 决定卡片与强调色要不要掺色、掺哪个色，
 * `theme-color` 决定移动端浏览器顶栏 / 安卓状态栏的底色，
 * `color-scheme` 决定原生控件按浅色还是深色渲染。
 *
 * 微染关闭时也照常写 `data-accent`：属性只是「用户选过什么」的记录，
 * 生效与否由 `data-monet` 控制，切开关时不需要重新计算一遍配色。
 */
export function applyResolvedTheme(
  theme: ResolvedTheme,
  doc: ThemeDocumentLike | null,
  appearance: ThemeAppearance = DEFAULT_APPEARANCE,
): void {
  if (!doc) return;
  const root = doc.documentElement;
  root.setAttribute('data-theme', theme);
  root.setAttribute('data-monet', appearance.monetEnabled ? 'on' : 'off');
  root.setAttribute('data-accent', appearance.accentColor);
  // 自定义色写成 CSS 变量；只有 data-accent='custom' 时 index.css 才会读取它们。
  // 变量常驻不影响预设色，切换回预设时无需清理。
  if (appearance.accentColor === 'custom' && root.style) {
    const c = appearance.customAccent ?? DEFAULT_CUSTOM_ACCENT;
    root.style.setProperty('--custom-accent-rgb', `${c.r} ${c.g} ${c.b}`);
    root.style.setProperty('--custom-accent-alpha', String(c.a));
    root.style.setProperty('--custom-accent-on', customAccentOn(c));
  }
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
  /**
   * @deprecated 深色档已并入 `setMode`（`'oled'` / `'dark'`）。
   * 只为旧调用点（备份还原、老组件）保留：`'navy'` 与 `'dark'` 都落到 Tonal 深色。
   */
  setDarkPalette(palette: DarkPalette): void;
  setMonetEnabled(enabled: boolean): void;
  setAccentColor(color: AccentColor): void;
  /** 保存调色盘结果：同时切到 custom 并开启微染，保存即见效 */
  setCustomAccent(accent: CustomAccent): void;
  /** 卸载监听（HMR / 单测收尾用） */
  dispose(): void;
}

export function createThemeStore(env: ThemeEnv = browserThemeEnv()): ThemeStore {
  const config = readThemeConfig(env.storage);
  let mode = config.mode;
  let monetEnabled = config.monetEnabled;
  let accentColor = config.accentColor;
  let customAccent = config.customAccent;
  let resolved = resolveTheme(mode, systemPrefersDark(env));

  const listeners = new Set<(state: ThemeState) => void>();
  /** 快照对象要缓存：`useSyncExternalStore` 靠引用相等判断是否重渲染 */
  let snapshot: ThemeState = {
    mode,
    monetEnabled,
    accentColor,
    customAccent,
    resolved,
  };
  let started = false;

  const onSystemChange = (): void => {
    // 只有「自动」需要实时响应；显式深色 / 纯黑 / 浅色不受系统影响
    if (mode !== 'system') return;
    paint();
  };

  /** 统一出口：重算生效主题 → 落 DOM → 通知订阅者 */
  function paint(): void {
    resolved = resolveTheme(mode, systemPrefersDark(env));
    snapshot = { mode, monetEnabled, accentColor, customAccent, resolved };
    applyResolvedTheme(resolved, env.document, { monetEnabled, accentColor, customAccent });
    for (const listener of listeners) listener(snapshot);
  }

  /** 切档的统一入口：同时把旧的深色盘键写成镜像，旧备份 / 回滚老版本仍能还原同一套深色 */
  function applyMode(next: ThemeMode): void {
    env.storage?.setItem(THEME_MODE_KEY, next);
    env.storage?.setItem(DARK_PALETTE_KEY, next === 'oled' ? 'oled' : 'dark');
    mode = next;
    paint();
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
      applyResolvedTheme(resolved, env.document, { monetEnabled, accentColor, customAccent });
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
      applyMode(next);
    },

    setDarkPalette(next) {
      if (!isDarkPalette(next)) return;
      applyMode(next === 'oled' ? 'oled' : 'dark');
    },

    setMonetEnabled(next) {
      if (typeof next !== 'boolean' || next === monetEnabled) return;
      env.storage?.setItem(MONET_ENABLED_KEY, next ? 'true' : 'false');
      monetEnabled = next;
      paint();
    },

    setAccentColor(next) {
      if (!isAccentColor(next)) return;
      if (next === 'custom' && accentColor !== 'custom') {
        // 从预设切到 custom 而没有已存值时，沿用默认自定义色，不写空色
        env.storage?.setItem(CUSTOM_ACCENT_KEY, JSON.stringify(customAccent));
      }
      env.storage?.setItem(ACCENT_COLOR_KEY, next);
      accentColor = next;
      paint();
    },

    setCustomAccent(next) {
      const parsed = parseCustomAccent(JSON.stringify(next));
      if (!parsed) return;
      env.storage?.setItem(CUSTOM_ACCENT_KEY, JSON.stringify(parsed));
      env.storage?.setItem(ACCENT_COLOR_KEY, 'custom');
      // 关闭微染时选色看不到任何变化，保存即自动开启
      if (!monetEnabled) env.storage?.setItem(MONET_ENABLED_KEY, 'true');
      customAccent = parsed;
      accentColor = 'custom';
      monetEnabled = true;
      paint();
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
