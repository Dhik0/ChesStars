/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

/**
 * 构建时注入的应用版本号，值来自 package.json 的 `version` 字段。
 * 见 vite.config.ts 的 `define`。
 */
declare const __APP_VERSION__: string;
