import { translate } from './translate';
import type { Lang } from './langs';

/**
 * 游戏内名词（英雄 / 地图 / 模式 / 段位）的多语言映射。
 *
 * 与 `locales/*.json` 分开的原因：
 *   1. 这份表由数据驱动（108 个英雄会随赛季增长），社区认领翻译时只需要改这里，
 *      不用碰 UI 文案；
 *   2. 英雄名同时要服务**搜索**，必须保留英文原名与简中拼音别名。
 *
 * 译名口径：简中用国服（腾讯）译名，繁中用国际服繁体译名——两者并不等价，
 * 例如 黑鸦→鴉、麦乐迪→美樂蒂、狂牛/公牛、8位元/8比特。
 */

/** 名称归一化：小写 + 去掉所有非字母数字。`EL PRIMO` / `el-primo` → `elprimo` */
export function normalizeName(raw: string): string {
  return raw.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/** 三元组：`[英文原名, 简体, 繁体]` */
type Tri = [en: string, zhCN: string, zhTW: string];

/**
 * 语言 → 译名列下标。
 * 新增语言时：在 `langs.ts` 的 `Lang` / `LANGS` 里加一项、补一份 `locales/xx.json`，
 * 然后在这里加一行（列顺序即 Tri 的追加顺序）。未登记的列会回退英文原名，
 * 所以「先加语言、译名后补」不会让界面出现空白。
 */
const IDX: Partial<Record<Lang, number>> = { en: 0, 'zh-CN': 1, 'zh-TW': 2 };

function pick(row: Tri, lang: Lang): string {
  return row[IDX[lang] ?? 0] ?? row[0];
}

/**
 * 英雄译名表。key = `normalizeName(英文名)`，与数据里的 `UPPER CASE` 名无感匹配。
 * 新增英雄时按字母序插入，缺译名会回退英文原名（不会显示成 key）。
 */
const BRAWLERS: Record<string, Tri> = {
  '8bit': ['8-BIT', '8比特', '比特8號'],
  alli: ['ALLI', '鳄梨', '愛莉'],
  amber: ['AMBER', '琥珀', '安珀'],
  angelo: ['ANGELO', '安吉洛', '安傑洛'],
  ash: ['ASH', '阿拾', '阿信'],
  barley: ['BARLEY', '巴利', '保力'],
  bea: ['BEA', '贝亚', '碧兒'],
  belle: ['BELLE', '贝尔', '蓓爾'],
  berry: ['BERRY', '拜瑞', '貝瑞'],
  bibi: ['BIBI', '比比', '嗶嗶'],
  bo: ['BO', '阿博', '鷹獵人 爆'],
  bolt: ['BOLT', '博尔特', '博爾特'],
  bonnie: ['BONNIE', '邦妮', '邦妮'],
  brock: ['BROCK', '布洛克', '布洛克'],
  bull: ['BULL', '公牛', '狂牛'],
  buster: ['BUSTER', '巴斯特', '巴斯特'],
  buzz: ['BUZZ', '巴兹', '霸子'],
  byron: ['BYRON', '拜伦', '拜倫'],
  carl: ['CARL', '卡尔', '卡爾'],
  charlie: ['CHARLIE', '查理', '查莉'],
  chester: ['CHESTER', '切斯特', '查斯特'],
  chuck: ['CHUCK', '查克', '查克'],
  clancy: ['CLANCY', '克兰西', '克蘭西'],
  colette: ['COLETTE', '科莱特', '葛蕾特'],
  colt: ['COLT', '柯尔特', '柯爾特'],
  cordelius: ['CORDELIUS', '科迪琉斯', '康迪留斯'],
  cosmo: ['COSMO', '科斯莫', '科斯莫'],
  crow: ['CROW', '黑鸦', '鴉'],
  damian: ['DAMIAN', '达米安', '達米安'],
  darryl: ['DARRYL', '达里尔', '達里爾'],
  doug: ['DOUG', '道格', '道格'],
  draco: ['DRACO', '德拉科', '德拉古'],
  dynamike: ['DYNAMIKE', '爆破麦克', '爆破麥克'],
  edgar: ['EDGAR', '埃德加', '艾德加'],
  elprimo: ['EL PRIMO', '普里莫', '艾爾普里莫'],
  emz: ['EMZ', '艾魅', '艾謎'],
  eve: ['EVE', '伊芙', '異芙'],
  fang: ['FANG', '阿方', '範'],
  finx: ['FINX', '芬克斯', '芬克斯'],
  frank: ['FRANK', '弗兰克', '法蘭克'],
  gale: ['GALE', '格尔', '蓋爾'],
  gene: ['GENE', '吉恩', '吉恩'],
  gigi: ['GIGI', '琪琪', '琪琪'],
  glowy: ['GLOWY', '格鲁伊', '格魯伊'],
  gray: ['GRAY', '戈雷', '蓋瑞'],
  griff: ['GRIFF', '格里夫', '格里夫'],
  grom: ['GROM', '格罗姆', '葛羅姆'],
  gus: ['GUS', '格斯', '格斯'],
  hank: ['HANK', '汉克', '漢克'],
  jacky: ['JACKY', '雅琪', '寶姬'],
  jaeyong: ['JAE-YONG', '载勇', '載勇'],
  janet: ['JANET', '珍妮特', '珍娜'],
  jessie: ['JESSIE', '杰西', '潔西'],
  juju: ['JUJU', '珠珠', '茱茱'],
  kaze: ['KAZE', '风姬', '小風'],
  kenji: ['KENJI', '健次', '賢治'],
  kit: ['KIT', '凯特', '凱特'],
  larrylawrie: ['LARRY & LAWRIE', '拉里和劳里', '賴瑞和羅瑞'],
  leon: ['LEON', '里昂', '里昂'],
  lily: ['LILY', '莉莉', '莉莉'],
  lola: ['LOLA', '萝拉', '蘿拉'],
  lou: ['LOU', '小罗', '阿魯'],
  lumi: ['LUMI', '露米', '露米'],
  maisie: ['MAISIE', '梅茜', '麥希'],
  mandy: ['MANDY', '曼迪', '曼蒂'],
  max: ['MAX', '麦克斯', '麥克絲'],
  meg: ['MEG', '梅格', '梅格'],
  meeple: ['MEEPLE', '谜宝', '謎寶'],
  melodie: ['MELODIE', '麦乐迪', '美樂蒂'],
  mico: ['MICO', '米科', '米可'],
  mina: ['MINA', '米娜', '蜜娜'],
  moe: ['MOE', '钻地阿萌', '莫'],
  mortis: ['MORTIS', '莫提斯', '莫提斯'],
  mrp: ['MR. P', 'P先生', 'Mr.P'],
  najia: ['NAJIA', '娜吉亚', '娜吉亞'],
  nani: ['NANI', '纳尼', '納妮'],
  nita: ['NITA', '妮塔', '妮塔'],
  nori: ['NORI', '阿宪', '憲'],
  ollie: ['OLLIE', '奥利', '奧利'],
  otis: ['OTIS', '奥蒂斯', '歐提斯'],
  pam: ['PAM', '帕姆', '帕姆'],
  pearl: ['PEARL', '珀尔', '珀爾'],
  penny: ['PENNY', '潘妮', '佩妮'],
  pierce: ['PIERCE', '皮尔斯', '皮爾斯'],
  piper: ['PIPER', '佩佩', '小辣椒'],
  poco: ['POCO', '波可', '波可'],
  rico: ['RICO', '瑞科', '彈射'],
  rosa: ['ROSA', '罗莎', '羅莎'],
  rt: ['R-T', 'RT', 'R—T'],
  ruffs: ['RUFFS', '拉夫', '拉夫'],
  sam: ['SAM', '山姆', '山姆'],
  sandy: ['SANDY', '沙迪', '沙迪'],
  shade: ['SHADE', '谢德', '謝德'],
  shelly: ['SHELLY', '雪莉', '雪莉'],
  sirius: ['SIRIUS', '西里乌斯', '西里烏斯'],
  spike: ['SPIKE', '斯派克', '史派克'],
  sprout: ['SPROUT', '芽芽', '芽芽'],
  squeak: ['SQUEAK', '史魁克', '斯威克'],
  starrnova: ['STARR NOVA', '斯塔诺娃', '絲塔諾娃'],
  stu: ['STU', '斯图', '駛徒'],
  surge: ['SURGE', '瑟奇', '奔騰'],
  tara: ['TARA', '塔拉', '塔拉'],
  thunderfrogs: ['THUNDER FROGS', '雷电蛙', '雷電蛙'],
  tick: ['TICK', '迪克', '滴答'],
  trunk: ['TRUNK', '桩', '特朗克'],
  vince: ['VINCE', '文斯', '文斯'],
  wendy: ['WENDY', '温蒂', '溫蒂'],
  willow: ['WILLOW', '薇洛', '葳洛'],
  ziggy: ['ZIGGY', '兹奇', '茲奇'],
};

/**
 * 搜索别名（拼音首字母 / 常见简称 / 黑话）。
 * 只在简中语境有意义，但保留给所有语言用：输入 `cz` 找莫提斯对谁都不算坏事。
 */
const BRAWLER_ALIASES: Record<string, string[]> = {
  shelly: ['xl', 'xueli', '霰弹'],
  colt: ['ket', 'ke', 'keerte'],
  bull: ['gn', 'gongniu', '牛'],
  brock: ['blk', 'buluoke', '火箭'],
  rico: ['rk', 'ruike', '弹球'],
  spike: ['spk', 'sipaike', '仙人掌'],
  barley: ['bl', 'bali', '酒保'],
  jessie: ['jx', 'jiexi', '炮台'],
  nita: ['nt', 'nita', '熊'],
  dynamike: ['bpmk', 'maike', '麦克', '炸弹'],
  elprimo: ['plm', 'pulimo', '拳王'],
  mortis: ['mts', 'motisi', '铲子'],
  crow: ['wy', 'wuya'],
  poco: ['bk', 'boke', '吉他'],
  bo: ['bo', '老鹰', '鹰'],
  piper: ['pp', 'peipei', '狙击'],
  pam: ['pm', 'pamu', '奶妈'],
  tara: ['tl', 'tala', '拉人'],
  darryl: ['dle', 'dalier', '桶子'],
  penny: ['pn', 'panni', '炮'],
  frank: ['flk', 'fulanke', '锤'],
  gene: ['je', 'jien', '拉手'],
  tick: ['tk', 'tike', '地雷'],
  leon: ['la', 'liang', '隐身'],
  rosa: ['ls', 'luosha', '草盾'],
  carl: ['ke', 'kaer', '矿车'],
  bibi: ['bb', 'bibi', '棒球'],
  '8bit': ['8bt', '8bite', '8位'],
  sandy: ['sd', 'sangdi', '睡神'],
  bea: ['bi', 'bea', '蜜蜂'],
  emz: ['amz', 'aimuzi', '发胶'],
  mrp: ['pxs', 'p先生', '企鹅'],
  max: ['mks', 'maikesi', '加速'],
  jacky: ['jq', 'jieji', '震动'],
  gale: ['ge', 'gaier', '风'],
  nani: ['nn', 'nani', '回旋'],
  sprout: ['yy', 'yaya', '树墙'],
  surge: ['sq', 'seqi', '升级'],
  colette: ['klt', 'kelaite', '百分比'],
  amber: ['ap', 'anpo', '火'],
  lou: ['lu', '冰'],
  byron: ['bl', 'bailun', '毒'],
  edgar: ['adj', 'aidejia', '围巾'],
  ruffs: ['lfs', 'lafusi', '上校'],
  stu: ['st', 'situ', '油门'],
  belle: ['be', 'beier', '电枪'],
  squeak: ['sqk', 'sikuike', '粘液'],
  grom: ['glm', 'geluomu', '投弹'],
  buzz: ['bs', 'basi', '救生圈'],
  griff: ['glf', 'gelifu', '硬币'],
  ash: ['as', 'ashi', '狂暴'],
  meg: ['mg', 'meige', '机甲'],
  lola: ['ll', 'luola', '分身'],
  fang: ['fang', '踢'],
  eve: ['yf', 'yifu', '卵'],
  janet: ['znt', 'zhennite', '飞行'],
  bonnie: ['bn', 'bangni', '炮弹'],
  otis: ['ads', 'aodisi', '水枪'],
  sam: ['sm', 'samu', '拳套'],
  gus: ['gs', 'gesi', '幽灵'],
  buster: ['bst', 'basite', '盾牌'],
  chester: ['qst', 'qiesite', '随机'],
  gray: ['gl', 'gelei', '传送门'],
  mandy: ['md', 'mandi', '狙击'],
  rt: ['rt', '机器'],
  willow: ['wl', 'weiluo', '附身'],
  maisie: ['mq', 'meiqian', '地震'],
  hank: ['hk', 'hanke', '泡泡'],
  cordelius: ['kdls', 'kediliusi', '暗影'],
  doug: ['dg', 'daoge', '热狗'],
  pearl: ['pe', 'poer', '烤箱'],
  chuck: ['ck', 'chake', '火车'],
  charlie: ['cl', 'chali', '蛛网'],
  mico: ['mk', 'mike', '猴子'],
  kit: ['jt', 'jite', '猫'],
  larrylawrie: ['llhl', 'larry', 'lawrie', 'laurie', '双人'],
  melodie: ['mld', 'meiluodi', '音符'],
  angelo: ['ajl', 'anjiluo', '毒箭'],
  draco: ['dlk', 'delake', '龙'],
  lily: ['ll', 'lili', '暗界'],
  berry: ['br', 'beirui', '冰淇淋'],
  clancy: ['klx', 'kelanxi', '卡牌'],
  moe: ['mo', '老鼠'],
  kenji: ['je', 'jianer', '刀'],
  shade: ['xd', 'xiede', '阴影'],
  juju: ['zz', 'zhuzhu', '玩偶'],
  meeple: ['mp', 'mipu', '棋子'],
  ollie: ['al', 'aoli', '滑板'],
  lumi: ['lm', 'lumi', '光'],
  finx: ['fks', 'fenkesi', '时间'],
  jaeyong: ['zy', 'zaiyong', '韩国入'],
  kaze: ['kz', 'kaze', '小凤'],
  alli: ['al', 'ali', '鳄鱼'],
  trunk: ['tlk', 'telanke', '滚木'],
  mina: ['mn', 'mina', '蝶'],
  ziggy: ['zg', 'qige', '涂鸦'],
  pierce: ['pes', 'piersi', '标枪'],
  gigi: ['jj', 'jiji', '青蛙'],
  glowy: ['glw', 'geluowei', '荧光'],
  sirius: ['tlx', 'tianlangxing', '星'],
  najia: ['nj', 'najia', '蛇'],
  damian: ['dma', 'damian', '恶魔'],
  starrnova: ['starr', 'nova', 'ste', 'sitaer', '星'],
  bolt: ['bet', 'boerte', '电'],
  nori: ['nl', 'nuoli', '海苔'],
  wendy: ['wd', 'wendi', '风'],
  cosmo: ['ksm', 'kesimo'],
  vince: ['ws', 'wensi', '虫'],
  thunderfrogs: ['tf', 'thunder', 'frogs', '青蛙'],
};

/** 地图译名：key = 数据里的英文地图名，值 = `[简体, 繁体]` */
const MAPS: Record<string, [zhCN: string, zhTW: string]> = {
  'Shooting Star': ['神秘流星', '神秘流星'],
  'Dry Season': ['酷热地带', '酷熱地帶'],
  Hideout: ['草丛迷踪', '草叢迷蹤'],
  'Layer Cake': ['夹心蛋糕', '夾心蛋糕'],
  'Center Stage': ['中心舞台', '中心舞台'],
  'Triple Dribble': ['三重威胁', '三重威脅'],
  'Pinball Dreams': ['梦幻弹珠', '夢幻彈珠'],
  'Sneaky Fields': ['绿茵球场', '綠蔭球場'],
  'Bridge Too Far': ['遥远的桥', '遙遠的橋'],
  'Hot Potato': ['烫手山芋', '燙手山芋'],
  'Kaboom Canyon': ['轰隆峡谷', '轟隆峽谷'],
  'Safe Zone': ['安全区域', '安全區域'],
  "Belle's Rock": ['摇滚贝尔', '搖滾貝爾'],
  'New Horizons': ['新地平线', '新地平綫'],
  'Flaring Phoenix': ['烈焰凤凰', '烈焰鳳凰'],
  'Out in the Open': ['开阔荒野', '空曠荒野'],
  Undermine: ['十面埋伏', '地下礦坑'],
  'Gem Fort': ['宝石要塞', '寶石要塞'],
  'Hard Rock Mine': ['硬石矿井', '堅石礦井'],
  'Double Swoosh': ['嗖嗖作响', '咻咻作響'],
  'Dueling Beetles': ['甲虫决斗', '甲蟲決鬥'],
  'Open Business': ['开门营业', '開門大吉'],
  'Parallel Plays': ['平行游戏', '平行游戲'],
  'Ring of Fire': ['灼热火圈', '灼熱火圈'],
  'Goldarm Gulch': ['金臂峡谷', '金臂峽谷'],
  'Flowing Springs': ['涓涓溪流', '潺潺流水'],
};

/**
 * roles 表与英雄字典的拼写差异修正。
 * 实测数据：roles 里写 "Larry & Laurie"，字典里是 "LARRY & LAWRIE"。
 */
export const ROLE_NAME_ALIAS: Record<string, string> = {
  larrylaurie: 'larrylawrie',
};

/** 英雄显示名；未收录时回退英文原名 */
export function brawlerName(lang: Lang, englishName: string): string {
  const row = BRAWLERS[normalizeName(englishName)];
  return row ? pick(row, lang) : englishName;
}

/** 地图显示名；未收录时回退英文原名 */
export function mapName(lang: Lang, englishMapName: string): string {
  const row = MAPS[englishMapName];
  if (!row) return englishMapName;
  return lang === 'zh-TW' ? row[1] : lang === 'zh-CN' ? row[0] : englishMapName;
}

/** 模式全名（赏金猎人 / Bounty / 賞金獵人） */
export function modeName(lang: Lang, mode: string): string {
  const key = `mode.${mode}`;
  const name = translate(lang, key);
  return name === key ? mode : name;
}

/** 模式短名（赏金 / Bounty / 賞金），用于顶栏等窄位置 */
export function modeShortName(lang: Lang, mode: string): string {
  const key = `mode.short.${mode}`;
  const name = translate(lang, key);
  return name === key ? modeName(lang, mode) : name;
}

/**
 * 段位标签：数据里的 `传奇 I` / `大师 III` / `职业` → 当前语言。
 * 罗马数字后缀原样保留，只翻译段位名。
 */
const TIER_BASE: Record<string, string> = {
  青铜: 'tier.bronze',
  白銀: 'tier.silver',
  白银: 'tier.silver',
  黄金: 'tier.gold',
  黃金: 'tier.gold',
  钻石: 'tier.diamond',
  鑽石: 'tier.diamond',
  神话: 'tier.mythic',
  神話: 'tier.mythic',
  传奇: 'tier.legendary',
  傳奇: 'tier.legendary',
  大师: 'tier.masters',
  大師: 'tier.masters',
  职业: 'tier.pro',
  職業: 'tier.pro',
  bronze: 'tier.bronze',
  silver: 'tier.silver',
  gold: 'tier.gold',
  diamond: 'tier.diamond',
  mythic: 'tier.mythic',
  legendary: 'tier.legendary',
  master: 'tier.masters',
  masters: 'tier.masters',
  pro: 'tier.pro',
};

export function tierLabel(lang: Lang, raw: string): string {
  const matched = /^(.+?)\s*([IVX]+)?$/.exec(raw.trim());
  if (!matched) return raw;
  const base = matched[1] ?? '';
  const roman = matched[2];
  const key = TIER_BASE[base] ?? TIER_BASE[base.toLowerCase()];
  if (!key) return raw;
  const localized = translate(lang, key);
  return roman ? `${localized} ${roman}` : localized;
}

/** 英雄搜索词：英文原名 + 三种语言译名 + 拼音别名 */
export function brawlerSearchNames(englishName: string): string[] {
  const key = normalizeName(englishName);
  const row = BRAWLERS[key];
  const aliases = BRAWLER_ALIASES[key] ?? [];
  return row ? [row[0], row[1], row[2], ...aliases] : [englishName, ...aliases];
}

/** 地图搜索词：英文原名 + 简体 + 繁体 */
export function mapSearchNames(englishMapName: string): string[] {
  const row = MAPS[englishMapName];
  return row ? [englishMapName, row[0], row[1]] : [englishMapName];
}

/** 表里收录的英雄数（供测试断言覆盖率） */
export const BRAWLER_NAME_COUNT = Object.keys(BRAWLERS).length;
