/**
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
  shelly:        'DAMAGE',
  colt:          'DAMAGE',
  bull:          'TANK',
  brock:         'MARKSMAN',
  rico:          'DAMAGE',
  spike:         'DAMAGE',
  barley:        'ARTILLERY',
  jessie:        'CONTROL',
  nita:          'DAMAGE',
  dynamike:      'ARTILLERY',
  elprimo:       'TANK',
  mortis:        'ASSASSIN',
  crow:          'ASSASSIN',
  poco:          'SUPPORT',
  bo:            'CONTROL',
  piper:         'MARKSMAN',
  pam:           'SUPPORT',
  tara:          'DAMAGE',
  darryl:        'TANK',
  penny:         'CONTROL',
  frank:         'TANK',
  gene:          'CONTROL',
  tick:          'ARTILLERY',
  leon:          'ASSASSIN',
  rosa:          'TANK',
  carl:          'DAMAGE',
  bibi:          'TANK',
  '8bit':          'DAMAGE',
  sandy:         'CONTROL',
  bea:           'MARKSMAN',
  emz:           'CONTROL',
  mrp:           'CONTROL',
  max:           'SUPPORT',
  jacky:         'TANK',
  gale:          'CONTROL',
  nani:          'MARKSMAN',
  sprout:        'ARTILLERY',
  surge:         'DAMAGE',
  colette:       'DAMAGE',
  amber:         'CONTROL',
  lou:           'CONTROL',
  byron:         'SUPPORT',
  edgar:         'ASSASSIN',
  ruffs:         'SUPPORT',
  stu:           'ASSASSIN',
  belle:         'MARKSMAN',
  squeak:        'CONTROL',
  grom:          'ARTILLERY',
  buzz:          'ASSASSIN',
  griff:         'CONTROL',
  ash:           'TANK',
  meg:           'TANK',
  lola:          'DAMAGE',
  fang:          'ASSASSIN',
  eve:           'DAMAGE',
  janet:         'MARKSMAN',
  bonnie:        'MARKSMAN',
  otis:          'CONTROL',
  sam:           'ASSASSIN',
  gus:           'SUPPORT',
  buster:        'TANK',
  chester:       'DAMAGE',
  gray:          'SUPPORT',
  mandy:         'MARKSMAN',
  rt:            'DAMAGE',
  willow:        'CONTROL',
  maisie:        'MARKSMAN',
  hank:          'TANK',
  cordelius:     'ASSASSIN',
  doug:          'SUPPORT',
  pearl:         'DAMAGE',
  chuck:         'CONTROL',
  charlie:       'CONTROL',
  mico:          'ASSASSIN',
  kit:           'SUPPORT',
  larrylawrie:   'ARTILLERY',
  melodie:       'ASSASSIN',
  angelo:        'MARKSMAN',
  draco:         'TANK',
  lily:          'ASSASSIN',
  berry:         'SUPPORT',
  clancy:        'DAMAGE',
  moe:           'DAMAGE',
  kenji:         'ASSASSIN',
  shade:         'ASSASSIN',
  juju:          'ARTILLERY',
  meeple:        'CONTROL',
  ollie:         'TANK',
  lumi:          'DAMAGE',
  finx:          'CONTROL',
  jaeyong:       'SUPPORT',
  kaze:          'ASSASSIN',
  alli:          'ASSASSIN',
  trunk:         'TANK',
  mina:          'DAMAGE',
  ziggy:         'CONTROL',
  pierce:        'MARKSMAN',
  gigi:          'ASSASSIN',
  glowy:         'SUPPORT',
  sirius:        'CONTROL',
  najia:         'DAMAGE',
  damian:        'TANK',
  starrnova:     'ASSASSIN',
  bolt:          'TANK',
  nori:          'ASSASSIN',
  wendy:         'SUPPORT',
  cosmo:         'CONTROL',
  vince:         'DAMAGE',
  thunderfrog:   'ARTILLERY',
  thunderfrogs:  'ARTILLERY',
};

/** 取职业；未收录时兜底为火力手，不抛错 */
export function classOf(normalizedName: string): BrawlerClass {
  return BRAWLER_CLASS[normalizedName] ?? 'DAMAGE';
}
