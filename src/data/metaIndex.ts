import type {
  BrawlMeta,
  BrawlerRef,
  MapBrawlerStat,
  MapEntry,
  MatchupEdge,
  ModeEntry,
  ModeKey,
} from '../types/meta';
import { normalizeName } from './localization';
import { classOf, type BrawlerClass } from './brawlerProfile';

/**
 * 运行时索引：把 Schema v3 的嵌套结构（matchups 嵌在 maps[]/modes[] 的 brawlers[] 内）
 * 展平成 O(1) 查询，供算分引擎高频调用。
 *
 * 两级对位表：
 *   - mapMatchupTable：该图专属的对位残差（首选，v3 才有）
 *   - matchupTable：整个模式的对位残差（该图样本不足时兜底）
 *
 * 注意：这里只维护「职业」（一级，单选）。
 * brawl_meta.json 里的 roles 表混装了能力项（如 WALLBREAK），不参与业务逻辑。
 */
export interface MetaIndex {
  meta: BrawlMeta;
  brawlerById: Map<number, BrawlerRef>;
  brawlerByName: Map<string, BrawlerRef>;
  /** 英雄 -> 职业 */
  classByBrawlerId: Map<number, BrawlerClass>;
  mapByName: Map<string, MapEntry>;
  mapsByMode: Map<string, MapEntry[]>;
  modeByName: Map<string, ModeEntry>;
  /** mapName -> selfId -> oppId -> 对位边 */
  mapMatchupTable: Map<string, Map<number, Map<number, MatchupEdge>>>;
  /** mode -> selfId -> oppId -> 对位边 */
  matchupTable: Map<string, Map<number, Map<number, MatchupEdge>>>;
  /** mapName -> brawlerId -> 地图统计 */
  mapStatTable: Map<string, Map<number, MapBrawlerStat>>;
}

/** 把一组对位边折叠成 selfId -> oppId 的二级 Map */
function indexMatchups(
  brawlers: { id: number; matchups: MatchupEdge[] }[],
): Map<number, Map<number, MatchupEdge>> {
  const selfMap = new Map<number, Map<number, MatchupEdge>>();
  for (const b of brawlers) {
    const oppMap = new Map<number, MatchupEdge>();
    for (const edge of b.matchups) oppMap.set(edge.opponent, edge);
    selfMap.set(b.id, oppMap);
  }
  return selfMap;
}

export function buildIndex(meta: BrawlMeta): MetaIndex {
  const brawlerById = new Map<number, BrawlerRef>();
  const brawlerByName = new Map<string, BrawlerRef>();
  for (const b of meta.brawlers) {
    brawlerById.set(b.id, b);
    brawlerByName.set(normalizeName(b.name), b);
  }

  // 职业（来自 brawlerProfile.ts，官方分类）
  const classByBrawlerId = new Map<number, BrawlerClass>();
  for (const b of meta.brawlers) {
    classByBrawlerId.set(b.id, classOf(normalizeName(b.name)));
  }

  const mapByName = new Map<string, MapEntry>();
  const mapsByMode = new Map<string, MapEntry[]>();
  const mapStatTable = new Map<string, Map<number, MapBrawlerStat>>();
  const mapMatchupTable = new Map<string, Map<number, Map<number, MatchupEdge>>>();
  for (const m of meta.maps) {
    mapByName.set(m.map_name, m);
    const arr = mapsByMode.get(m.mode) ?? [];
    arr.push(m);
    mapsByMode.set(m.mode, arr);
    const statMap = new Map<number, MapBrawlerStat>();
    for (const s of m.brawlers) statMap.set(s.id, s);
    mapStatTable.set(m.map_name, statMap);
    mapMatchupTable.set(m.map_name, indexMatchups(m.brawlers));
  }

  const modeByName = new Map<string, ModeEntry>();
  const matchupTable = new Map<string, Map<number, Map<number, MatchupEdge>>>();
  for (const mode of meta.modes) {
    modeByName.set(mode.mode, mode);
    matchupTable.set(mode.mode, indexMatchups(mode.brawlers));
  }

  return {
    meta,
    brawlerById,
    brawlerByName,
    classByBrawlerId,
    mapByName,
    mapsByMode,
    modeByName,
    mapMatchupTable,
    matchupTable,
    mapStatTable,
  };
}

/** 查询该图专属的对位边；该图没收录这条对位时返回 undefined */
export function getMapMatchup(
  idx: MetaIndex,
  mapName: string,
  selfId: number,
  oppId: number,
): MatchupEdge | undefined {
  return idx.mapMatchupTable.get(mapName)?.get(selfId)?.get(oppId);
}

/** 查询整个模式的对位边（兜底用） */
export function getMatchup(
  idx: MetaIndex,
  mode: string,
  selfId: number,
  oppId: number,
): MatchupEdge | undefined {
  return idx.matchupTable.get(mode)?.get(selfId)?.get(oppId);
}

export function getMapStat(
  idx: MetaIndex,
  mapName: string,
  brawlerId: number,
): MapBrawlerStat | undefined {
  return idx.mapStatTable.get(mapName)?.get(brawlerId);
}

/** 取英雄职业；未收录时兜底为火力手，不抛错 */
export function getClass(idx: MetaIndex, brawlerId: number): BrawlerClass {
  return idx.classByBrawlerId.get(brawlerId) ?? 'DAMAGE';
}

/** 按模式顺序排列的地图列表（UI 地图选择器用） */
export function mapsOfMode(idx: MetaIndex, mode: ModeKey): MapEntry[] {
  return idx.mapsByMode.get(mode) ?? [];
}
