// src/data/localization.ts
function normalizeName(raw) {
  return raw.toLowerCase().replace(/[^a-z0-9]/g, "");
}
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
  squeak: { cn: "\u65AF\u594E\u514B", aliases: ["sqk", "sikuike", "\u7C98\u6DB2"] },
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
  otis: { cn: "\u5965\u63D0\u65AF", aliases: ["ads", "aodisi", "\u6C34\u67AA"] },
  sam: { cn: "\u5C71\u59C6", aliases: ["sm", "samu", "\u62F3\u5957"] },
  gus: { cn: "\u683C\u65AF", aliases: ["gs", "gesi", "\u5E7D\u7075"] },
  buster: { cn: "\u5DF4\u65AF\u7279", aliases: ["bst", "basite", "\u76FE\u724C"] },
  chester: { cn: "\u5207\u65AF\u7279", aliases: ["qst", "qiesite", "\u968F\u673A"] },
  gray: { cn: "\u6208\u96F7", aliases: ["gl", "gelei", "\u4F20\u9001\u95E8"] },
  mandy: { cn: "\u66FC\u8FEA", aliases: ["md", "mandi", "\u72D9\u51FB"] },
  rt: { cn: "R-T", aliases: ["rt", "\u673A\u5668"] },
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
  juju: { cn: "\u6731\u6731", aliases: ["zz", "zhuzhu", "\u73A9\u5076"] },
  meeple: { cn: "\u8FF7\u5B9D", aliases: ["mp", "mipu", "\u68CB\u5B50"] },
  ollie: { cn: "\u5965\u5229", aliases: ["al", "aoli", "\u6ED1\u677F"] },
  lumi: { cn: "\u9732\u7C73", aliases: ["lm", "lumi", "\u5149"] },
  finx: { cn: "\u82AC\u514B\u65AF", aliases: ["fks", "fenkesi", "\u65F6\u95F4"] },
  jaeyong: { cn: "\u8F7D\u52C7", aliases: ["zy", "zaiyong", "\u8DC6\u62F3"] },
  kaze: { cn: "\u5C0F\u51E4", aliases: ["kz", "kaze", "\u98CE\u5203"] },
  alli: { cn: "\u9CC4\u68A8", aliases: ["al", "ali", "\u9CC4\u9C7C"] },
  trunk: { cn: "\u6869", aliases: ["tlk", "telanke", "\u80F6\u56CA"] },
  mina: { cn: "\u7C73\u5A1C", aliases: ["mn", "mina", "\u8776"] },
  ziggy: { cn: "\u5179\u5947", aliases: ["zg", "qige", "\u6D82\u9E26"] },
  pierce: { cn: "\u76AE\u5C14\u65AF", aliases: ["pes", "piersi", "\u6807\u67AA"] },
  gigi: { cn: "\u742A\u742A", aliases: ["jj", "jiji", "\u9752\u86D9"] },
  glowy: { cn: "\u683C\u9C81\u4F0A", aliases: ["glw", "geluowei", "\u8367\u5149"] },
  sirius: { cn: "\u897F\u91CC\u4E4C\u65AF", aliases: ["tlx", "tianlangxing", "\u661F"] },
  najia: { cn: "\u5A1C\u5409\u4E9A", aliases: ["nj", "najia", "\u86C7"] },
  damian: { cn: "\u8FBE\u7C73\u5B89", aliases: ["dma", "damian", "\u6076\u9B54"] },
  // 数据里是一个英雄 "STARR NOVA"（id 16000105），normalizeName 后为 starrnova
  starrnova: { cn: "\u65AF\u5854\u8BFA\u5A03", aliases: ["starr", "nova", "ste", "sitaer", "\u661F"] },
  bolt: { cn: "\u535A\u5C14\u7279", aliases: ["bet", "boerte", "\u7535"] },
  nori: { cn: "\u963F\u5BAA", aliases: ["nl", "nuoli", "\u6D77\u82D4"] },
  wendy: { cn: "\u6E29\u8482", aliases: ["wd", "wendi", "\u98CE"] },
  cosmo: { cn: "\u79D1\u65AF\u83AB", aliases: ["ksm", "kesimo", "\u5B87\u5B99"] },
  vince: { cn: "\u6587\u65AF", aliases: ["ws", "wensi", "\u6454\u89D2"] },
  // 2026-11 上线的新英雄。游戏内官方中文名为「雷电蛙」（「雷霆蛙」是非官方暂译）。
  // 官方英文名是复数 Thunderfrogs，单复数 key 都保留以防数据源写法不同。
  thunderfrog: { cn: "\u96F7\u7535\u86D9", aliases: ["tf", "thunder", "frog", "\u96F7\u7535"] },
  thunderfrogs: { cn: "\u96F7\u7535\u86D9", aliases: ["tf", "thunder", "frogs", "\u96F7\u7535"] }
};
function brawlerCN(englishName) {
  const loc = BRAWLER_LOCALE[normalizeName(englishName)];
  return loc ? loc.cn : englishName;
}

