import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import pkg from './package.json';

/** 主题底色：与 index.css 的 body 背景一致，PWA 启动画面与状态栏都用它 */
const THEME_BG = '#020617';

// base: './' 是 Capacitor WebView（file:// 协议）下资源正常加载的前提；
// 同一份产物部署到 Cloudflare Pages 根目录时，相对路径同样解析为 '/xxx'。
export default defineConfig({
  base: './',
  plugins: [
    react(),
    VitePWA({
      // 新版本在后台装好、等下次启动再接管：
      // BP 进行中被强制刷新会丢进度，所以不用 autoUpdate 的立即接管
      registerType: 'prompt',
      // 关键：不自动注入注册脚本。Service Worker 只在纯 Web 环境注册（见 src/main.tsx），
      // 否则安卓 WebView 会缓存旧静态资源，影响 APK 覆盖升级。
      injectRegister: false,
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'ChesStars',
        short_name: 'ChesStars',
        description: '荒野乱斗 BP 助手：选人推荐、对位分析与离线数据。',
        lang: 'zh-CN',
        start_url: './',
        scope: './',
        display: 'standalone',
        orientation: 'any',
        theme_color: THEME_BG,
        background_color: THEME_BG,
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          {
            src: 'icons/maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        // 应用外壳 + 英雄头像 / 地图缩略图 + 内置数据文件全部预缓存，断网也能完整 BP
        globPatterns: ['**/*.{js,css,html,svg,png,webmanifest,json}'],
        // brawl_meta.json 约 8MB，默认 2MB 上限会把它排除在外
        maximumFileSizeToCacheInBytes: 16 * 1024 * 1024,
        cleanupOutdatedCaches: true,
        navigateFallback: 'index.html',
      },
      devOptions: {
        // 开发时不启用 SW，避免本地调试被旧缓存干扰
        enabled: false,
      },
    }),
  ],
  define: {
    // 版本号唯一来源：package.json → 前端统一读 src/config/app.ts 的 APP_VERSION
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    target: 'es2020',
    chunkSizeWarningLimit: 900,
  },
  server: {
    host: true,
    port: 5173,
  },
});
