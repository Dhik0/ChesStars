import { describe, expect, it } from 'vitest';
import {
  DARK_PALETTE_KEY,
  DEFAULT_DARK_PALETTE,
  DEFAULT_THEME_MODE,
  THEME_COLORS,
  THEME_MODE_KEY,
  createThemeStore,
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
}

/** 只实现 applyResolvedTheme 用到的两个能力：setAttribute + querySelector(meta) */
function fakeDocument(): FakeDocument {
  const html = new Map<string, string>();
  const metas = new Map<string, Map<string, string>>([
    ['meta[name="theme-color"]', new Map<string, string>()],
    ['meta[name="color-scheme"]', new Map<string, string>()],
  ]);
  return {
    html,
    metas,
    documentElement: {
      setAttribute: (name, value) => {
        html.set(name, value);
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
  it('默认（深色 + 纯黑）落在 oled，且不受系统浅色影响', () => {
    expect(resolveTheme('dark', 'oled', true)).toBe('oled');
    expect(resolveTheme('dark', 'oled', false)).toBe('oled');
  });

  it('显式浅色优先于深色主题色', () => {
    expect(resolveTheme('light', 'navy', true)).toBe('light');
    expect(resolveTheme('light', 'oled', true)).toBe('light');
  });

  it('跟随系统：系统深色时按 darkPalette，系统浅色时进浅色', () => {
    expect(resolveTheme('system', 'navy', true)).toBe('navy');
    expect(resolveTheme('system', 'oled', true)).toBe('oled');
    expect(resolveTheme('system', 'navy', false)).toBe('light');
    expect(resolveTheme('system', 'oled', false)).toBe('light');
  });
});

describe('默认值', () => {
  it('没有存储时是 深色 + 纯黑', () => {
    const config = readThemeConfig(null);
    expect(config).toEqual({ mode: DEFAULT_THEME_MODE, darkPalette: DEFAULT_DARK_PALETTE });
    expect(DEFAULT_THEME_MODE).toBe('dark');
    expect(DEFAULT_DARK_PALETTE).toBe('oled');
  });

  it('存储里是脏数据时回落默认值，不抛错', () => {
    const storage = fakeStorage({ [THEME_MODE_KEY]: 'sepia', [DARK_PALETTE_KEY]: 'purple' });
    expect(readThemeConfig(storage)).toEqual({ mode: 'dark', darkPalette: 'oled' });
  });

  it('新建 store 直接把 data-theme 写成 oled', () => {
    const { env, doc } = makeEnv();
    const store = createThemeStore(env);
    store.init();
    expect(store.getState()).toEqual({ mode: 'dark', darkPalette: 'oled', resolved: 'oled' });
    expect(doc.html.get('data-theme')).toBe('oled');
  });
});

describe('localStorage 持久化', () => {
  it('setMode / setDarkPalette 都写进存储，并能被下一个 store 读回来', () => {
    const { env, storage } = makeEnv();
    const store = createThemeStore(env);
    store.init();

    store.setMode('light');
    expect(storage.getItem(THEME_MODE_KEY)).toBe('light');
    expect(store.getState().resolved).toBe('light');

    store.setDarkPalette('navy');
    expect(storage.getItem(DARK_PALETTE_KEY)).toBe('navy');
    // 浅色模式下深色主题色不改变生效主题
    expect(store.getState().resolved).toBe('light');

    store.setMode('dark');
    expect(store.getState().resolved).toBe('navy');

    const reopened = createThemeStore(env);
    reopened.init();
    expect(reopened.getState()).toEqual({ mode: 'dark', darkPalette: 'navy', resolved: 'navy' });
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

    expect(store.getState().resolved).toBe('oled');
    expect(doc.html.get('data-theme')).toBe('oled');

    media.emit(false); // 系统切到浅色
    expect(store.getState().resolved).toBe('light');
    expect(doc.html.get('data-theme')).toBe('light');

    media.emit(true); // 系统切回深色
    expect(store.getState().resolved).toBe('oled');
  });

  it('显式深色 / 浅色不受系统切换影响', () => {
    const { env, media } = makeEnv({ stored: { [THEME_MODE_KEY]: 'dark' } });
    const store = createThemeStore(env);
    store.init();

    media.emit(false);
    expect(store.getState().resolved).toBe('oled');

    store.setMode('light');
    media.emit(true);
    expect(store.getState().resolved).toBe('light');
  });

  it('系统浅色 + system 模式启动即进浅色，且跟随 navy 的偏好被浅色覆盖', () => {
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
    expect(store.getState().resolved).toBe('oled');
  });
});

describe('meta[name="theme-color"] 同步', () => {
  it('三套主题各自的顶栏 / 状态栏底色', () => {
    const { env, doc } = makeEnv();
    const store = createThemeStore(env);
    store.init();

    const themeColor = () => doc.metas.get('meta[name="theme-color"]')?.get('content');
    const colorScheme = () => doc.metas.get('meta[name="color-scheme"]')?.get('content');

    expect(themeColor()).toBe('#000000');
    expect(colorScheme()).toBe('dark');

    store.setDarkPalette('navy');
    expect(themeColor()).toBe('#020617');
    expect(colorScheme()).toBe('dark');

    store.setMode('light');
    expect(themeColor()).toBe('#f8fafc');
    expect(colorScheme()).toBe('light');

    // 与 index.html 内联脚本用的是同一份取值表
    expect(THEME_COLORS).toEqual({ oled: '#000000', navy: '#020617', light: '#f8fafc' });
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
    store.setDarkPalette('navy');

    expect(seen).toEqual(['light', 'oled']);
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
