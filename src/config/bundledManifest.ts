/**
 * 打包进 App 的 version.json 副本。
 *
 * 构建时由 Vite 从仓库根目录内联，因此**不依赖网络**也能读到 qqGroupUrl 这类长期配置：
 * 即使这次启动还没触发过更新检查，设置页的 QQ 群入口也能常驻显示。
 * 远程清单（jsDelivr / Raw）只是把它热更新成更新的版本。
 */
import raw from '../../version.json';

const text = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');

/** 内置清单里的 QQ 群链接；没配（空串）时为 null */
export const bundledQqGroupUrl: string | null = (() => {
  const url = text(raw.qqGroupUrl);
  return /^https?:\/\//i.test(url) ? url : null;
})();
