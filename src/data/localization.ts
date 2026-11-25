import type { ModeKey } from '../types/meta';
import { assetUrl } from '../utils/asset';
import { brawlerName, normalizeName } from '../i18n/gameData';

/**
 * 展示层共用的「非文案」资源：名称归一化、搜索打分、头像 / 图标地址、模式配色。
 *
 * 这里**不再存放任何译名表**：英雄 / 地图 / 模式 / 段位的多语言映射全部在
 * `src/i18n/gameData.ts`，界面通过 `useTranslation()` 取值。
 */

/** 名称归一化：小写 + 去掉所有非字母数字（`EL PRIMO` / `el-primo` → `elprimo`） */
export { normalizeName, ROLE_NAME_ALIAS } from '../i18n/gameData';

/** 6 个模式的官方主题色（名称见 `i18n/locales` 的 `mode.*`） */
export const MODE_COLOR: Record<ModeKey, string> = {
  bounty: '#F59E0B',
  brawlBall: '#22C55E',
  knockout: '#A855F7',
  hotZone: '#EF4444',
  gemGrab: '#8B5CF6',
  heist: '#06B6D4',
};

/** 模式在 UI 中的展示顺序 */
export const MODE_ORDER: ModeKey[] = [
  'bounty',
  'brawlBall',
  'knockout',
  'hotZone',
  'gemGrab',
  'heist',
];

export function modeColor(mode: string): string {
  return MODE_COLOR[mode as ModeKey] ?? '#64748B';
}

/**
 * 简体中文英雄名（默认语言的便捷包装）。
 *
 * 界面请用 `useTranslation().brawler(name)`；这个包装只留给纯函数 / 单测场景，
 * 例如断言译名表覆盖率。
 */
export function brawlerCN(englishName: string): string {
  return brawlerName('zh-CN', englishName);
}

/**
 * 头像：本地静态资源（`public/brawlers/{id}.png`，由 `scripts/fetch-avatars.mjs` 批量拉取）。
 * 本地化是为了离线可用 + 首屏零延迟，不会再出现等 CDN 的空白块。
 */
export function avatarUrl(id: number): string {
  return assetUrl(`brawlers/${id}.png`);
}

/** 本地头像缺失时的兜底：Brawlify 无边框图标（在线） */
export function avatarCdnUrl(id: number): string {
  return `https://cdn.brawlify.com/brawlers/borderless/${id}.png`;
}

/** 模式图标（`public/modes/{mode}.png`，官方 game-mode 图标） */
export function modeIconUrl(mode: string): string {
  return assetUrl(`modes/${mode}.png`);
}

/**
 * 确定性配色：同一 id 永远得到同一颜色，用于头像加载失败时的兜底底色。
 */
export function fallbackColor(id: number): string {
  const palette = [
    '#3B82F6', '#EF4444', '#22C55E', '#F59E0B', '#A855F7',
    '#06B6D4', '#EC4899', '#84CC16', '#F97316', '#8B5CF6',
    '#14B8A6', '#EAB308',
  ];
  return palette[Math.abs(id) % palette.length];
}

/** 头像兜底用的首字：中文 / 日文取首字，拉丁字母取首字母 */
export function avatarInitial(displayName: string): string {
  if (/[\u3000-\u9fff\uf900-\ufaff]/.test(displayName)) return displayName.slice(0, 1);
  return displayName.replace(/[^A-Za-z0-9]/g, '').slice(0, 1).toUpperCase() || '?';
}

/**
 * 搜索匹配：当前语言译名 / 英文名 / 拼音首字母 / 别名。
 * 返回 0 表示不匹配，1~6 表示匹配度（越小越精确）。
 *
 * 注意两个坑：
 *   1. 完全匹配必须返回 >0，否则会被调用方 `>0` 的过滤条件误杀；
 *   2. normalizeName 会删掉中文，纯中文查询的归一化结果是空串，
 *      必须跳过基于空串的英文匹配（否则 startsWith('') 恒为 true）。
 */
export function matchScore(
  query: string,
  englishName: string,
  localizedName: string,
  aliases: string[],
): number {
  const q = query.trim().toLowerCase();
  if (!q) return 1;

  const en = englishName.toLowerCase();
  const qn = normalizeName(q);
  const aliasLower = aliases.map((a) => a.toLowerCase());
  const localizedLower = localizedName.toLowerCase();

  // 原文精确匹配
  if (localizedLower === q || en === q) return 1;
  if (localizedLower.startsWith(q)) return 2;

  // 英文/拼音归一化匹配（仅当查询本身含字母数字时才成立）
  if (qn) {
    const enn = normalizeName(englishName);
    if (enn === qn) return 1;
    if (enn.startsWith(qn)) return 2;
    if (aliasLower.some((a) => normalizeName(a) === qn)) return 3;
    if (aliasLower.some((a) => normalizeName(a).startsWith(qn))) return 4;
    if (enn.includes(qn)) return 5;
  }

  // 别名原文匹配（支持「铲子」这类中文黑话）
  if (aliasLower.some((a) => a === q)) return 3;
  if (aliasLower.some((a) => a.startsWith(q))) return 4;
  if (en.includes(q)) return 5;
  if (localizedLower.includes(q)) return 5;
  if (aliasLower.some((a) => a.includes(q))) return 6;

  return 0;
}
