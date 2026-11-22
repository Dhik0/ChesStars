// src/utils/asset.ts
function assetUrl(path) {
  const base = import.meta.env?.BASE_URL ?? "./";
  const prefix = base.endsWith("/") ? base : `${base}/`;
  return `${prefix}${path.replace(/^\/+/, "")}`;
}

// src/data/localization.ts
function normalizeName(raw) {
  return raw.toLowerCase().replace(/[^a-z0-9]/g, "");
}
var MODE_LOCALE = {
  bounty: { cn: "\u8D4F\u91D1\u730E\u4EBA", short: "\u8D4F\u91D1", color: "#F59E0B" },
  brawlBall: { cn: "\u4E71\u6597\u8DB3\u7403", short: "\u8DB3\u7403", color: "#22C55E" },
  knockout: { cn: "\u6DD8\u6C70\u8D5B", short: "\u6DD8\u6C70", color: "#A855F7" },
  hotZone: { cn: "\u70ED\u533A\u4E89\u593A", short: "\u70ED\u533A", color: "#EF4444" },
  gemGrab: { cn: "\u5B9D\u77F3\u4E89\u9738", short: "\u5B9D\u77F3", color: "#8B5CF6" },
  heist: { cn: "\u91D1\u5E93\u653B\u9632", short: "\u91D1\u5E93", color: "#06B6D4" }
};
var MODE_ORDER = [
  "bounty",
  "brawlBall",
  "knockout",
  "hotZone",
  "gemGrab",
  "heist"
];
var MAP_CN = {
  "Shooting Star": "\u795E\u79D8\u6D41\u661F",
  "Dry Season": "\u9177\u70ED\u5730\u5E26",
  Hideout: "\u8349\u4E1B\u8FF7\u8E2A",
  "Layer Cake": "\u5939\u5FC3\u86CB\u7CD5",
  "Center Stage": "\u4E2D\u5FC3\u821E\u53F0",
  "Triple Dribble": "\u4E09\u91CD\u5A01\u80C1",
  "Pinball Dreams": "\u68A6\u5E7B\u5F39\u73E0",
  "Sneaky Fields": "\u7EFF\u8335\u7403\u573A",
  "Bridge Too Far": "\u9065\u8FDC\u7684\u6865",
  "Hot Potato": "\u70EB\u624B\u5C71\u828B",
  "Kaboom Canyon": "\u8F70\u9686\u5CE1\u8C37",
  "Safe Zone": "\u5B89\u5168\u533A\u57DF",
  "Belle's Rock": "\u6447\u6EDA\u8D1D\u5C14",
  "New Horizons": "\u65B0\u5730\u5E73\u7EBF",
  "Flaring Phoenix": "\u70C8\u7130\u51E4\u51F0",
  "Out in the Open": "\u5F00\u9614\u8352\u91CE",
  Undermine: "\u5341\u9762\u57CB\u4F0F",
  "Gem Fort": "\u5B9D\u77F3\u8981\u585E",
  "Hard Rock Mine": "\u786C\u77F3\u77FF\u4E95",
  "Double Swoosh": "\u55D6\u55D6\u4F5C\u54CD",
  "Dueling Beetles": "\u7532\u866B\u51B3\u6597",
  "Open Business": "\u5F00\u95E8\u8425\u4E1A",
  "Parallel Plays": "\u5E73\u884C\u6E38\u620F",
  "Ring of Fire": "\u707C\u70ED\u706B\u5708",
  // 2026-11 新增淘汰赛地图
  "Goldarm Gulch": "\u91D1\u81C2\u5CE1\u8C37",
  "Flowing Springs": "\u6D93\u6D93\u6EAA\u6D41"
};
var BRAWLER_LOCALE = {
  shelly: { cn: "\u96EA\u8389", aliases: ["xl", "xueli", "\u9730\u5F39"] },
  colt: { cn: "\u67EF\u5C14\u7279", aliases: ["ket", "ke", "keerte"] },
  bull: { cn: "\u516C\u725B", aliases: ["gn", "gongniu", "\u725B"] },
  brock: { cn: "\u5E03\u6D1B\u514B", aliases: ["blk", "buluoke", "\u706B\u7BAD"] },
  rico: { cn: "\u745E\u79D1", aliases: ["rk", "ruike", "\u5F39\u7403"] },
  spike: { cn: "\u65AF\u6D3E\u514B", aliases: ["spk", "sipaike", "\u4ED9\u4EBA\u638C"] },
  barley: { cn: "\u5DF4\u5229", aliases: ["bl", "bali", "\u9152\u4FDD"] },
  jessie: { cn: "\u6770\u897F", aliases: ["jx", "jiexi", "\u70AE\u53F0"] },
  nita: { cn: "\u59AE\u5854", aliases: ["nt", "nita", "\u718A"] },
  dynamike: { cn: "\u7206\u7834\u9EA6\u514B", aliases: ["bpmk", "maike", "\u9EA6\u514B", "\u70B8\u5F39"] },
  elprimo: { cn: "\u666E\u91CC\u83AB", aliases: ["plm", "pulimo", "\u62F3\u738B"] },
  mortis: { cn: "\u83AB\u63D0\u65AF", aliases: ["mts", "motisi", "\u94F2\u5B50"] },
  crow: { cn: "\u9ED1\u9E26", aliases: ["wy", "wuya"] },
  poco: { cn: "\u6CE2\u53EF", aliases: ["bk", "boke", "\u5409\u4ED6"] },
  bo: { cn: "\u963F\u535A", aliases: ["bo", "\u8001\u9E70", "\u9E70"] },
  piper: { cn: "\u4F69\u4F69", aliases: ["pp", "peipei", "\u72D9\u51FB"] },
  pam: { cn: "\u5E15\u59C6", aliases: ["pm", "pamu", "\u5976\u5988"] },
  tara: { cn: "\u5854\u62C9", aliases: ["tl", "tala", "\u62C9\u4EBA"] },
  darryl: { cn: "\u8FBE\u91CC\u5C14", aliases: ["dle", "dalier", "\u6876\u5B50"] },
  penny: { cn: "\u6F58\u59AE", aliases: ["pn", "panni", "\u70AE"] },
  frank: { cn: "\u5F17\u5170\u514B", aliases: ["flk", "fulanke", "\u9524"] },
  gene: { cn: "\u5409\u6069", aliases: ["je", "jien", "\u62C9\u624B"] },
  tick: { cn: "\u8FEA\u514B", aliases: ["tk", "tike", "\u5730\u96F7"] },
  leon: { cn: "\u91CC\u6602", aliases: ["la", "liang", "\u9690\u8EAB"] },
  rosa: { cn: "\u7F57\u838E", aliases: ["ls", "luosha", "\u8349\u76FE"] },
  carl: { cn: "\u5361\u5C14", aliases: ["ke", "kaer", "\u77FF\u8F66"] },
  bibi: { cn: "\u6BD4\u6BD4", aliases: ["bb", "bibi", "\u68D2\u7403"] },
  "8bit": { cn: "8\u6BD4\u7279", aliases: ["8bt", "8bite", "8\u4F4D"] },
  sandy: { cn: "\u6C99\u8FEA", aliases: ["sd", "sangdi", "\u7761\u795E"] },
  bea: { cn: "\u8D1D\u4E9A", aliases: ["bi", "bea", "\u871C\u8702"] },
  emz: { cn: "\u827E\u9B45", aliases: ["amz", "aimuzi", "\u53D1\u80F6"] },
  mrp: { cn: "P\u5148\u751F", aliases: ["pxs", "p\u5148\u751F", "\u4F01\u9E45"] },
  max: { cn: "\u9EA6\u514B\u65AF", aliases: ["mks", "maikesi", "\u52A0\u901F"] },
  jacky: { cn: "\u96C5\u742A", aliases: ["jq", "jieji", "\u9707\u52A8"] },
  gale: { cn: "\u683C\u5C14", aliases: ["ge", "gaier", "\u98CE"] },
  nani: { cn: "\u7EB3\u5C3C", aliases: ["nn", "nani", "\u56DE\u65CB"] },
  sprout: { cn: "\u82BD\u82BD", aliases: ["yy", "yaya", "\u6811\u5899"] },
  surge: { cn: "\u745F\u5947", aliases: ["sq", "seqi", "\u5347\u7EA7"] },
  colette: { cn: "\u79D1\u83B1\u7279", aliases: ["klt", "kelaite", "\u767E\u5206\u6BD4"] },
  amber: { cn: "\u7425\u73C0", aliases: ["ap", "anpo", "\u706B"] },
  lou: { cn: "\u5C0F\u7F57", aliases: ["lu", "\u51B0"] },
  byron: { cn: "\u62DC\u4F26", aliases: ["bl", "bailun", "\u6BD2"] },
  edgar: { cn: "\u57C3\u5FB7\u52A0", aliases: ["adj", "aidejia", "\u56F4\u5DFE"] },
  ruffs: { cn: "\u62C9\u592B", aliases: ["lfs", "lafusi", "\u4E0A\u6821"] },
  stu: { cn: "\u65AF\u56FE", aliases: ["st", "situ", "\u6CB9\u95E8"] },
  belle: { cn: "\u8D1D\u5C14", aliases: ["be", "beier", "\u7535\u67AA"] },
  squeak: { cn: "\u53F2\u9B41\u514B", aliases: ["sqk", "sikuike", "\u7C98\u6DB2"] },
  grom: { cn: "\u683C\u7F57\u59C6", aliases: ["glm", "geluomu", "\u6295\u5F39"] },
  buzz: { cn: "\u5DF4\u5179", aliases: ["bs", "basi", "\u6551\u751F\u5708"] },
  griff: { cn: "\u683C\u91CC\u592B", aliases: ["glf", "gelifu", "\u786C\u5E01"] },
  ash: { cn: "\u963F\u62FE", aliases: ["as", "ashi", "\u72C2\u66B4"] },
  meg: { cn: "\u6885\u683C", aliases: ["mg", "meige", "\u673A\u7532"] },
  lola: { cn: "\u841D\u62C9", aliases: ["ll", "luola", "\u5206\u8EAB"] },
  fang: { cn: "\u963F\u65B9", aliases: ["fang", "\u8E22"] },
  eve: { cn: "\u4F0A\u8299", aliases: ["yf", "yifu", "\u5375"] },
  janet: { cn: "\u73CD\u59AE\u7279", aliases: ["znt", "zhennite", "\u98DE\u884C"] },
  bonnie: { cn: "\u90A6\u59AE", aliases: ["bn", "bangni", "\u70AE\u5F39"] },
  otis: { cn: "\u5965\u8482\u65AF", aliases: ["ads", "aodisi", "\u6C34\u67AA"] },
  sam: { cn: "\u5C71\u59C6", aliases: ["sm", "samu", "\u62F3\u5957"] },
  gus: { cn: "\u683C\u65AF", aliases: ["gs", "gesi", "\u5E7D\u7075"] },
  buster: { cn: "\u5DF4\u65AF\u7279", aliases: ["bst", "basite", "\u76FE\u724C"] },
  chester: { cn: "\u5207\u65AF\u7279", aliases: ["qst", "qiesite", "\u968F\u673A"] },
  gray: { cn: "\u6208\u96F7", aliases: ["gl", "gelei", "\u4F20\u9001\u95E8"] },
  mandy: { cn: "\u66FC\u8FEA", aliases: ["md", "mandi", "\u72D9\u51FB"] },
  rt: { cn: "RT", aliases: ["rt", "\u673A\u5668"] },
  willow: { cn: "\u8587\u6D1B", aliases: ["wl", "weiluo", "\u9644\u8EAB"] },
  maisie: { cn: "\u6885\u831C", aliases: ["mq", "meiqian", "\u5730\u9707"] },
  hank: { cn: "\u6C49\u514B", aliases: ["hk", "hanke", "\u6CE1\u6CE1"] },
  cordelius: { cn: "\u79D1\u8FEA\u7409\u65AF", aliases: ["kdls", "kediliusi", "\u6697\u5F71"] },
  doug: { cn: "\u9053\u683C", aliases: ["dg", "daoge", "\u70ED\u72D7"] },
  pearl: { cn: "\u73C0\u5C14", aliases: ["pe", "poer", "\u70E4\u7BB1"] },
  chuck: { cn: "\u67E5\u514B", aliases: ["ck", "chake", "\u706B\u8F66"] },
  charlie: { cn: "\u67E5\u7406", aliases: ["cl", "chali", "\u86DB\u7F51"] },
  mico: { cn: "\u7C73\u79D1", aliases: ["mk", "mike", "\u7334\u5B50"] },
  kit: { cn: "\u51EF\u7279", aliases: ["jt", "jite", "\u732B"] },
  larrylawrie: { cn: "\u62C9\u91CC\u548C\u52B3\u91CC", aliases: ["llhl", "larry", "lawrie", "laurie", "\u53CC\u4EBA"] },
  melodie: { cn: "\u9EA6\u4E50\u8FEA", aliases: ["mld", "meiluodi", "\u97F3\u7B26"] },
  angelo: { cn: "\u5B89\u5409\u6D1B", aliases: ["ajl", "anjiluo", "\u6BD2\u7BAD"] },
  draco: { cn: "\u5FB7\u62C9\u79D1", aliases: ["dlk", "delake", "\u9F99"] },
  lily: { cn: "\u8389\u8389", aliases: ["ll", "lili", "\u6697\u754C"] },
  berry: { cn: "\u62DC\u745E", aliases: ["br", "beirui", "\u51B0\u6DC7\u6DCB"] },
  clancy: { cn: "\u514B\u5170\u897F", aliases: ["klx", "kelanxi", "\u5361\u724C"] },
  moe: { cn: "\u94BB\u5730\u963F\u840C", aliases: ["mo", "\u8001\u9F20"] },
  kenji: { cn: "\u5065\u6B21", aliases: ["je", "jianer", "\u5200"] },
  shade: { cn: "\u8C22\u5FB7", aliases: ["xd", "xiede", "\u9634\u5F71"] },
  juju: { cn: "\u73E0\u73E0", aliases: ["zz", "zhuzhu", "\u73A9\u5076"] },
  meeple: { cn: "\u8C1C\u5B9D", aliases: ["mp", "mipu", "\u68CB\u5B50"] },
  ollie: { cn: "\u5965\u5229", aliases: ["al", "aoli", "\u6ED1\u677F"] },
  lumi: { cn: "\u9732\u7C73", aliases: ["lm", "lumi", "\u5149"] },
  finx: { cn: "\u82AC\u514B\u65AF", aliases: ["fks", "fenkesi", "\u65F6\u95F4"] },
  jaeyong: { cn: "\u8F7D\u52C7", aliases: ["zy", "zaiyong", "\u97E9\u56FD\u5165"] },
  kaze: { cn: "\u98CE\u59EC", aliases: ["kz", "kaze", "\u5C0F\u51E4"] },
  alli: { cn: "\u9CC4\u68A8", aliases: ["al", "ali", "\u9CC4\u9C7C"] },
  trunk: { cn: "\u6869", aliases: ["tlk", "telanke", "\u6EDA\u6728"] },
  mina: { cn: "\u7C73\u5A1C", aliases: ["mn", "mina", "\u8776"] },
  ziggy: { cn: "\u5179\u5947", aliases: ["zg", "qige", "\u6D82\u9E26"] },
  pierce: { cn: "\u76AE\u5C14\u65AF", aliases: ["pes", "piersi", "\u6807\u67AA"] },
  gigi: { cn: "\u742A\u742A", aliases: ["jj", "jiji", "\u9752\u86D9"] },
  glowy: { cn: "\u683C\u9C81\u4F0A", aliases: ["glw", "geluowei", "\u8367\u5149"] },
  sirius: { cn: "\u897F\u91CC\u4E4C\u65AF", aliases: ["tlx", "tianlangxing", "\u661F"] },
  najia: { cn: "\u5A1C\u5409\u4E9A", aliases: ["nj", "najia", "\u86C7"] },
  damian: { cn: "\u8FBE\u7C73\u5B89", aliases: ["dma", "damian", "\u6076\u9B54"] },
  starrnova: { cn: "\u65AF\u5854\u8BFA\u5A03", aliases: ["starr", "nova", "ste", "sitaer", "\u661F"] },
  bolt: { cn: "\u535A\u5C14\u7279", aliases: ["bet", "boerte", "\u7535"] },
  nori: { cn: "\u963F\u5BAA", aliases: ["nl", "nuoli", "\u6D77\u82D4"] },
  wendy: { cn: "\u6E29\u8482", aliases: ["wd", "wendi", "\u98CE"] },
  cosmo: { cn: "\u79D1\u65AF\u83AB", aliases: ["ksm", "kesimo"] },
  vince: { cn: "\u6587\u65AF", aliases: ["ws", "wensi", "\u866B"] },
  thunderfrogs: { cn: "\u96F7\u7535\u86D9", aliases: ["tf", "thunder", "frogs", "\u9752\u86D9"] }
};
var ROLE_NAME_ALIAS = {
  larrylaurie: "larrylawrie"
};
function brawlerCN(englishName) {
  const loc = BRAWLER_LOCALE[normalizeName(englishName)];
  return loc ? loc.cn : englishName;
}
function mapCN(mapName) {
  return MAP_CN[mapName] ?? mapName;
}
function modeCN(mode) {
  return MODE_LOCALE[mode]?.cn ?? mode;
}
function modeShort(mode) {
  return MODE_LOCALE[mode]?.short ?? mode;
}
function modeColor(mode) {
  return MODE_LOCALE[mode]?.color ?? "#64748B";
}
function avatarUrl(id) {
  return assetUrl(`brawlers/${id}.png`);
}
function avatarCdnUrl(id) {
  return `https://cdn.brawlify.com/brawlers/borderless/${id}.png`;
}
function modeIconUrl(mode) {
  return assetUrl(`modes/${mode}.png`);
}
function fallbackColor(id) {
  const palette = [
    "#3B82F6",
    "#EF4444",
    "#22C55E",
    "#F59E0B",
    "#A855F7",
    "#06B6D4",
    "#EC4899",
    "#84CC16",
    "#F97316",
    "#8B5CF6",
    "#14B8A6",
    "#EAB308"
  ];
  return palette[Math.abs(id) % palette.length];
}
function avatarInitial(englishName) {
  const cn = brawlerCN(englishName);
  if (/[\u4e00-\u9fa5]/.test(cn)) return cn.slice(0, 1);
  return englishName.replace(/[^A-Za-z0-9]/g, "").slice(0, 1).toUpperCase() || "?";
}
function matchScore(query, englishName, cnName, aliases) {
  const q = query.trim().toLowerCase();
  if (!q) return 1;
  const en = englishName.toLowerCase();
  const qn = normalizeName(q);
  const aliasLower = aliases.map((a) => a.toLowerCase());
  if (cnName === q || en === q) return 1;
  if (cnName.startsWith(q)) return 2;
  if (qn) {
    const enn = normalizeName(englishName);
    if (enn === qn) return 1;
    if (enn.startsWith(qn)) return 2;
    if (aliasLower.some((a) => normalizeName(a) === qn)) return 3;
    if (aliasLower.some((a) => normalizeName(a).startsWith(qn))) return 4;
    if (enn.includes(qn)) return 5;
  }
  if (aliasLower.some((a) => a === q)) return 3;
  if (aliasLower.some((a) => a.startsWith(q))) return 4;
  if (en.includes(q)) return 5;
  if (cnName.includes(q)) return 5;
  if (aliasLower.some((a) => a.includes(q))) return 6;
  return 0;
}
export {
  BRAWLER_LOCALE,
  MAP_CN,
  MODE_LOCALE,
  MODE_ORDER,
  ROLE_NAME_ALIAS,
  avatarCdnUrl,
  avatarInitial,
  avatarUrl,
  brawlerCN,
  fallbackColor,
  mapCN,
  matchScore,
  modeCN,
  modeColor,
  modeIconUrl,
  modeShort,
  normalizeName
};
