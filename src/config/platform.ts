import { Capacitor } from '@capacitor/core';

/**
 * 运行环境判定（全应用唯一出口）。
 *
 * - `IS_NATIVE_APP`：跑在 Capacitor 原生壳里（Android APK / iOS），
 *   需要 APK 版本更新检测，且**不能**注册 Service Worker
 *   （WebView 缓存旧静态资源会让覆盖安装后仍显示老界面）。
 * - `IS_WEB`：普通浏览器 / PWA，没有安装包概念，
 *   一切 APK 更新引导都不该出现。
 */
export const IS_NATIVE_APP = Capacitor.isNativePlatform();

export const IS_WEB = !IS_NATIVE_APP;
