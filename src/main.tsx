import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { IS_WEB } from './config/platform';
import { I18nProvider } from './i18n';
import { metaStore } from './services/metaStore';
import { markSwUpdateReady } from './services/swUpdate';
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

/** 首屏数据落定后，再等这么久才注册 Service Worker */
const SW_REGISTER_DELAY_MS = 1500;

/**
 * PWA 离线支持：**只在纯 Web 环境**注册 Service Worker。
 *
 * 原生壳（Capacitor Android）绝不能注册——WebView 会长期命中缓存里的旧 JS/CSS，
 * 用户覆盖安装新 APK 后看到的还是老界面。动态 import 保证这段逻辑不进原生首屏关键路径。
 *
 * `registerType` 是 autoUpdate（见 vite.config.ts）：新 Service Worker 装好就接管，
 * 旧的不会再长期占着 index.html。但「接管」不等于「立刻刷新」——这里接管了刷新时机，
 * 只把「新版本已就绪」记下来交给顶部提示条，BP 进行中不会被强制刷新丢掉进度。
 */
function registerServiceWorker(): void {
  if (!('serviceWorker' in navigator)) return;
  void import('virtual:pwa-register')
    .then(({ registerSW }) => {
      registerSW({
        immediate: true,
        onNeedReload: () => markSwUpdateReady(),
      });
    })
    .catch(() => {
      /* 注册失败只影响离线能力，不影响在线使用 */
    });
}

/**
 * 注册时机：等首屏数据落定之后再装。
 *
 * 首次访问（新浏览器 / 无痕 / 刚清过缓存）时，Service Worker 一装好就会一口气
 * 预缓存约 10MB 静态资源，其中包含与首屏同一个 `brawl_meta.json`。它和首屏唯一
 * 的关键请求抢同一条带宽，弱网下直接把首屏拖到超时——这就是「无痕模式一直转圈」的成因。
 * 数据进内存之后再注册，两者就不再抢路；离线能力晚一两秒具备，对 BP 没有影响。
 *
 * 加载失败也照常注册：用户点「重试」时预缓存往往已经就绪，第二次几乎瞬时命中。
 */
if (IS_WEB) {
  void metaStore
    .init()
    .catch(() => undefined)
    .then(() => {
      window.setTimeout(registerServiceWorker, SW_REGISTER_DELAY_MS);
    });
}
