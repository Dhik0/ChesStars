// src/data/localization.ts
function normalizeName(raw) {
  return raw.toLowerCase().replace(/[^a-z0-9]/g, "");
}

// src/data/brawlerProfile.ts
var BRAWLER_CLASS = {
  shelly: "DAMAGE",
  colt: "DAMAGE",
  bull: "TANK",
  brock: "MARKSMAN",
  rico: "DAMAGE",
  spike: "DAMAGE",
  barley: "ARTILLERY",
  jessie: "CONTROL",
  nita: "DAMAGE",
  dynamike: "ARTILLERY",
  elprimo: "TANK",
  mortis: "ASSASSIN",
  crow: "ASSASSIN",
  poco: "SUPPORT",
  bo: "CONTROL",
  piper: "MARKSMAN",
  pam: "SUPPORT",
  tara: "DAMAGE",
  darryl: "TANK",
  penny: "CONTROL",
  frank: "TANK",
  gene: "CONTROL",
  tick: "ARTILLERY",
  leon: "ASSASSIN",
  rosa: "TANK",
  carl: "DAMAGE",
  bibi: "TANK",
  "8bit": "DAMAGE",
  sandy: "CONTROL",
  bea: "MARKSMAN",
  emz: "CONTROL",
  mrp: "CONTROL",
  max: "SUPPORT",
  jacky: "TANK",
  gale: "CONTROL",
  nani: "MARKSMAN",
  sprout: "ARTILLERY",
  surge: "DAMAGE",
  colette: "DAMAGE",
  amber: "CONTROL",
  lou: "CONTROL",
  byron: "SUPPORT",
  edgar: "ASSASSIN",
  ruffs: "SUPPORT",
  stu: "ASSASSIN",
  belle: "MARKSMAN",
  squeak: "CONTROL",
  grom: "ARTILLERY",
  buzz: "ASSASSIN",
  griff: "CONTROL",
  ash: "TANK",
  meg: "TANK",
  lola: "DAMAGE",
  fang: "ASSASSIN",
  eve: "DAMAGE",
  janet: "MARKSMAN",
  bonnie: "MARKSMAN",
  otis: "CONTROL",
  sam: "ASSASSIN",
  gus: "SUPPORT",
  buster: "TANK",
  chester: "DAMAGE",
  gray: "SUPPORT",
  mandy: "MARKSMAN",
  rt: "DAMAGE",
  willow: "CONTROL",
  maisie: "MARKSMAN",
  hank: "TANK",
  cordelius: "ASSASSIN",
  doug: "SUPPORT",
  pearl: "DAMAGE",
  chuck: "CONTROL",
  charlie: "CONTROL",
  mico: "ASSASSIN",
  kit: "SUPPORT",
  larrylawrie: "ARTILLERY",
  melodie: "ASSASSIN",
  angelo: "MARKSMAN",
  draco: "TANK",
  lily: "ASSASSIN",
  berry: "SUPPORT",
  clancy: "DAMAGE",
  moe: "DAMAGE",
  kenji: "ASSASSIN",
  shade: "ASSASSIN",
  juju: "ARTILLERY",
  meeple: "CONTROL",
  ollie: "TANK",
  lumi: "DAMAGE",
  finx: "CONTROL",
  jaeyong: "SUPPORT",
  kaze: "ASSASSIN",
  alli: "ASSASSIN",
  trunk: "TANK",
  mina: "DAMAGE",
  ziggy: "CONTROL",
  pierce: "MARKSMAN",
  gigi: "ASSASSIN",
  glowy: "SUPPORT",
  sirius: "CONTROL",
  najia: "DAMAGE",
  damian: "TANK",
  starrnova: "ASSASSIN",
  bolt: "TANK",
  nori: "ASSASSIN",
  wendy: "SUPPORT",
  cosmo: "CONTROL",
  vince: "DAMAGE",
  thunderfrog: "ARTILLERY",
  thunderfrogs: "ARTILLERY"
};
function classOf(normalizedName) {
  return BRAWLER_CLASS[normalizedName] ?? "DAMAGE";
}

// src/data/metaIndex.ts
function buildIndex(meta) {
  const brawlerById = /* @__PURE__ */ new Map();
  const brawlerByName = /* @__PURE__ */ new Map();
  for (const b of meta.brawlers) {
    brawlerById.set(b.id, b);
    brawlerByName.set(normalizeName(b.name), b);
  }
  const classByBrawlerId = /* @__PURE__ */ new Map();
  for (const b of meta.brawlers) {
    classByBrawlerId.set(b.id, classOf(normalizeName(b.name)));
  }
  const mapByName = /* @__PURE__ */ new Map();
  const mapsByMode = /* @__PURE__ */ new Map();
  const mapStatTable = /* @__PURE__ */ new Map();
  for (const m of meta.maps) {
    mapByName.set(m.map_name, m);
    const arr = mapsByMode.get(m.mode) ?? [];
    arr.push(m);
    mapsByMode.set(m.mode, arr);
    const statMap = /* @__PURE__ */ new Map();
    for (const s of m.brawlers) statMap.set(s.id, s);
    mapStatTable.set(m.map_name, statMap);
  }
  const modeByName = /* @__PURE__ */ new Map();
  const matchupTable = /* @__PURE__ */ new Map();
  for (const mode of meta.modes) {
    modeByName.set(mode.mode, mode);
    const selfMap = /* @__PURE__ */ new Map();
    for (const b of mode.brawlers) {
      const oppMap = /* @__PURE__ */ new Map();
      for (const edge of b.matchups) oppMap.set(edge.opponent_id, edge.smoothed_wr);
      selfMap.set(b.id, oppMap);
    }
    matchupTable.set(mode.mode, selfMap);
  }
  return {
    meta,
    brawlerById,
    brawlerByName,
    classByBrawlerId,
    mapByName,
    mapsByMode,
    modeByName,
    matchupTable,
    mapStatTable
  };
}
function getMatchupWR(idx, mode, selfId, oppId) {
  return idx.matchupTable.get(mode)?.get(selfId)?.get(oppId);
}
function getMapStat(idx, mapName, brawlerId) {
  return idx.mapStatTable.get(mapName)?.get(brawlerId);
}
function getClass(idx, brawlerId) {
  return idx.classByBrawlerId.get(brawlerId) ?? "DAMAGE";
}
function mapsOfMode(idx, mode) {
  return idx.mapsByMode.get(mode) ?? [];
}
export {
  buildIndex,
  getClass,
  getMapStat,
  getMatchupWR,
  mapsOfMode
};
