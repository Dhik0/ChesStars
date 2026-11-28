import { describe, expect, it } from 'vitest';
import {
  ACCENT_COLOR_KEY,
  CUSTOM_ACCENT_KEY,
  DARK_PALETTE_KEY,
  DEFAULT_ACCENT_COLOR,
  DEFAULT_CUSTOM_ACCENT,
  DEFAULT_MONET_ENABLED,
  DEFAULT_THEME_MODE,
  MONET_ENABLED_KEY,
  THEME_COLORS,
  THEME_MODE_KEY,
  createThemeStore,
  customAccentOn,
  isAccentColor,
  parseCustomAccent,
  readThemeConfig,
  resolveTheme,
  type ThemeDocumentLike,
  type ThemeEnv,
  type ThemeMediaQueryLike,
  type ThemeStorage,
} from './themeStore';

/**
 * 主题状态机的单测。
 *
 * 跑在 node 环境里（本项目没有 jsdom），所以这里用三个最小替身模拟浏览器：
 * localStorage、`document.documentElement` + 两个 meta、以及 `prefers-color-scheme`。
 * 被测逻辑本身不读全局，全部通过 `createThemeStore(env)` 注入。
 */

function fakeStorage(initial: Record<string, string> = {}): ThemeStorage & {
  data: Map<string, string>;
} {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => {
      data.set(key, value);
    },
  };
}

interface FakeDocument extends ThemeDocumentLike {
  html: Map<string, string>;
  metas: Map<string, Map<string, string>>;
  cssVars: Map<string, string>;
}

/** 实现 applyResolvedTheme 用到的能力：setAttribute + CSS 变量 + querySelector(meta) */
function fakeDocument(): FakeDocument {
  const html = new Map<string, string>();
  const cssVars = new Map<string, string>();
  const metas = new Map<string, Map<string, string>>([
    ['meta[name="theme-color"]', new Map<string, string>()],
    ['meta[name="color-scheme"]', new Map<string, string>()],
  ]);
  return {
    html,
    metas,
    cssVars,
    documentElement: {
      setAttribute: (name, value) => {
        html.set(name, value);
      },
      style: {
        setProperty: (name, value) => {
          cssVars.set(name, value);
        },
      },
    },
    querySelector: (selector) => {
      const attrs = metas.get(selector);
      if (!attrs) return null;
      return { setAttribute: (name, value) => attrs.set(name, value) };
    },
  };
}

interface FakeMedia extends ThemeMediaQueryLike {
  emit: (matches: boolean) => void;
  listenerCount: () => number;
}

function fakeMedia(matches: boolean): FakeMedia {
  const listeners = new Set<(event: { matches: boolean }) => void>();
  const media: FakeMedia = {
    matches,
    addEventListener: (_type, listener) => {
      listeners.add(listener);
    },
    removeEventListener: (_type, listener) => {
      listeners.delete(listener);
    },
    emit: (next) => {
      media.matches = next;
      for (const listener of listeners) listener({ matches: next });
    },
    listenerCount: () => listeners.size,
  };
  return media;
}

function makeEnv(options: { stored?: Record<string, string>; systemDark?: boolean } = {}) {
  const storage = fakeStorage(options.stored);
  const doc = fakeDocument();
  const media = fakeMedia(options.systemDark ?? true);
  const env: ThemeEnv = { storage, document: doc, media };
  return { env, storage, doc, media };
}

describe('resolveTheme', () => {
  it('显式深色落在 Tonal 深色，且不受系统浅色影响', () => {
    expect(resolveTheme('dark', true)).toBe('dark');
    expect(resolveTheme('dark', false)).toBe('dark');
  });

  it('显式纯黑 / 浅色原样生效', () => {
    expect(resolveTheme('oled', true)).toBe('oled');
    expect(resolveTheme('oled', false)).toBe('oled');
    expect(resolveTheme('light', true)).toBe('light');
    expect(resolveTheme('light', false)).toBe('light');
  });

  it('自动：系统深色取 Tonal 深色，系统浅色取浅色', () => {
    expect(resolveTheme('system', true)).toBe('dark');
    expect(resolveTheme('system', false)).toBe('light');
  });
});

