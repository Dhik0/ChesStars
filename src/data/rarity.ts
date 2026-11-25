/**
 * 英雄稀有度映射（自动生成，勿手改）
 *
 * 由 `scripts/gen-rarity.mjs` 依据 `api.brawlapi.com/v1/brawlers` 的 `rarity`
 * 字段 + `public/data/brawl_meta.json` 的英雄全集生成。
 * 之所以单独放一份而不是塞进 brawl_meta.json：后者由 brawl-draft-core 重新生成，
 * 每次同步都会被覆盖。
 */

export type RarityKey =
  | 'common'
  | 'rare'
  | 'superRare'
  | 'epic'
  | 'mythic'
  | 'legendary'
  | 'ultraLegendary'
;

/** 分区展示顺序：从低到高 */
export const RARITY_ORDER: RarityKey[] = ['common', 'rare', 'superRare', 'epic', 'mythic', 'legendary', 'ultraLegendary'];

export interface RarityMeta {
  key: RarityKey;
  /** 官方主题色（区块标题 / 描边用）；稀有度名称见 i18n 词库 rarity.section.* */
  color: string;
}

export const RARITY_META: Record<RarityKey, RarityMeta> = {
  common: { key: 'common', color: '#68FD58' },
  rare: { key: 'rare', color: '#68FD58' },
  superRare: { key: 'superRare', color: '#5AB3FF' },
  epic: { key: 'epic', color: '#D850FF' },
  mythic: { key: 'mythic', color: '#FE5E72' },
  legendary: { key: 'legendary', color: '#FFF11E' },
  ultraLegendary: { key: 'ultraLegendary', color: '#2DD4BF' },
};

export const RARITY_BY_ID: Record<number, RarityKey> = {
  // 初始
  16000000: 'common', // SHELLY
  // 稀有
  16000001: 'rare', // COLT
  16000002: 'rare', // BULL
  16000003: 'rare', // BROCK
  16000006: 'rare', // BARLEY
  16000008: 'rare', // NITA
  16000010: 'rare', // EL PRIMO
  16000013: 'rare', // POCO
  16000024: 'rare', // ROSA
  // 超稀有
  16000004: 'superRare', // RICO
  16000007: 'superRare', // JESSIE
  16000009: 'superRare', // DYNAMIKE
  16000018: 'superRare', // DARRYL
  16000019: 'superRare', // PENNY
  16000022: 'superRare', // TICK
  16000025: 'superRare', // CARL
  16000027: 'superRare', // 8-BIT
  16000034: 'superRare', // JACKY
  16000061: 'superRare', // GUS
  // 史诗
  16000014: 'epic', // BO
  16000015: 'epic', // PIPER
  16000016: 'epic', // PAM
  16000020: 'epic', // FRANK
  16000026: 'epic', // BIBI
  16000029: 'epic', // BEA
  16000030: 'epic', // EMZ
  16000035: 'epic', // GALE
  16000036: 'epic', // NANI
  16000039: 'epic', // COLETTE
  16000043: 'epic', // EDGAR
  16000045: 'epic', // STU
  16000046: 'epic', // BELLE
  16000048: 'epic', // GROM
  16000050: 'epic', // GRIFF
  16000051: 'epic', // ASH
  16000053: 'epic', // LOLA
  16000058: 'epic', // BONNIE
  16000060: 'epic', // SAM
  16000065: 'epic', // MANDY
  16000068: 'epic', // MAISIE
  16000069: 'epic', // HANK
  16000072: 'epic', // PEARL
  16000077: 'epic', // LARRY & LAWRIE
  16000079: 'epic', // ANGELO
  16000082: 'epic', // BERRY
  16000086: 'epic', // SHADE
  16000089: 'epic', // MEEPLE
  16000096: 'epic', // TRUNK
  16000106: 'epic', // BOLT
  // 神话
  16000011: 'mythic', // MORTIS
  16000017: 'mythic', // TARA
  16000021: 'mythic', // GENE
  16000031: 'mythic', // MR. P
  16000032: 'mythic', // MAX
  16000037: 'mythic', // SPROUT
  16000041: 'mythic', // LOU
  16000042: 'mythic', // BYRON
  16000044: 'mythic', // RUFFS
  16000047: 'mythic', // SQUEAK
  16000049: 'mythic', // BUZZ
  16000054: 'mythic', // FANG
  16000056: 'mythic', // EVE
  16000057: 'mythic', // JANET
  16000059: 'mythic', // OTIS
  16000062: 'mythic', // BUSTER
  16000064: 'mythic', // GRAY
  16000066: 'mythic', // R-T
  16000067: 'mythic', // WILLOW
  16000071: 'mythic', // DOUG
  16000073: 'mythic', // CHUCK
  16000074: 'mythic', // CHARLIE
  16000075: 'mythic', // MICO
  16000078: 'mythic', // MELODIE
  16000081: 'mythic', // LILY
  16000083: 'mythic', // CLANCY
  16000084: 'mythic', // MOE
  16000087: 'mythic', // JUJU
  16000090: 'mythic', // OLLIE
  16000091: 'mythic', // LUMI
  16000092: 'mythic', // FINX
  16000093: 'mythic', // JAE-YONG
  16000095: 'mythic', // ALLI
  16000097: 'mythic', // MINA
  16000098: 'mythic', // ZIGGY
  16000100: 'mythic', // GIGI
  16000101: 'mythic', // GLOWY
  16000103: 'mythic', // NAJIA
  16000104: 'mythic', // DAMIAN
  16000105: 'mythic', // STARR NOVA
  16000108: 'mythic', // WENDY
  16000109: 'mythic', // COSMO
  16000110: 'mythic', // VINCE
  // 传奇
  16000005: 'legendary', // SPIKE
  16000012: 'legendary', // CROW
  16000023: 'legendary', // LEON
  16000028: 'legendary', // SANDY
  16000038: 'legendary', // SURGE
  16000040: 'legendary', // AMBER
  16000052: 'legendary', // MEG
  16000063: 'legendary', // CHESTER
  16000070: 'legendary', // CORDELIUS
  16000076: 'legendary', // KIT
  16000080: 'legendary', // DRACO
  16000085: 'legendary', // KENJI
  16000099: 'legendary', // PIERCE
  16000107: 'legendary', // NORI
  // 超传奇
  16000094: 'ultraLegendary', // KAZE
  16000102: 'ultraLegendary', // SIRIUS
};

/** 取英雄稀有度；表里没有的一律按「神话」兜底（不会发生，测试会卡住） */
export function rarityOf(id: number): RarityKey {
  return RARITY_BY_ID[id] ?? 'mythic';
}

/** 稀有度表覆盖的 id 数量（供测试断言） */
export const RARITY_COUNT = Object.keys(RARITY_BY_ID).length;
