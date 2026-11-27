import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.brawldraft.assistant',
  appName: '乱斗BP助手',
  webDir: 'dist',
  // WebView 使用 https://localhost 协议，fetch('./data/brawl_meta.json') 与
  // localStorage 均可正常工作；vite base 已设为 './' 以适配。
  server: {
    androidScheme: 'https',
  },
  android: {
    // WebView 底色：与默认的纯黑主题一致，首帧不会闪出深蓝
    backgroundColor: '#000000',
    // 允许在自由小窗 / 分屏模式下正常布局
    allowMixedContent: false,
  },
  ios: {
    contentInset: 'never',
  },
};

export default config;
