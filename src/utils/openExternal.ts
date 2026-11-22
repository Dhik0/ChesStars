/**
 * 用系统浏览器打开外部链接。
 *
 * Capacitor Android 的 WebView 里，直接改 location 或 `window.open(url, '_blank')`
 * 会把页面顶掉且没有返回键出口（用户被困在 GitHub 页面里只能杀进程）。
 *
 * Capacitor 的外部跳转挂在 `BridgeWebViewClient.shouldOverrideUrlLoading` 上：
 * 只要发生**顶层导航**且目标不是 App 域名，就交给 `Bridge.launchIntent` 用系统
 * Intent 打开外部浏览器，WebView 原地不动——返回键直接回到 App。
 *
 * 而 `window.open(url, '_system')` 依赖 `WebChromeClient.onCreateWindow`，
 * Capacitor 并未实现（也没开 setSupportMultipleWindows），在 Android 上会返回 null。
 * 所以这里的顺序是：先试 `_system`（Web/其它平台可用的语义），拿不到窗口就改 location，
 * 由原生拦截兜底。
 */
import { Capacitor } from '@capacitor/core';

export function openExternal(url: string): void {
  if (!url) return;

  if (Capacitor.isNativePlatform()) {
    let opened: Window | null = null;
    try {
      opened = window.open(url, '_system');
    } catch {
      opened = null;
    }
    // 弹窗被 WebView 拦下（Android 常态）→ 顶层导航交给原生 Intent
    if (!opened) window.location.assign(url);
    return;
  }

  // 浏览器：新标签页打开；被弹窗拦截时退回当前页跳转
  const win = window.open(url, '_blank', 'noopener,noreferrer');
  if (!win) window.location.assign(url);
}
