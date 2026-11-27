import { useCallback, useSyncExternalStore } from 'react';
import {
  themeStore,
  type DarkPalette,
  type ThemeMode,
  type ThemeState,
} from '../services/themeStore';

export interface UseTheme extends ThemeState {
  setMode: (mode: ThemeMode) => void;
  setDarkPalette: (palette: DarkPalette) => void;
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
  return { ...state, setMode, setDarkPalette };
}