describe('默认值', () => {
  it('没有存储时是 Tonal 深色 + 关闭微染', () => {
    const config = readThemeConfig(null);
    expect(config).toEqual({
      mode: DEFAULT_THEME_MODE,
      monetEnabled: DEFAULT_MONET_ENABLED,
      accentColor: DEFAULT_ACCENT_COLOR,
      customAccent: DEFAULT_CUSTOM_ACCENT,
    });
    expect(DEFAULT_THEME_MODE).toBe('dark');
    expect(DEFAULT_MONET_ENABLED).toBe(false);
    expect(DEFAULT_ACCENT_COLOR).toBe('sky');
  });

  it('存储里是脏数据时回落默认值，不抛错', () => {
    const storage = fakeStorage({
      [THEME_MODE_KEY]: 'sepia',
      [DARK_PALETTE_KEY]: 'purple',
      [MONET_ENABLED_KEY]: 'yes',
      [ACCENT_COLOR_KEY]: 'neon',
    });
    expect(readThemeConfig(storage)).toEqual({
      mode: 'dark',
      monetEnabled: false,
      accentColor: 'sky',
      customAccent: DEFAULT_CUSTOM_ACCENT,
    });
  });

  it('旧存档迁移：navy 并入深色，dark + oled 仍是纯黑', () => {
    expect(readThemeConfig(fakeStorage({ [DARK_PALETTE_KEY]: 'navy' })).mode).toBe('dark');
    expect(readThemeConfig(fakeStorage({ [DARK_PALETTE_KEY]: 'oled' })).mode).toBe('oled');
    expect(
      readThemeConfig(
        fakeStorage({ [THEME_MODE_KEY]: 'dark', [DARK_PALETTE_KEY]: 'oled' }),
      ).mode,
    ).toBe('oled');
  });

  it('新建 store 直接把 data-theme / data-monet / data-accent 落好', () => {
    const { env, doc } = makeEnv();
    const store = createThemeStore(env);
    store.init();
    expect(store.getState()).toEqual({
      mode: 'dark',
      monetEnabled: false,
      accentColor: 'sky',
      customAccent: DEFAULT_CUSTOM_ACCENT,
      resolved: 'dark',
    });
    expect(doc.html.get('data-theme')).toBe('dark');
    expect(doc.html.get('data-monet')).toBe('off');
    expect(doc.html.get('data-accent')).toBe('sky');
  });
});

describe('localStorage 持久化', () => {
  it('setMode 写进存储，并能被下一个 store 读回来', () => {
    const { env, storage } = makeEnv();
    const store = createThemeStore(env);
    store.init();

    store.setMode('light');
    expect(storage.getItem(THEME_MODE_KEY)).toBe('light');
    expect(store.getState().resolved).toBe('light');

    // 旧的深色盘键同步成镜像，旧备份 / 回滚老版本仍能还原
    store.setMode('oled');
    expect(storage.getItem(THEME_MODE_KEY)).toBe('oled');
    expect(storage.getItem(DARK_PALETTE_KEY)).toBe('oled');
    expect(store.getState().resolved).toBe('oled');

    store.setMode('dark');
    expect(storage.getItem(DARK_PALETTE_KEY)).toBe('dark');
    expect(store.getState().resolved).toBe('dark');

    const reopened = createThemeStore(env);
    reopened.init();
    expect(reopened.getState()).toEqual({
      mode: 'dark',
      monetEnabled: false,
      accentColor: 'sky',
      customAccent: DEFAULT_CUSTOM_ACCENT,
      resolved: 'dark',
    });
  });

  it('setDarkPalette 兼容旧调用点：navy 落到 Tonal 深色', () => {
    const { env, storage } = makeEnv();
    const store = createThemeStore(env);
    store.init();

    store.setDarkPalette('navy');
    expect(store.getState().mode).toBe('dark');
    expect(storage.getItem(THEME_MODE_KEY)).toBe('dark');

    store.setDarkPalette('oled');
    expect(store.getState().resolved).toBe('oled');
  });

  it('存储不可用时切换仍然生效，只是记不住', () => {
    const { doc } = makeEnv();
    const store = createThemeStore({ storage: null, document: doc, media: null });
    store.init();
    store.setMode('light');
    expect(store.getState().resolved).toBe('light');
    expect(doc.html.get('data-theme')).toBe('light');
  });
});

