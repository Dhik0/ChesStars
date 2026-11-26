import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import pkg from './package.json';

/** 主题底色：与 index.css 的 body 背景一致，PWA 启动画面与状态栏都用它 */
const THEME_BG = '#020617';

/**
 * 构建产物里的版本清单：`dist/version.json`。
 *
 * 网页端没有安装包，更新检测只能靠「页面自己问服务器：现在部署的是哪个版本」。
 * 这份文件是唯一答案，几十字节，随构建自动生成，不需要任何后端：
 *   - build：作为静态资源写进 dist（部署到 Cloudflare Pages 根目录）
 *   - dev：中间件直接返回，本地调试也能走同一条检测路径
 *
 * 前端读取见 `src/services/webUpdate.ts`（请求时带 `?t=` + `no-store`，不吃缓存）。
 */
function versionManifest(version: string): Plugin {
  const manifestJson = (): string =>
    `${JSON.stringify({ version, buildTime: new Date().toISOString() }, null, 2)}\n`;

  return {
    name: 'chesstars-version-manifest',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const path = (req.url ?? '').split('?')[0];
        if (path !== '/version.json') {
          next();
          return;
        }
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.setHeader('Cache-Control', 'no-store');
        res.end(manifestJson());
      });
    },
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'version.json', source: manifestJson() });
    },
  };
}

// base: './' 是 Capacitor WebView（file:// 协议）下资源正常加载的前提；
// 同一份产物部署到 Cloudflare Pages 根目录时，相对路径同样解析为 '/xxx'。
export default defineConfig({
  base: './',
  plugins: [
    react(),
    VitePWA({
      // 新版本装好后**立即接管**：旧的 Service Worker 若长期占着 index.html，
      // 用户会一直看到上一版界面，而版本清单已经是最新的——这正是「点了没反应」的根因。
      // 注意：接管 ≠ 强制刷新，刷新时机由 main.tsx 的 onNeedReload 决定（见该文件注释）。
      registerType: 'autoUpdate',
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
        // 注意：插件只在 injectRegister 为 auto/null 时才自动打开这两项，
        // 我们为了「原生壳不注册 SW」把它关掉了，所以必须显式声明：
        // 新 SW 装好立刻接管，否则它会一直停在 waiting，旧的继续发 index.html。
        skipWaiting: true,
        clientsClaim: true,
        // 应用外壳 + 英雄头像 / 地图缩略图 + 内置数据文件全部预缓存，断网也能完整 BP
        globPatterns: ['**/*.{js,css,html,svg,png,webmanifest,json}'],
        // 版本清单必须永远走网络：一旦被预缓存，检测到的就是「上次安装时的版本」
        globIgnores: ['version.json'],
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
    versionManifest(pkg.version),
  ],
  define: {
    // 版本号唯一来源：package.json → 前端统一读 src/config/app.ts 的 APP_VERSION
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    chunkSizeWarningLimit: 900,
  },
  server: {
    host: true,
    port: 5173,
  },
});
