import { Capacitor } from '@capacitor/core';
import { StatusBar, Style } from '@capacitor/status-bar';
import { THEME_COLORS, type ResolvedTheme } from '../services/themeStore';

/**
 * 原生壳（安卓）的状态栏同步。
 *
 * 浏览器靠 `<meta name="theme-color">` 换顶栏颜色，但 Capacitor 的 WebView
 * **不读**这个 meta——状态栏颜色由原生主题（styles.xml）决定，运行期要改只能走插件。
 * 所以每次生效主题变化都同步一次：底色取与 `theme-color` 同一份取值表，
 * 图标明暗跟着主题走（深色主题用浅色图标，浅色主题用深色图标）。
 *
 * 插件不可用（纯 Web / 旧壳）时静默跳过，不影响界面。
 */
export function syncNativeStatusBar(theme: ResolvedTheme): void {
  if (!Capacitor.isNativePlatform()) return;
  void StatusBar.setBackgroundColor({ color: THEME_COLORS[theme] }).catch(() => undefined);
  void StatusBar.setStyle({ style: theme === 'light' ? Style.Light : Style.Dark }).catch(
    () => undefined,
  );
}