describe('跟随系统', () => {
  it('system 模式下监听 prefers-color-scheme 的 change 事件', () => {
    const { env, doc, media } = makeEnv({
      stored: { [THEME_MODE_KEY]: 'system' },
      systemDark: true,
    });
    const store = createThemeStore(env);
    store.init();

    expect(store.getState().resolved).toBe('dark');
    expect(doc.html.get('data-theme')).toBe('dark');

    media.emit(false); // 系统切到浅色
    expect(store.getState().resolved).toBe('light');
    expect(doc.html.get('data-theme')).toBe('light');

    media.emit(true); // 系统切回深色
    expect(store.getState().resolved).toBe('dark');
  });

  it('显式深色 / 纯黑 / 浅色不受系统切换影响', () => {
    const { env, media } = makeEnv({ stored: { [THEME_MODE_KEY]: 'dark' } });
    const store = createThemeStore(env);
    store.init();

    media.emit(false);
    expect(store.getState().resolved).toBe('dark');

    store.setMode('oled');
    media.emit(false);
    expect(store.getState().resolved).toBe('oled');

    store.setMode('light');
    media.emit(true);
    expect(store.getState().resolved).toBe('light');
  });

  it('系统浅色 + 自动模式启动即进浅色，且旧深色盘偏好被浅色覆盖', () => {
    const { env } = makeEnv({
      stored: { [THEME_MODE_KEY]: 'system', [DARK_PALETTE_KEY]: 'navy' },
      systemDark: false,
    });
    const store = createThemeStore(env);
    store.init();
    expect(store.getState().resolved).toBe('light');
  });

  it('dispose 之后不再响应系统切换', () => {
    const { env, media } = makeEnv({ stored: { [THEME_MODE_KEY]: 'system' } });
    const store = createThemeStore(env);
    store.init();
    expect(media.listenerCount()).toBe(1);

    store.dispose();
    expect(media.listenerCount()).toBe(0);
    media.emit(false);
    expect(store.getState().resolved).toBe('dark');
  });
});

describe('meta[name="theme-color"] 同步', () => {
  it('三套实体主题各自的顶栏 / 状态栏底色', () => {
    const { env, doc } = makeEnv();
    const store = createThemeStore(env);
    store.init();

    const themeColor = () => doc.metas.get('meta[name="theme-color"]')?.get('content');
    const colorScheme = () => doc.metas.get('meta[name="color-scheme"]')?.get('content');

    expect(themeColor()).toBe('#101418');
    expect(colorScheme()).toBe('dark');

    store.setMode('oled');
    expect(themeColor()).toBe('#000000');
    expect(colorScheme()).toBe('dark');

    store.setMode('light');
    expect(themeColor()).toBe('#f7f9fc');
    expect(colorScheme()).toBe('light');

    // 与 index.html 内联脚本用的是同一份取值表
    expect(THEME_COLORS).toEqual({ dark: '#101418', oled: '#000000', light: '#f7f9fc' });
  });
});

describe('订阅', () => {
  it('状态变化会通知订阅者，取消订阅后不再收到', () => {
    const { env } = makeEnv();
    const store = createThemeStore(env);
    store.init();

    const seen: string[] = [];
    const unsubscribe = store.subscribe((state) => seen.push(state.resolved));

    store.setMode('light');
    store.setMode('dark');
    unsubscribe();
    store.setMode('oled');

    expect(seen).toEqual(['light', 'dark']);
  });

  it('getState 返回稳定的快照引用（useSyncExternalStore 依赖引用相等）', () => {
    const { env } = makeEnv();
    const store = createThemeStore(env);
    store.init();
    expect(store.getState()).toBe(store.getState());
    const before = store.getState();
    store.setMode('light');
    expect(store.getState()).not.toBe(before);
  });
});

describe('Monet 色彩微染', () => {
  it('开启后写进存储，并把 data-monet 切成 on', () => {
    const { env, storage, doc } = makeEnv();
    const store = createThemeStore(env);
    store.init();

    expect(doc.html.get('data-monet')).toBe('off');
    store.setMonetEnabled(true);

    expect(storage.getItem(MONET_ENABLED_KEY)).toBe('true');
    expect(doc.html.get('data-monet')).toBe('on');
    expect(store.getState().monetEnabled).toBe(true);
  });

  it('强调色持久化，重启后仍是同一个色', () => {
    const { env, storage } = makeEnv();
    const store = createThemeStore(env);
    store.init();

    store.setAccentColor('violet');
    expect(storage.getItem(ACCENT_COLOR_KEY)).toBe('violet');

    const reopened = createThemeStore(env);
    reopened.init();
    expect(reopened.getState().accentColor).toBe('violet');
  });

  it('关闭微染只把 data-monet 切回 off，强调色偏好保留', () => {
    const { env, storage, doc } = makeEnv();
    const store = createThemeStore(env);
    store.init();

    store.setAccentColor('sakura');
    store.setMonetEnabled(true);
    expect(doc.html.get('data-accent')).toBe('sakura');

    store.setMonetEnabled(false);
    expect(doc.html.get('data-monet')).toBe('off');
    // 属性照旧写着，切回来时不用重新选色
    expect(doc.html.get('data-accent')).toBe('sakura');
    expect(storage.getItem(ACCENT_COLOR_KEY)).toBe('sakura');
    expect(storage.getItem(MONET_ENABLED_KEY)).toBe('false');
  });

  it('微染不改变生效主题（深色 / 纯黑 / 浅色照旧）', () => {
    const { env, doc } = makeEnv();
    const store = createThemeStore(env);
    store.init();

    store.setMonetEnabled(true);
    expect(doc.html.get('data-theme')).toBe('dark');
    expect(store.getState().resolved).toBe('dark');

    store.setMode('light');
    expect(doc.html.get('data-theme')).toBe('light');
    expect(store.getState().resolved).toBe('light');
    // 浅色主题下微染仍然开着，只是染得更薄（由 CSS 决定）
    expect(doc.html.get('data-monet')).toBe('on');
  });

  it('强调色只接受 5 组预设，其它值一律不认', () => {
    expect(isAccentColor('mint')).toBe(true);
    expect(isAccentColor('sakura')).toBe(true);
    expect(isAccentColor('neon')).toBe(false);
    expect(isAccentColor(null)).toBe(false);
  });

  it('值没变时不重复通知订阅者（避免无谓重渲染）', () => {
    const { env } = makeEnv();
    const store = createThemeStore(env);
    store.init();

    let calls = 0;
    store.subscribe(() => {
      calls += 1;
    });

    store.setMonetEnabled(false); // 本来就是 false
    expect(calls).toBe(0);

    store.setMonetEnabled(true);
    expect(calls).toBe(1);
  });
});

