/**
 * 地图缩略图的本地路径映射。
 *
 * 图片由 `scripts/fetch-map-thumbs.mjs` 从 Brawlify CDN 批量拉取后落在
 * `public/maps/{slug}.png`，随应用一起打包，Android 离线（file://）也能加载，
 * 不依赖任何网络请求。
 *
 * 路径必须走 `import.meta.env.BASE_URL`：vite 配置了 `base: './'`，
 * Capacitor 下页面是 `file:///android_asset/public/index.html`，
 * 用绝对路径 `/maps/x.png` 会直接 404。
 */

import { assetUrl } from './asset';

/** 地图名 → 文件名 slug：去掉撇号，其余非字母数字压成单个连字符 */
export function mapSlug(mapName: string): string {
  return mapName
    .toLowerCase()
    .replace(/['’`]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

/** 地图缩略图的相对 URL（如 `./maps/hard-rock-mine.png`） */
export function mapImageUrl(mapName: string): string {
  return assetUrl(`maps/${mapSlug(mapName)}.png`);
}
