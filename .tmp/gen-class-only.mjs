import { readFileSync, writeFileSync } from 'node:fs';

const src = readFileSync('src/data/brawlerProfile.ts', 'utf-8');
const rows = [...src.matchAll(/^\s+'?([a-z0-9]+)'?:\s*\{ cls: '(\w+)', traits: \[[^\]]*\] \},/gm)].map(
  (m) => ({ key: m[1], cls: m[2] }),
);

// 去重（保留首个）
const seen = new Set();
const unique = rows.filter((r) => (seen.has(r.key) ? false : (seen.add(r.key), true)));

const body = unique
  .map((r) => {
    const keyStr = /^[a-z_$][a-z0-9_$]*$/.test(r.key) ? r.key : `'${r.key}'`;
    const pad = ' '.repeat(Math.max(0, 14 - r.key.length));
    return `  ${keyStr}:${pad}'${r.cls}',`;
  })
  .join('\n');

const file = `/**
 * 英雄职业分类 —— 一级标签，单选
 *
 * 数据来源：api.brawlapi.com 的官方 class 字段，108 个英雄全部匹配，无兜底值。
 *
 * 重要：「召唤」「破墙」「位移」这类是**能力**，不是职业，不要写进 cls。
 * 官方分类有时反直觉，但以官方为准：
 *   杰西 = 控场（不是召唤）、妮塔 = 火力手、塔拉 = 火力手、格里夫 = 控场、阿博 = 控场。
 *
 * 维护方式：改下面的 BRAWLER_CLASS，key 规则 = 英文名小写 + 去掉所有非字母数字
 * （EL PRIMO -> elprimo，8-BIT -> '8bit'，注意数字开头要加引号）。
 */

export type BrawlerClass =
  | 'TANK'
  | 'DAMAGE'
  | 'MARKSMAN'
  | 'ARTILLERY'
  | 'ASSASSIN'
  | 'CONTROL'
  | 'SUPPORT';

export const CLASS_LABEL: Record<BrawlerClass, string> = {
  TANK: '坦克',
  DAMAGE: '火力手',
  MARKSMAN: '狙击手',
  ARTILLERY: '投手',
  ASSASSIN: '刺客',
  CONTROL: '控场',
  SUPPORT: '辅助',
};

/** 职业主题色（列表标签用，与蓝队/红队色区分） */
export const CLASS_COLOR: Record<BrawlerClass, string> = {
  TANK: '#F97316',
  DAMAGE: '#EF4444',
  MARKSMAN: '#38BDF8',
  ARTILLERY: '#A855F7',
  ASSASSIN: '#EC4899',
  CONTROL: '#14B8A6',
  SUPPORT: '#22C55E',
};

/** 职业展示顺序（筛选栏用） */
export const CLASS_ORDER: BrawlerClass[] = [
  'TANK',
  'DAMAGE',
  'MARKSMAN',
  'ARTILLERY',
  'ASSASSIN',
  'CONTROL',
  'SUPPORT',
];

/** 英雄 -> 职业 */
export const BRAWLER_CLASS: Record<string, BrawlerClass> = {
${body}
};

/** 取职业；未收录时兜底为火力手，不抛错 */
export function classOf(normalizedName: string): BrawlerClass {
  return BRAWLER_CLASS[normalizedName] ?? 'DAMAGE';
}
`;

writeFileSync('src/data/brawlerProfile.ts', file, 'utf-8');
console.log(`已写入 ${unique.length} 条职业映射`);
const cnt = {};
unique.forEach((r) => (cnt[r.cls] = (cnt[r.cls] || 0) + 1));
console.log('分布:', cnt);