// src/data/brawlerProfile.ts
var CLASS_LABEL = {
  TANK: "\u5766\u514B",
  DAMAGE: "\u706B\u529B\u624B",
  MARKSMAN: "\u72D9\u51FB\u624B",
  ARTILLERY: "\u6295\u624B",
  ASSASSIN: "\u523A\u5BA2",
  CONTROL: "\u63A7\u573A",
  SUPPORT: "\u8F85\u52A9"
};
var CLASS_ORDER = [
  "TANK",
  "DAMAGE",
  "MARKSMAN",
  "ARTILLERY",
  "ASSASSIN",
  "CONTROL",
  "SUPPORT"
];

// src/data/metaIndex.ts
function getMatchupWR(idx, mode, selfId, oppId) {
  return idx.matchupTable.get(mode)?.get(selfId)?.get(oppId);
}
function getMapStat(idx, mapName, brawlerId) {
  return idx.mapStatTable.get(mapName)?.get(brawlerId);
}
function getClass(idx, brawlerId) {
  return idx.classByBrawlerId.get(brawlerId) ?? "DAMAGE";
}

// src/utils/draftEngine.ts
var NEUTRAL_STAT = {
  games: 0,
  wins: 0,
  win_rate: 0.5,
  smoothed_wr: 0.5,
  use_rate: 0,
  score: 50,
  pick_order: "MIDDLE"
};
function statFor(idx, mapName, id, name) {
  const found = getMapStat(idx, mapName, id);
  if (found) return { stat: found, hasData: true };
  return { stat: { id, name, ...NEUTRAL_STAT }, hasData: false };
}
var W_BAN_USE = 0.5;
var W_BAN_SCORE = 0.35;
var W_BAN_FIRST = 0.15;
var W_PICK_COUNTER = 0.4;
var W_PICK_WR = 0.25;
var W_PICK_SCORE = 0.25;
var W_PICK_COMP = 0.1;
var W_ENEMY_SCORE = 0.7;
var W_ENEMY_USE = 0.3;
var COUNTER_FULL_SCALE = 0.15;
var WR_MIN_SAMPLE = 15;
var WR_FULL_SAMPLE = 80;
var TAG_THRESHOLD = 0.04;
var PICK_SEQUENCE = ["ally", "enemy", "enemy", "ally", "ally", "enemy"];
var clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
var pct = (v) => `${Math.round(v * 100)}%`;
function totalPicked(state) {
  return state.ally.length + state.enemy.length;
}
function pickNumber(state) {
  return Math.min(6, totalPicked(state) + 1);
}
function currentPosition(state) {
  const n = pickNumber(state);
  if (n <= 2) return "FIRST";
  if (n >= 5) return "LAST";
  return "MIDDLE";
}
function sideOfPick(state, n) {
  const base = PICK_SEQUENCE[clamp(n, 1, 6) - 1] ?? "ally";
  if (state.firstPick === "ally") return base;
  return base === "ally" ? "enemy" : "ally";
}
function isTaken(state, id) {
  return state.bans.includes(id) || state.ally.includes(id) || state.enemy.includes(id);
}
function isPicked(state, id) {
  return state.ally.includes(id) || state.enemy.includes(id);
}
function opponentsFor(state, perspective) {
  return perspective === "ally" ? state.enemy : state.ally;
}
function maxUseRate(idx, mapName) {
  const statMap = idx.mapStatTable.get(mapName);
  if (!statMap) return 1;
  let max = 0;
  for (const s of statMap.values()) if (s.use_rate > max) max = s.use_rate;
  return max > 0 ? max : 1;
}
function banScoreOf(idx, mapName, stat) {
  const maxUse = maxUseRate(idx, mapName);
  const useNorm = stat.use_rate / maxUse * 100;
  const firstBonus = stat.pick_order === "FIRST" ? 100 : 0;
  return clamp(
    useNorm * W_BAN_USE + stat.score * W_BAN_SCORE + firstBonus * W_BAN_FIRST,
    0,
    100
  );
}
function banReasons(idx, mapName, stat, banScore) {
  const reasons = [];
  const maxUse = maxUseRate(idx, mapName);
  const useNorm = stat.use_rate / maxUse * 100;
  if (stat.score >= 92) reasons.push({ tone: "bad", text: `\u8BE5\u56FE\u5F3A\u5EA6\u699C\u9876\u7AEF\uFF08${stat.score.toFixed(0)} \u5206\uFF09` });
  else if (stat.score >= 75) reasons.push({ tone: "neutral", text: `\u5730\u56FE\u5F3A\u5EA6\u8F83\u9AD8\uFF08${stat.score.toFixed(0)} \u5206\uFF09` });
  if (useNorm >= 80) reasons.push({ tone: "bad", text: `\u51FA\u573A\u7387\u6781\u9AD8\uFF08\u8BE5\u56FE\u7B2C 1 \u6863\uFF09` });
  else if (useNorm >= 55) reasons.push({ tone: "neutral", text: `\u51FA\u573A\u7387\u504F\u9AD8\uFF08${useNorm.toFixed(0)} \u5206\u4F4D\uFF09` });
  if (stat.pick_order === "FIRST") {
    reasons.push({ tone: "bad", text: "\u9002\u5408\u5148\u624B\u62FF\uFF0C\u653E\u51FA\u6765\u5BB9\u6613\u88AB\u5BF9\u9762\u62A2\u8D70" });
  }
  if (stat.smoothed_wr >= 0.55) {
    reasons.push({ tone: "neutral", text: `\u5E73\u6ED1\u80DC\u7387 ${pct(stat.smoothed_wr)}\uFF0C\u6837\u672C ${stat.games} \u573A` });
  }
  if (banScore >= 80) reasons.push({ tone: "bad", text: "\u7EFC\u5408\u5A01\u80C1\u5EA6\u6781\u9AD8\uFF0C\u4F18\u5148 Ban" });
  return reasons;
}
function banRecommendations(idx, state, limit = 60) {
  const map = idx.mapByName.get(state.mapName);
  if (!map) return [];
  const result = [];
  const maxUse = maxUseRate(idx, state.mapName);
  for (const ref of idx.meta.brawlers) {
    if (isTaken(state, ref.id)) continue;
    const { stat, hasData } = statFor(idx, state.mapName, ref.id, ref.name);
    const banScore = banScoreOf(idx, state.mapName, stat);
    const reasons = banReasons(idx, state.mapName, stat, banScore);
    const useNorm = clamp(stat.use_rate / maxUse * 100, 0, 100);
    const firstBonus = stat.pick_order === "FIRST" ? 100 : 0;
    result.push({
      id: stat.id,
      name: stat.name,
      cn: brawlerCN(stat.name),
      score: banScore,
      banScore,
      baseWR: stat.smoothed_wr,
      useRate: stat.use_rate,
      pickOrder: stat.pick_order,
      cls: getClass(idx, stat.id),
      tags: [],
      counterDetails: [],
      phase: "ban",
      position: currentPosition(state),
      hasData,
      breakdown: {
        base: stat.score,
        baseWeight: W_BAN_SCORE,
        baseContribution: stat.score * W_BAN_SCORE,
        counter: useNorm,
        counterWeight: W_BAN_USE,
        counterContribution: useNorm * W_BAN_USE,
        comp: firstBonus,
        compWeight: W_BAN_FIRST,
        compContribution: firstBonus * W_BAN_FIRST,
        orderAdj: 0,
        total: banScore,
        reasons: hasData ? reasons : [{ tone: "neutral", text: "\u8BE5\u56FE\u6682\u65E0\u5BF9\u5C40\u6837\u672C\uFF0C\u5206\u6570\u6309\u4E2D\u6027 50 \u8BA1" }]
      }
    });
  }
  result.sort((a, b) => {
    if (a.hasData !== b.hasData) return a.hasData ? -1 : 1;
    return b.banScore - a.banScore;
  });
  return result.slice(0, limit);
}
function compProfileOf(idx, ids) {
  const p = {
    tanks: 0,
    damage: 0,
    melee: 0,
    assassins: 0,
    throwers: 0,
    controls: 0,
    supports: 0
  };
  for (const id of ids) {
    const cls = getClass(idx, id);
    if (cls === "TANK") p.tanks += 1;
    if (cls === "DAMAGE" || cls === "MARKSMAN") p.damage += 1;
    if (cls === "TANK" || cls === "ASSASSIN") p.melee += 1;
    if (cls === "ASSASSIN") p.assassins += 1;
    if (cls === "ARTILLERY") p.throwers += 1;
    if (cls === "CONTROL") p.controls += 1;
    if (cls === "SUPPORT") p.supports += 1;
  }
  return p;
}
function detectCompWarnings(idx, state) {
  const mine = compProfileOf(idx, state.ally);
  const theirs = compProfileOf(idx, state.enemy);
  const out = [];
  if (mine.damage >= 2 && mine.tanks === 0) {
    out.push({ key: "noFrontline", text: "\u7F3A\u5C11\u524D\u6392\u627F\u4F24", tone: "warn" });
  }
  if (mine.melee >= 2) {
    out.push({ key: "shortRange", text: "\u624B\u77ED\u6613\u88AB\u98CE\u7B5D", tone: "warn" });
  }
  if (theirs.throwers > 0 && mine.assassins === 0) {
    out.push({ key: "needAssassin", text: "\u5EFA\u8BAE\u8865\u523A\u5BA2\u5207\u540E\u6392", tone: "tip" });
  }
  if (state.ally.length >= 2 && mine.damage === 0 && mine.tanks >= 2) {
    out.push({ key: "noDamage", text: "\u7F3A\u4E4F\u8FDC\u7A0B\u8F93\u51FA", tone: "tip" });
  }
  return out;
}
function compScoreFor(idx, state, candId) {
  const mine = compProfileOf(idx, state.ally);
  const theirs = compProfileOf(idx, state.enemy);
  const cls = getClass(idx, candId);
  const reasons = [];
  let score = 50;
  const isTank = cls === "TANK";
  const isDamage = cls === "DAMAGE" || cls === "MARKSMAN";
  const isControl = cls === "CONTROL";
  const isAssassin = cls === "ASSASSIN";
  const isSupport = cls === "SUPPORT";
  if (mine.damage >= 2 && mine.tanks === 0 && isTank) {
    score += 30;
    reasons.push({ tone: "good", text: "\u8865\u524D\u6392\uFF1A\u6211\u65B9\u5DF2\u6709 2 \u540D\u8106\u76AE\u4E14\u65E0\u5766\u514B", delta: 30 });
  }
  if (mine.melee >= 2 && (isControl || isDamage)) {
    score += 22;
    reasons.push({ tone: "good", text: "\u8865\u5C04\u7A0B\uFF1A\u6211\u65B9\u8FD1\u6218\u8FC7\u591A\uFF0C\u9700\u8981\u8FDC\u7A0B\u538B\u5236", delta: 22 });
  }
  if (theirs.throwers > 0 && mine.assassins === 0 && isAssassin) {
    score += 25;
    reasons.push({ tone: "good", text: "\u9488\u5BF9\u6295\u63B7\uFF1A\u8865\u523A\u5BA2\u5207\u540E\u6392", delta: 25 });
  }
  const sameRoleCount = (isTank ? mine.tanks : 0) + (isDamage ? mine.damage : 0) + (isAssassin ? mine.assassins : 0) + (isControl ? mine.controls : 0) + (isSupport ? mine.supports : 0);
  if (state.ally.length >= 2 && sameRoleCount >= 3) {
    score -= 14;
    reasons.push({ tone: "bad", text: "\u5B9A\u4F4D\u8FC7\u4E8E\u91CD\u590D\uFF0C\u9635\u5BB9\u7ED3\u6784\u5931\u8861", delta: -14 });
  }
  if (state.ally.length >= 2 && mine.damage === 0 && isDamage) {
    score += 16;
    reasons.push({ tone: "good", text: "\u8865\u8F93\u51FA\uFF1A\u6211\u65B9\u8FD8\u6CA1\u6709\u8FDC\u7A0B\u8F93\u51FA\u4F4D", delta: 16 });
  }
  return { score: clamp(score, 0, 100), reasons };
}
function counterDetail(idx, mode, candId, opponentIds) {
  const details = [];
  let sum = 0;
  for (const oppId of opponentIds) {
    const wr = getMatchupWR(idx, mode, candId, oppId);
    const ref = idx.brawlerById.get(oppId);
    const name = ref ? ref.name : String(oppId);
    details.push({
      opponentId: oppId,
      opponentName: name,
      wr: wr ?? 0.5,
      hasSample: wr !== void 0
    });
    sum += wr ?? 0.5;
  }
  return { avg: opponentIds.length === 0 ? 0.5 : sum / opponentIds.length, details };
}
function buildCounterTags(details) {
  const scored = details.filter((d) => d.hasSample).map((d) => ({ ...d, dev: d.wr - 0.5 })).sort((a, b) => Math.abs(b.dev) - Math.abs(a.dev));
  const tags = [];
  for (const d of scored) {
    if (tags.length >= 2) break;
    if (d.dev >= TAG_THRESHOLD) {
      tags.push({ text: `\u514B\u5236 ${brawlerCN(d.opponentName)} ${pct(d.wr)}`, tone: "good" });
    } else if (d.dev <= -TAG_THRESHOLD) {
      tags.push({ text: `\u6015 ${brawlerCN(d.opponentName)} ${pct(d.wr)}`, tone: "bad" });
    }
  }
  return tags;
}
function orderAdjust(position, pickOrder) {
  const reasons = [];
  let adj = 0;
  if (position === "FIRST") {
    if (pickOrder === "FIRST") {
      adj += 7;
      reasons.push({ tone: "good", text: "\u5148\u624B\u4F4D\u62FF\u4E07\u91D1\u6CB9\uFF0C\u5BB9\u9519\u9AD8", delta: 7 });
    } else if (pickOrder === "LAST") {
      adj -= 5;
      reasons.push({ tone: "bad", text: "\u5148\u624B\u4F4D\u62FFC\u4F4D\u82F1\u96C4\uFF0C\u6613\u88AB\u9488\u5BF9", delta: -5 });
    }
  } else if (position === "LAST") {
    if (pickOrder === "LAST") {
      adj += 6;
      reasons.push({ tone: "good", text: "\u540E\u624BC\u4F4D\uFF0C\u6B63\u597D\u5403 LAST \u5C5E\u6027", delta: 6 });
    } else if (pickOrder === "FIRST") {
      adj -= 2;
      reasons.push({ tone: "neutral", text: "\u540E\u624B\u4F4D\u9009\u4E07\u91D1\u6CB9\uFF0CC\u4F4D\u4EF7\u503C\u88AB\u6D6A\u8D39", delta: -2 });
    }
  }
  return { adj, reasons };
}
function evaluatePick(idx, state, stat, position, perspective, hasData = true) {
  const oppIds = opponentsFor(state, perspective);
  const { avg, details } = counterDetail(idx, state.mode, stat.id, oppIds);
  const delta = avg - 0.5;
  const counterScore = clamp(50 + 50 * clamp(delta / COUNTER_FULL_SCALE, -1, 1), 0, 100);
  const confidence = stat.games < WR_MIN_SAMPLE ? 0 : Math.min(1, stat.games / WR_FULL_SAMPLE);
  const wrScore = clamp(50 + (stat.smoothed_wr - 0.5) * 500, 0, 100);
  const wrWeight = W_PICK_WR * confidence;
  const revealRatio = Math.min(1, oppIds.length / 3);
  const lastMultiplier = position === "LAST" ? 1.35 : 1;
  const counterWeight = W_PICK_COUNTER * revealRatio * lastMultiplier;
  const comp = compScoreFor(idx, state, stat.id);
  const order = orderAdjust(position, stat.pick_order);
  const totalWeight = W_PICK_SCORE + counterWeight + wrWeight + W_PICK_COMP;
  const weighted = (stat.score * W_PICK_SCORE + counterScore * counterWeight + wrScore * wrWeight + comp.score * W_PICK_COMP) / totalWeight;
  const total = clamp(weighted + order.adj, 0, 100);
  const reasons = hasData ? [{ tone: "neutral", text: `\u5730\u56FE\u5F3A\u5EA6 ${stat.score.toFixed(0)} \u5206\uFF08\u8BE5\u56FE\u5F52\u4E00\u5316\uFF09` }] : [{ tone: "neutral", text: "\u8BE5\u56FE\u6682\u65E0\u5BF9\u5C40\u6837\u672C\uFF0C\u5730\u56FE\u5F3A\u5EA6\u6309\u4E2D\u6027 50 \u8BA1" }];
  if (oppIds.length === 0) {
    reasons.push({ tone: "neutral", text: "\u654C\u65B9\u5C1A\u672A\u4EAE\u724C\uFF0C\u5BF9\u4F4D\u4FEE\u6B63\u6682\u4E0D\u751F\u6548" });
  } else {
    const tone = delta > 0.02 ? "good" : delta < -0.02 ? "bad" : "neutral";
    reasons.push({
      tone,
      text: `\u5BF9\u4F4D\u5747\u503C ${pct(avg)}\uFF08\u5BF9\u9635 ${oppIds.length} \u540D\u5DF2\u4EAE\u724C\u82F1\u96C4\uFF09`,
      delta: (counterScore - 50) * (counterWeight / totalWeight)
    });
  }
  if (!details.every((d) => d.hasSample) && oppIds.length > 0) {
    reasons.push({ tone: "neutral", text: "\u90E8\u5206\u5BF9\u4F4D\u65E0\u6837\u672C\uFF0C\u6309\u4E2D\u6027 50% \u8BA1\u5165" });
  }
  if (confidence === 0) {
    reasons.push({
      tone: "neutral",
      text: `\u672C\u56FE\u6837\u672C\u4EC5 ${stat.games} \u573A\uFF0C\u80DC\u7387\u4E0D\u53C2\u4E0E\u8BA1\u7B97`
    });
  } else if (confidence < 1) {
    reasons.push({
      tone: "neutral",
      text: `\u672C\u56FE\u6837\u672C ${stat.games} \u573A\u504F\u5C11\uFF0C\u80DC\u7387\u6309 ${Math.round(confidence * 100)}% \u6298\u7B97`
    });
  }
  reasons.push(...comp.reasons);
  reasons.push(...order.reasons);
  const tags = perspective === "ally" ? buildCounterTags(details) : enemyThreatTags(details);
  return {
    id: stat.id,
    name: stat.name,
    cn: brawlerCN(stat.name),
    score: total,
    baseWR: stat.smoothed_wr,
    useRate: stat.use_rate,
    pickOrder: stat.pick_order,
    cls: getClass(idx, stat.id),
    tags,
    counterDetails: details,
    phase: perspective === "ally" ? "pick" : "enemyPick",
    position,
    hasData,
    breakdown: {
      base: stat.score,
      baseWeight: W_PICK_SCORE,
      baseContribution: stat.score * W_PICK_SCORE / totalWeight,
      counter: counterScore,
      counterWeight,
      counterContribution: counterScore * counterWeight / totalWeight,
      wr: wrScore,
      wrWeight,
      wrContribution: wrScore * wrWeight / totalWeight,
      comp: comp.score,
      compWeight: W_PICK_COMP,
      compContribution: comp.score * W_PICK_COMP / totalWeight,
      orderAdj: order.adj,
      total,
      reasons
    }
  };
}
function enemyThreatTags(details) {
  const scored = details.filter((d) => d.hasSample).map((d) => ({ ...d, dev: d.wr - 0.5 })).sort((a, b) => Math.abs(b.dev) - Math.abs(a.dev));
  const tags = [];
  for (const d of scored) {
    if (tags.length >= 2) break;
    if (d.dev >= TAG_THRESHOLD) {
      tags.push({ text: `\u514B\u5236\u6211\u65B9 ${brawlerCN(d.opponentName)} ${pct(d.wr)}`, tone: "bad" });
    } else if (d.dev <= -TAG_THRESHOLD) {
      tags.push({ text: `\u6015\u6211\u65B9 ${brawlerCN(d.opponentName)} ${pct(d.wr)}`, tone: "good" });
    }
  }
  return tags;
}
function enemyPickScoreOf(idx, mapName, stat) {
  const maxUse = maxUseRate(idx, mapName);
  const useNorm = stat.use_rate / maxUse * 100;
  return clamp(stat.score * W_ENEMY_SCORE + useNorm * W_ENEMY_USE, 0, 100);
}
function pickRecommendations(idx, state, limit = 60) {
  const map = idx.mapByName.get(state.mapName);
  if (!map) return [];
  const perspective = state.active.kind === "enemy" ? "enemy" : "ally";
  const position = currentPosition(state);
  const out = [];
  for (const ref of idx.meta.brawlers) {
    if (isTaken(state, ref.id)) continue;
    const { stat, hasData } = statFor(idx, state.mapName, ref.id, ref.name);
    if (perspective === "enemy") {
      const oppIds = opponentsFor(state, "enemy");
      const { details } = counterDetail(idx, state.mode, stat.id, oppIds);
      const baseScore = enemyPickScoreOf(idx, state.mapName, stat);
      const useNorm = clamp(
        stat.use_rate / maxUseRate(idx, state.mapName) * 100,
        0,
        100
      );
      out.push({
        id: stat.id,
        name: stat.name,
        cn: brawlerCN(stat.name),
        score: baseScore,
        baseWR: stat.smoothed_wr,
        useRate: stat.use_rate,
        pickOrder: stat.pick_order,
        cls: getClass(idx, stat.id),
        tags: enemyThreatTags(details),
        counterDetails: details,
        phase: "enemyPick",
        position,
        hasData,
        breakdown: {
          base: stat.score,
          baseWeight: W_ENEMY_SCORE,
          baseContribution: stat.score * W_ENEMY_SCORE,
          // 敌方录入只用于快速定位，不套克制公式
          counter: useNorm,
          counterWeight: W_ENEMY_USE,
          counterContribution: useNorm * W_ENEMY_USE,
          comp: 50,
          compWeight: 0,
          compContribution: 0,
          orderAdj: 0,
          total: baseScore,
          reasons: [
            { tone: "neutral", text: "\u654C\u65B9\u5F55\u5165\u6A21\u5F0F\uFF1A\u6309\u5730\u56FE\u5F3A\u5EA6 + \u51FA\u573A\u7387\u6392\u5E8F\uFF0C\u4FBF\u4E8E\u5FEB\u901F\u70B9\u9009" }
          ]
        }
      });
      continue;
    }
    out.push(evaluatePick(idx, state, stat, position, "ally", hasData));
  }
  out.sort((a, b) => {
    if (a.hasData !== b.hasData) return a.hasData ? -1 : 1;
    return b.score - a.score;
  });
  return out.slice(0, limit);
}
function recommend(idx, state, limit = 60) {
  if (state.active.kind === "ban") return banRecommendations(idx, state, limit);
  return pickRecommendations(idx, state, limit);
}
function evaluateBrawler(idx, state, brawlerId) {
  const ref = idx.brawlerById.get(brawlerId);
  if (!ref) return null;
  const { stat, hasData } = statFor(idx, state.mapName, brawlerId, ref.name);
  const position = currentPosition(state);
  if (state.active.kind === "ban") {
    const banScore = banScoreOf(idx, state.mapName, stat);
    const maxUse = maxUseRate(idx, state.mapName);
    const useNorm = clamp(stat.use_rate / maxUse * 100, 0, 100);
    const firstBonus = stat.pick_order === "FIRST" ? 100 : 0;
    return {
      id: stat.id,
      name: stat.name,
      cn: brawlerCN(stat.name),
      score: banScore,
      baseWR: stat.smoothed_wr,
      useRate: stat.use_rate,
      pickOrder: stat.pick_order,
      cls: getClass(idx, stat.id),
      tags: [],
      counterDetails: [],
      phase: "ban",
      position,
      hasData,
      breakdown: {
        base: stat.score,
        baseWeight: W_BAN_SCORE,
        baseContribution: stat.score * W_BAN_SCORE,
        counter: useNorm,
        counterWeight: W_BAN_USE,
        counterContribution: useNorm * W_BAN_USE,
        comp: firstBonus,
        compWeight: W_BAN_FIRST,
        compContribution: firstBonus * W_BAN_FIRST,
        orderAdj: 0,
        total: banScore,
        reasons: banReasons(idx, state.mapName, stat, banScore)
      }
    };
  }
  const perspective = state.active.kind === "enemy" ? "enemy" : "ally";
  return evaluatePick(idx, state, stat, position, perspective, hasData);
}
function slotScore(idx, state, brawlerId, side) {
  const ref = idx.brawlerById.get(brawlerId);
  if (!ref) return null;
  const { stat, hasData } = statFor(idx, state.mapName, brawlerId, ref.name);
  const c = evaluatePick(idx, state, stat, currentPosition(state), side, hasData);
  return { score: c.score, hasData };
}
var BAN_SLOTS = 6;
var TEAM_SLOTS = 3;
function nextSlot(state) {
  const { bans, ally, enemy } = state;
  if (state.active.kind === "ban" && bans.length < BAN_SLOTS) {
    return { kind: "ban", index: bans.length };
  }
  const n = totalPicked(state) + 1;
  for (let i = n; i <= 6; i += 1) {
    const side = sideOfPick(state, i);
    const arr = side === "ally" ? ally : enemy;
    if (arr.length < TEAM_SLOTS) return { kind: side, index: arr.length };
  }
  if (ally.length < TEAM_SLOTS) return { kind: "ally", index: ally.length };
  if (enemy.length < TEAM_SLOTS) return { kind: "enemy", index: enemy.length };
  if (bans.length < BAN_SLOTS) return { kind: "ban", index: bans.length };
  return null;
}
function resolveTargetSlot(state) {
  const a = state.active;
  if (a.kind === "ban" && state.bans.length < BAN_SLOTS) return a;
  if (a.kind === "ally" && state.ally.length < TEAM_SLOTS) return a;
  if (a.kind === "enemy" && state.enemy.length < TEAM_SLOTS) return a;
  return nextSlot(state);
}
function applyPick(state, brawlerId) {
  const next = cloneState(state);
  if (isTaken(next, brawlerId)) return next;
  const target = resolveTargetSlot(next);
  if (!target) return next;
  if (target.kind === "ban") next.bans = [...next.bans, brawlerId];
  else if (target.kind === "ally") next.ally = [...next.ally, brawlerId];
  else next.enemy = [...next.enemy, brawlerId];
  const slot = nextSlot(next);
  next.active = slot ?? target;
  return next;
}
function clearSlot(state, slot) {
  const next = cloneState(state);
  if (slot.kind === "ban") next.bans = next.bans.filter((_, i) => i !== slot.index);
  else if (slot.kind === "ally") next.ally = next.ally.filter((_, i) => i !== slot.index);
  else next.enemy = next.enemy.filter((_, i) => i !== slot.index);
  next.active = slot;
  return next;
}
function cloneState(state) {
  return {
    ...state,
    ally: [...state.ally],
    enemy: [...state.enemy],
    bans: [...state.bans],
    active: { ...state.active }
  };
}
function createDraft(mapName, mode, firstPick) {
  return {
    mapName,
    mode,
    ally: [],
    enemy: [],
    bans: [],
    firstPick,
    active: { kind: "ban", index: 0 }
  };
}
var CLASS_SET = new Set(CLASS_ORDER);
var GENERAL_FILTERS = [
  { key: "all", label: "\u5168\u90E8" },
  { key: "first", label: "\u5148\u624B" },
  { key: "counter", label: "C\u4F4D" }
];
var CLASS_FILTERS = CLASS_ORDER.map((k) => ({
  key: k,
  label: CLASS_LABEL[k]
}));
var QUICK_FILTERS = [...GENERAL_FILTERS, ...CLASS_FILTERS];
function passesFilter(c, filter) {
  if (filter === "all") return true;
  if (filter === "first") return c.pickOrder === "FIRST";
  if (filter === "counter") return c.pickOrder === "LAST";
  if (CLASS_SET.has(filter)) return c.cls === filter;
  return true;
}
var sameName = (a, b) => normalizeName(a) === normalizeName(b);
export {
  BAN_SLOTS,
  CLASS_FILTERS,
  GENERAL_FILTERS,
  QUICK_FILTERS,
  TAG_THRESHOLD,
  TEAM_SLOTS,
  applyPick,
  banRecommendations,
  banScoreOf,
  buildCounterTags,
  clearSlot,
  cloneState,
  counterDetail,
  createDraft,
  currentPosition,
  detectCompWarnings,
  evaluateBrawler,
  evaluatePick,
  isPicked,
  isTaken,
  nextSlot,
  passesFilter,
  pickNumber,
  pickRecommendations,
  recommend,
  sameName,
  sideOfPick,
  slotScore,
  totalPicked
};
