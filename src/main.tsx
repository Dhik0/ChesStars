import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { IS_WEB } from './config/platform';
import { I18nProvider } from './i18n';
import './index.css';

const root = document.getElementById('root');
if (!root) throw new Error('#root not found');

ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <I18nProvider>
      <App />
    </I18nProvider>
  </React.StrictMode>,
);

/**
 * PWA 离线支持：**只在纯 Web 环境**注册 Service Worker。
 *
 * 原生壳（Capacitor Android）绝不能注册——WebView 会长期命中缓存里的旧 JS/CSS，
 * 用户覆盖安装新 APK 后看到的还是老界面。动态 import 保证这段逻辑不进原生首屏关键路径。
 */
if (IS_WEB && 'serviceWorker' in navigator) {
  void import('virtual:pwa-register')
    .then(({ registerSW }) => {
      registerSW({ immediate: true });
    })
    .catch(() => {
      /* 注册失败只影响离线能力，不影响在线使用 */
    });
}
