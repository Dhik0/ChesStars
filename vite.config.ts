import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base: './' 是 Capacitor WebView（file:// 协议）下资源正常加载的前提
export default defineConfig({
  base: './',
  plugins: [react()],
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