describe('自定义强调色', () => {
  it('parseCustomAccent 只接受四个合法字段，整数通道 + 0~1 透明度', () => {
    expect(parseCustomAccent('{"r":124,"g":232,"b":216,"a":0.8}')).toEqual({
      r: 124,
      g: 232,
      b: 216,
      a: 0.8,
    });
    expect(parseCustomAccent(null)).toBeNull();
    expect(parseCustomAccent('not json')).toBeNull();
    expect(parseCustomAccent('{"r":300,"g":0,"b":0,"a":1}')).toBeNull();
    expect(parseCustomAccent('{"r":1.5,"g":0,"b":0,"a":1}')).toBeNull();
    expect(parseCustomAccent('{"r":0,"g":0,"b":0,"a":2}')).toBeNull();
    expect(parseCustomAccent('{"r":0,"g":0,"b":0}')).toBeNull();
  });

  it('accentColor=custom 但没有合法值时回落预设，不会渲染出空色', () => {
    const config = readThemeConfig(
      fakeStorage({
        [ACCENT_COLOR_KEY]: 'custom',
        [CUSTOM_ACCENT_KEY]: '{broken',
      }),
    );
    expect(config.accentColor).toBe('sky');
    expect(config.customAccent).toEqual(DEFAULT_CUSTOM_ACCENT);
  });

  it('合法自定义色能被读回', () => {
    const config = readThemeConfig(
      fakeStorage({
        [ACCENT_COLOR_KEY]: 'custom',
        [CUSTOM_ACCENT_KEY]: '{"r":246,"g":135,"b":179,"a":0.6}',
      }),
    );
    expect(config.accentColor).toBe('custom');
    expect(config.customAccent).toEqual({ r: 246, g: 135, b: 179, a: 0.6 });
  });

  it('保存自定义色：切到 custom、开启微染、写 CSS 变量与持久化', () => {
    const { env, storage, doc } = makeEnv();
    const store = createThemeStore(env);
    store.init();
    store.setCustomAccent({ r: 96, g: 165, b: 250, a: 0.7 });

    const state = store.getState();
    expect(state.accentColor).toBe('custom');
    expect(state.monetEnabled).toBe(true);
    expect(state.customAccent).toEqual({ r: 96, g: 165, b: 250, a: 0.7 });
    expect(doc.html.get('data-accent')).toBe('custom');
    expect(doc.html.get('data-monet')).toBe('on');
    expect(doc.cssVars.get('--custom-accent-rgb')).toBe('96 165 250');
    expect(doc.cssVars.get('--custom-accent-alpha')).toBe('0.7');
    expect(storage.getItem(ACCENT_COLOR_KEY)).toBe('custom');
    expect(storage.getItem(MONET_ENABLED_KEY)).toBe('true');

    const reopened = createThemeStore(env);
    expect(reopened.getState().customAccent).toEqual({ r: 96, g: 165, b: 250, a: 0.7 });
  });

  it('浅色系配深字，深色系配白字', () => {
    expect(customAccentOn({ r: 124, g: 232, b: 216, a: 1 })).toBe('#101319');
    expect(customAccentOn({ r: 70, g: 51, b: 140, a: 1 })).toBe('#ffffff');
  });

  it('setCustomAccent 的脏输入直接忽略，不污染状态', () => {
    const { env } = makeEnv();
    const store = createThemeStore(env);
    store.init();
    store.setCustomAccent({ r: 999, g: 0, b: 0, a: 1 });
    expect(store.getState().accentColor).not.toBe('custom');
  });
});
