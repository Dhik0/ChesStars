import { useCallback, useSyncExternalStore } from 'react';
import {
  themeStore,
  type AccentColor,
  type CustomAccent,
  type DarkPalette,
  type ThemeMode,
  type ThemeState,
} from '../services/themeStore';

export interface UseTheme extends ThemeState {
  setMode: (mode: ThemeMode) => void;
  setDarkPalette: (palette: DarkPalette) => void;
  /** Monet 色彩微染总开关 */
  setMonetEnabled: (enabled: boolean) => void;
  /** 微染强调色预设（关闭微染时只记录偏好，不改变观感） */
  setAccentColor: (color: AccentColor) => void;
  /** 调色盘自定义色：保存后切到 custom 并自动开启微染 */
  setCustomAccent: (accent: CustomAccent) => void;
}

/**
 * 订阅当前主题状态。
 *
 * 状态本身住在 `themeStore`（模块级单例）里，组件只负责读与写，
 * 因此设置页切换主题后，其它已挂载的界面会通过订阅立即重渲染。
 */
export function useTheme(): UseTheme {
  const state = useSyncExternalStore(themeStore.subscribe, themeStore.getState, themeStore.getState);
  const setMode = useCallback((mode: ThemeMode) => themeStore.setMode(mode), []);
  const setDarkPalette = useCallback((palette: DarkPalette) => themeStore.setDarkPalette(palette), []);
  const setMonetEnabled = useCallback((enabled: boolean) => themeStore.setMonetEnabled(enabled), []);
  const setAccentColor = useCallback((color: AccentColor) => themeStore.setAccentColor(color), []);
  const setCustomAccent = useCallback(
    (accent: CustomAccent) => themeStore.setCustomAccent(accent),
    [],
  );
  return { ...state, setMode, setDarkPalette, setMonetEnabled, setAccentColor, setCustomAccent };
}
