import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import pkg from './package.json';

// base: './' 是 Capacitor WebView（file:// 协议）下资源正常加载的前提
export default defineConfig({
  base: './',
  plugins: [react()],
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
