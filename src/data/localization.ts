import type { ModeKey } from '../types/meta';
import { assetUrl } from '../utils/asset';

/**
 * 名称归一化：小写 + 去掉所有非字母数字。
 * 用于让 "EL PRIMO" / "El Primo" / "el-primo" 指向同一个 key。
 */
export function normalizeName(raw: string): string {
  return raw.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/** 6 个模式的中文名与配色 */
export interface ModeLocale {
  cn: string;
  short: string;
  color: string;
}

export const MODE_LOCALE: Record<ModeKey, ModeLocale> = {
  bounty: { cn: '赏金猎人', short: '赏金', color: '#F59E0B' },
  brawlBall: { cn: '乱斗足球', short: '足球', color: '#22C55E' },
  knockout: { cn: '淘汰赛', short: '淘汰', color: '#A855F7' },
  hotZone: { cn: '热区争夺', short: '热区', color: '#EF4444' },
  gemGrab: { cn: '宝石争霸', short: '宝石', color: '#8B5CF6' },
  heist: { cn: '金库攻防', short: '金库', color: '#06B6D4' },
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

/** 24 张排位地图的中文名 */
export const MAP_CN: Record<string, string> = {
  'Shooting Star': '神秘流星',
  'Dry Season': '酷热地带',
  Hideout: '草丛迷踪',
  'Layer Cake': '夹心蛋糕',
  'Center Stage': '中心舞台',
  'Triple Dribble': '三重威胁',
  'Pinball Dreams': '梦幻弹珠',
  'Sneaky Fields': '绿茵球场',
  'Bridge Too Far': '遥远的桥',
  'Hot Potato': '烫手山芋',
  'Kaboom Canyon': '轰隆峡谷',
  'Safe Zone': '安全区域',
  "Belle's Rock": '摇滚贝尔',
  'New Horizons': '新地平线',
  'Flaring Phoenix': '烈焰凤凰',
  'Out in the Open': '开阔荒野',
  Undermine: '十面埋伏',
  'Gem Fort': '宝石要塞',
  'Hard Rock Mine': '硬石矿井',
  'Double Swoosh': '嗖嗖作响',
  'Dueling Beetles': '甲虫决斗',
  'Open Business': '开门营业',
  'Parallel Plays': '平行游戏',
  'Ring of Fire': '灼热火圈',
  // 2026-11 新增淘汰赛地图
  'Goldarm Gulch': '金臂峡谷',
  'Flowing Springs': '涓涓溪流', 
};

/** 单英雄的本地化条目 */
export interface BrawlerLocale {
  /** 中文名 */
  cn: string;
  /** 额外搜索别名：拼音首字母、常见简称、黑话 */
  aliases: string[];
}

/**
 * 英雄中文化 + 搜索别名表。
 * key 使用 normalizeName(英文名)，与 JSON 中的 UPPER CASE 名可无感匹配。
 */
export const BRAWLER_LOCALE: Record<string, BrawlerLocale> = {
  shelly: { cn: '雪莉', aliases: ['xl', 'xueli', '霰弹'] },
  colt: { cn: '柯尔特', aliases: ['ket', 'ke', 'keerte'] },
  bull: { cn: '公牛', aliases: ['gn', 'gongniu', '牛'] },
  brock: { cn: '布洛克', aliases: ['blk', 'buluoke', '火箭'] },
  rico: { cn: '瑞科', aliases: ['rk', 'ruike', '弹球'] },
  spike: { cn: '斯派克', aliases: ['spk', 'sipaike', '仙人掌'] },
  barley: { cn: '巴利', aliases: ['bl', 'bali', '酒保'] },
  jessie: { cn: '杰西', aliases: ['jx', 'jiexi', '炮台'] },
  nita: { cn: '妮塔', aliases: ['nt', 'nita', '熊'] },
  dynamike: { cn: '爆破麦克', aliases: ['bpmk', 'maike', '麦克', '炸弹'] },
  elprimo: { cn: '普里莫', aliases: ['plm', 'pulimo', '拳王'] },
  mortis: { cn: '莫提斯', aliases: ['mts', 'motisi', '铲子'] },
  crow: { cn: '黑鸦', aliases: ['wy', 'wuya'] },
  poco: { cn: '波可', aliases: ['bk', 'boke', '吉他'] },
  bo: { cn: '阿博', aliases: ['bo', '老鹰', '鹰'] },
  piper: { cn: '佩佩', aliases: ['pp', 'peipei', '狙击'] },
  pam: { cn: '帕姆', aliases: ['pm', 'pamu', '奶妈'] },
  tara: { cn: '塔拉', aliases: ['tl', 'tala', '拉人'] },
  darryl: { cn: '达里尔', aliases: ['dle', 'dalier', '桶子'] },
  penny: { cn: '潘妮', aliases: ['pn', 'panni', '炮'] },
  frank: { cn: '弗兰克', aliases: ['flk', 'fulanke', '锤'] },
  gene: { cn: '吉恩', aliases: ['je', 'jien', '拉手'] },
  tick: { cn: '迪克', aliases: ['tk', 'tike', '地雷'] },
  leon: { cn: '里昂', aliases: ['la', 'liang', '隐身'] },
  rosa: { cn: '罗莎', aliases: ['ls', 'luosha', '草盾'] },
  carl: { cn: '卡尔', aliases: ['ke', 'kaer', '矿车'] },
  bibi: { cn: '比比', aliases: ['bb', 'bibi', '棒球'] },
  '8bit': { cn: '8比特', aliases: ['8bt', '8bite', '8位'] },
  sandy: { cn: '沙迪', aliases: ['sd', 'sangdi', '睡神'] },
  bea: { cn: '贝亚', aliases: ['bi', 'bea', '蜜蜂'] },
  emz: { cn: '艾魅', aliases: ['amz', 'aimuzi', '发胶'] },
  mrp: { cn: 'P先生', aliases: ['pxs', 'p先生', '企鹅'] },
  max: { cn: '麦克斯', aliases: ['mks', 'maikesi', '加速'] },
  jacky: { cn: '雅琪', aliases: ['jq', 'jieji', '震动'] },
  gale: { cn: '格尔', aliases: ['ge', 'gaier', '风'] },
  nani: { cn: '纳尼', aliases: ['nn', 'nani', '回旋'] },
  sprout: { cn: '芽芽', aliases: ['yy', 'yaya', '树墙'] },
  surge: { cn: '瑟奇', aliases: ['sq', 'seqi', '升级'] },
  colette: { cn: '科莱特', aliases: ['klt', 'kelaite', '百分比'] },
  amber: { cn: '琥珀', aliases: ['ap', 'anpo', '火'] },
  lou: { cn: '小罗', aliases: ['lu', '冰'] },
  byron: { cn: '拜伦', aliases: ['bl', 'bailun', '毒'] },
  edgar: { cn: '埃德加', aliases: ['adj', 'aidejia', '围巾'] },
  ruffs: { cn: '拉夫', aliases: ['lfs', 'lafusi', '上校'] },
  stu: { cn: '斯图', aliases: ['st', 'situ', '油门'] },
  belle: { cn: '贝尔', aliases: ['be', 'beier', '电枪'] },
  squeak: { cn: '史魁克', aliases: ['sqk', 'sikuike', '粘液'] },
  grom: { cn: '格罗姆', aliases: ['glm', 'geluomu', '投弹'] },
  buzz: { cn: '巴兹', aliases: ['bs', 'basi', '救生圈'] },
  griff: { cn: '格里夫', aliases: ['glf', 'gelifu', '硬币'] },
  ash: { cn: '阿拾', aliases: ['as', 'ashi', '狂暴'] },
  meg: { cn: '梅格', aliases: ['mg', 'meige', '机甲'] },
  lola: { cn: '萝拉', aliases: ['ll', 'luola', '分身'] },
  fang: { cn: '阿方', aliases: ['fang', '踢'] },
  eve: { cn: '伊芙', aliases: ['yf', 'yifu', '卵'] },
  janet: { cn: '珍妮特', aliases: ['znt', 'zhennite', '飞行'] },
  bonnie: { cn: '邦妮', aliases: ['bn', 'bangni', '炮弹'] },
  otis: { cn: '奥蒂斯', aliases: ['ads', 'aodisi', '水枪'] },
  sam: { cn: '山姆', aliases: ['sm', 'samu', '拳套'] },
  gus: { cn: '格斯', aliases: ['gs', 'gesi', '幽灵'] },
  buster: { cn: '巴斯特', aliases: ['bst', 'basite', '盾牌'] },
  chester: { cn: '切斯特', aliases: ['qst', 'qiesite', '随机'] },
  gray: { cn: '戈雷', aliases: ['gl', 'gelei', '传送门'] },
  mandy: { cn: '曼迪', aliases: ['md', 'mandi', '狙击'] },
  rt: { cn: 'RT', aliases: ['rt', '机器'] },
  willow: { cn: '薇洛', aliases: ['wl', 'weiluo', '附身'] },
  maisie: { cn: '梅茜', aliases: ['mq', 'meiqian', '地震'] },
  hank: { cn: '汉克', aliases: ['hk', 'hanke', '泡泡'] },
  cordelius: { cn: '科迪琉斯', aliases: ['kdls', 'kediliusi', '暗影'] },
  doug: { cn: '道格', aliases: ['dg', 'daoge', '热狗'] },
  pearl: { cn: '珀尔', aliases: ['pe', 'poer', '烤箱'] },
  chuck: { cn: '查克', aliases: ['ck', 'chake', '火车'] },
  charlie: { cn: '查理', aliases: ['cl', 'chali', '蛛网'] },
  mico: { cn: '米科', aliases: ['mk', 'mike', '猴子'] },
  kit: { cn: '凯特', aliases: ['jt', 'jite', '猫'] },
  larrylawrie: { cn: '拉里和劳里', aliases: ['llhl', 'larry', 'lawrie', 'laurie', '双人'] },
  melodie: { cn: '麦乐迪', aliases: ['mld', 'meiluodi', '音符'] },
  angelo: { cn: '安吉洛', aliases: ['ajl', 'anjiluo', '毒箭'] },
  draco: { cn: '德拉科', aliases: ['dlk', 'delake', '龙'] },
  lily: { cn: '莉莉', aliases: ['ll', 'lili', '暗界'] },
  berry: { cn: '拜瑞', aliases: ['br', 'beirui', '冰淇淋'] },
  clancy: { cn: '克兰西', aliases: ['klx', 'kelanxi', '卡牌'] },
  moe: { cn: '钻地阿萌', aliases: ['mo', '老鼠'] },
  kenji: { cn: '健次', aliases: ['je', 'jianer', '刀'] },
  shade: { cn: '谢德', aliases: ['xd', 'xiede', '阴影'] },
  juju: { cn: '珠珠', aliases: ['zz', 'zhuzhu', '玩偶'] },
  meeple: { cn: '谜宝', aliases: ['mp', 'mipu', '棋子'] },
  ollie: { cn: '奥利', aliases: ['al', 'aoli', '滑板'] },
  lumi: { cn: '露米', aliases: ['lm', 'lumi', '光'] },
  finx: { cn: '芬克斯', aliases: ['fks', 'fenkesi', '时间'] },
  jaeyong: { cn: '载勇', aliases: ['zy', 'zaiyong', '韩国入'] },
  kaze: { cn: '风姬', aliases: ['kz', 'kaze', '小凤'] },
  alli: { cn: '鳄梨', aliases: ['al', 'ali', '鳄鱼'] },
  trunk: { cn: '桩', aliases: ['tlk', 'telanke', '滚木'] },
  mina: { cn: '米娜', aliases: ['mn', 'mina', '蝶'] },
  ziggy: { cn: '兹奇', aliases: ['zg', 'qige', '涂鸦'] },
  pierce: { cn: '皮尔斯', aliases: ['pes', 'piersi', '标枪'] },
  gigi: { cn: '琪琪', aliases: ['jj', 'jiji', '青蛙'] },
  glowy: { cn: '格鲁伊', aliases: ['glw', 'geluowei', '荧光'] },
  sirius: { cn: '西里乌斯', aliases: ['tlx', 'tianlangxing', '星'] },
  najia: { cn: '娜吉亚', aliases: ['nj', 'najia', '蛇'] },
  damian: { cn: '达米安', aliases: ['dma', 'damian', '恶魔'] },
  starrnova: { cn: '斯塔诺娃', aliases: ['starr', 'nova', 'ste', 'sitaer', '星'] },
  bolt: { cn: '博尔特', aliases: ['bet', 'boerte', '电'] },
  nori: { cn: '阿宪', aliases: ['nl', 'nuoli', '海苔'] },
  wendy: { cn: '温蒂', aliases: ['wd', 'wendi', '风'] },
  cosmo: { cn: '科斯莫', aliases: ['ksm', 'kesimo',] },
  vince: { cn: '文斯', aliases: ['ws', 'wensi', '虫'] },
  thunderfrogs: { cn: '雷电蛙', aliases: ['tf', 'thunder', 'frogs', '青蛙'] },
};

/**
 * roles 表与英雄字典的拼写差异修正。
 * 实测数据：roles 里写 "Larry & Laurie"，字典里是 "LARRY & LAWRIE"。
 */
export const ROLE_NAME_ALIAS: Record<string, string> = {
  larrylaurie: 'larrylawrie',
};

/** 取英雄中文名，未收录时优雅回退英文名 */
export function brawlerCN(englishName: string): string {
  const loc = BRAWLER_LOCALE[normalizeName(englishName)];
  return loc ? loc.cn : englishName;
}

/** 取地图中文名，未收录时回退英文名 */
export function mapCN(mapName: string): string {
  return MAP_CN[mapName] ?? mapName;
}

/** 取模式中文名 */
export function modeCN(mode: string): string {
  return MODE_LOCALE[mode as ModeKey]?.cn ?? mode;
}

export function modeShort(mode: string): string {
  return MODE_LOCALE[mode as ModeKey]?.short ?? mode;
}

export function modeColor(mode: string): string {
  return MODE_LOCALE[mode as ModeKey]?.color ?? '#64748B';
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

/** 头像兜底用的首字：中文取首字，英文取首字母 */
export function avatarInitial(englishName: string): string {
  const cn = brawlerCN(englishName);
  if (/[\u4e00-\u9fa5]/.test(cn)) return cn.slice(0, 1);
  return englishName.replace(/[^A-Za-z0-9]/g, '').slice(0, 1).toUpperCase() || '?';
}

/**
 * 搜索匹配：中文名 / 英文名 / 拼音首字母 / 别名。
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
  cnName: string,
  aliases: string[],
): number {
  const q = query.trim().toLowerCase();
  if (!q) return 1;

  const en = englishName.toLowerCase();
  const qn = normalizeName(q);
  const aliasLower = aliases.map((a) => a.toLowerCase());

  // 原文精确匹配
  if (cnName === q || en === q) return 1;
  if (cnName.startsWith(q)) return 2;

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
  if (cnName.includes(q)) return 5;
  if (aliasLower.some((a) => a.includes(q))) return 6;

  return 0;
}
