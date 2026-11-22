/**
 * 静态资源路径拼接。
 *
 * 必须走 `import.meta.env.BASE_URL`：vite 配了 `base: './'`，
 * Capacitor 下页面是 `file:///android_asset/public/index.html`，
 * 用绝对路径 `/xxx.png` 会直接 404。
 */
export function assetUrl(path: string): string {
  const base = import.meta.env?.BASE_URL ?? './';
  const prefix = base.endsWith('/') ? base : `${base}/`;
  return `${prefix}${path.replace(/^\/+/, '')}`;
}
