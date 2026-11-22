/**
 * 生成 src/data/brawlerProfile.ts
 *
 * 职业：来自 api.brawlapi.com 的官方 class 字段（108/108 匹配）
 * 能力：手工标注的高置信度核心机制（不是 star power / gadget 这类可选装备）
 *       2025 之后的新英雄若无法确认，一律留空，等人工补充
 */
import { readFileSync, writeFileSync } from 'node:fs';

const api = JSON.parse(readFileSync('.tmp/brawlers.json', 'utf-8')).list;
const meta = JSON.parse(readFileSync('public/data/brawl_meta.json', 'utf-8'));

const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

/** 官方 class -> 本地枚举 */
const CLASS_MAP = {
  Tank: 'TANK',
  'Damage Dealer': 'DAMAGE',
  Marksman: 'MARKSMAN',
  Artillery: 'ARTILLERY',
  Assassin: 'ASSASSIN',
  Controller: 'CONTROL',
  Support: 'SUPPORT',
};

/**
 * 能力标签（核心机制层面，不含 star power / gadget 的附带效果）
 * 只列能确认的；不确定的宁可留空。
 */
const TRAITS = {
  // 破墙：来自 brawl_meta.json 的 roles 表（后端统计，权威）
  WALLBREAK: ['Bull', 'El Primo', 'Darryl', 'Brock', 'Griff', 'Gale'],

  // 位移：超级技能自带突进/跳跃/传送/加速冲刺
  MOBILITY: [
    'Bull', 'El Primo', 'Darryl', 'Crow', 'Mortis', 'Edgar', 'Stu', 'Buzz',
    'Fang', 'Sam', 'Kit', 'Mico', 'Lily', 'Kenji', 'Draco', 'Bonnie',
    'Piper', 'Surge', 'Max', 'Gale', 'Gray', 'Chuck', 'Melodie', 'Moe',
    'Ollie',
  ],

  // 治疗：能给队友或自己持续回血
  HEAL: ['Poco', 'Pam', 'Byron', 'Berry', 'Doug', 'Kit'],

  // 隐身：主动进入不可见状态
  STEALTH: ['Leon', 'Willow', 'Shade'],

  // 召唤：留下持续存在的单位（熊/炮台/影子/企鹅等）
  SUMMON: ['Nita', 'Jessie', 'Penny', 'Pam', 'Tara', 'Mr. P', 'Sprout'],

  // 控制：减速/眩晕/击退/拉拽/沉默/冰冻
  SLOW: [
    'Barley', 'Spike', 'Emz', 'Lou', 'Sandy', 'Gale', 'Squeak', 'Otis',
    'Bo', 'Tara', 'Gene', 'Frank', 'Bibi', 'Dynamike', 'Tick', 'Mandy',
  ],

  // 护盾：主动获得减伤或吸收伤害
  SHIELD: ['Rosa', 'Buster', 'Jacky', 'Ash', 'Bull'],
};

/** 反查：英雄名 -> 能力列表 */
const traitMap = new Map();
for (const [trait, names] of Object.entries(TRAITS)) {
  for (const n of names) {
    const k = norm(n);
    if (!traitMap.has(k)) traitMap.set(k, []);
    traitMap.get(k).push(trait);
  }
}

const apiMap = new Map(api.map((b) => [norm(b.name), b]));

const rows = [];
const missingClass = [];
const unknownTraitNames = [];

for (const b of meta.brawlers) {
  const k = norm(b.name);
  const a = apiMap.get(k);
  const cls = a && a.class ? CLASS_MAP[a.class.name] : null;
  if (!cls) {
    missingClass.push(b.name);
    continue;
  }
  const traits = traitMap.get(k) ?? [];
  rows.push({ key: k, name: b.name, cls, traits });
}

// 检查能力表里有没有写错的名字
for (const names of Object.values(TRAITS)) {
  for (const n of names) {
    if (!apiMap.has(norm(n))) unknownTraitNames.push(n);
  }
}

const TRAIT_ORDER = ['WALLBREAK', 'MOBILITY', 'HEAL', 'STEALTH', 'SUMMON', 'SLOW', 'SHIELD'];

const body = rows
  .map((r) => {
    const t = r.traits.length
      ? `[${r.traits
          .slice()
          .sort((a, b2) => TRAIT_ORDER.indexOf(a) - TRAIT_ORDER.indexOf(b2))
          .map((x) => `'${x}'`)
          .join(', ')}]`
      : '[]';
    // 以数字开头的 key（如 8bit）不是合法标识符，必须加引号
    const keyStr = /^[a-z_$][a-z0-9_$]*$/.test(r.key) ? r.key : `'${r.key}'`;
    const pad = ' '.repeat(Math.max(0, 14 - r.key.length));
    return `  ${keyStr}:${pad}{ cls: '${r.cls}', traits: ${t} },`;
  })
  .join('\n');

const file = `/**
 * 英雄职业 + 能力标签（一级职业单选 / 二级能力多选）
 *
 * 数据来源：
 *   - 职业：api.brawlapi.com 官方 class 字段（108/108 全部匹配）
 *   - 能力：核心机制层面的手工标注。WALLBREAK 来自 brawl_meta.json 的 roles 表（后端统计）；
 *           其余为人工判断，只收录能确认的，不确定的留空（新英雄普遍为空）。
 *
 * 维护方式：直接改下面的 BRAWLER_PROFILE，改完运行 \`node scripts/check-locale.mjs\` 自检。
 * key 规则：英文名小写 + 去掉所有非字母数字（EL PRIMO -> elprimo）。
 */

/** 一级：官方职业分类（单选） */
export type BrawlerClass =
  | 'TANK'
  | 'DAMAGE'
  | 'MARKSMAN'
  | 'ARTILLERY'
  | 'ASSASSIN'
  | 'CONTROL'
  | 'SUPPORT';

/** 二级：能力标签（多选） */
export type BrawlerTrait =
  | 'WALLBREAK'
  | 'MOBILITY'
  | 'HEAL'
  | 'STEALTH'
  | 'SUMMON'
  | 'SLOW'
  | 'SHIELD';

export const CLASS_LABEL: Record<BrawlerClass, string> = {
  TANK: '坦克',
  DAMAGE: '火力手',
  MARKSMAN: '狙击手',
  ARTILLERY: '投手',
  ASSASSIN: '刺客',
  CONTROL: '控场',
  SUPPORT: '辅助',
};

/** 职业主题色（用于列表标签，与队色区分开） */
export const CLASS_COLOR: Record<BrawlerClass, string> = {
  TANK: '#F97316',
  DAMAGE: '#EF4444',
  MARKSMAN: '#38BDF8',
  ARTILLERY: '#A855F7',
  ASSASSIN: '#EC4899',
  CONTROL: '#14B8A6',
  SUPPORT: '#22C55E',
};

export const TRAIT_LABEL: Record<BrawlerTrait, string> = {
  WALLBREAK: '破墙',
  MOBILITY: '位移',
  HEAL: '治疗',
  STEALTH: '隐身',
  SUMMON: '召唤',
  SLOW: '控制',
  SHIELD: '护盾',
};

export interface BrawlerProfile {
  cls: BrawlerClass;
  traits: BrawlerTrait[];
}

export const BRAWLER_PROFILE: Record<string, BrawlerProfile> = {
${body}
};

const EMPTY: BrawlerProfile = { cls: 'DAMAGE', traits: [] };

/** 取英雄档案；未收录时给一个中性兜底，不抛错 */
export function profileOf(normalizedName: string): BrawlerProfile {
  return BRAWLER_PROFILE[normalizedName] ?? EMPTY;
}
`;

writeFileSync('src/data/brawlerProfile.ts', file, 'utf-8');

console.log(`已生成 ${rows.length} 条英雄档案`);
console.log('缺失职业:', missingClass.length ? missingClass.join(', ') : '(无)');
console.log('能力表里写错的名字:', unknownTraitNames.length ? unknownTraitNames.join(', ') : '(无)');
const cnt = {};
rows.forEach((r) => r.traits.forEach((t) => (cnt[t] = (cnt[t] || 0) + 1)));
console.log('能力覆盖:', cnt);
console.log('无任何能力标签的英雄:', rows.filter((r) => r.traits.length === 0).length);
