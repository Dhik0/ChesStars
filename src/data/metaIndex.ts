import type {
  BrawlMeta,
  BrawlerRef,
  MapBrawlerStat,
  MapEntry,
  MatchupEdge,
  MatchupTuple,
  ModeEntry,
  ModeKey,
} from '../types/meta';
import { normalizeName } from './localization';
import { classOf, type BrawlerClass } from './brawlerProfile';

/**
 * 运行时索引：把 meta JSON 的嵌套结构展平成 O(1) 查询，供算分引擎高频调用。
 *
 * 两级对位数据并存，用途严格分开：
 *
 *   1. **v5 无序查表**（`matchup_table` / `global_matchups`）——
 *      3×3 对位格与 BP 克制分的**唯一**数据来源。键是 `minId_maxId`，
 *      同一对英雄只有一条记录，正反查询共用它（反向取负），所以天然对称。
 *   2. **v3 的 Top-K 边**（`brawlers[].matchups`）——
 *      只服务英雄详情页的「最佳/最差对手」榜单，不再参与对位格渲染。
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
  /** mapName -> selfId -> oppId -> 对位边（v3 Top-K，仅详情页榜单） */
  mapMatchupTable: Map<string, Map<number, Map<number, MatchupEdge>>>;
  /** mode -> selfId -> oppId -> 对位边（v3 Top-K，仅详情页榜单） */
  matchupTable: Map<string, Map<number, Map<number, MatchupEdge>>>;
  /** mapName -> brawlerId -> 地图统计 */
  mapStatTable: Map<string, Map<number, MapBrawlerStat>>;
  /** mapName -> 无序对位查表（v5） */
  mapMatchup: Map<string, MatchupTable>;
  /** mode -> 无序对位查表（v5） */
  modeMatchup: Map<string, MatchupTable>;
  /** 全局无序对位查表（v5），地图/模式都未命中时兜底 */
  globalMatchup: MatchupTable;
}

/** 一条对位查表命中结果 */
export interface MatchupCell {
  /** 百分点，+ 表示 idA 占优 */
  deltaPp: number;
  /** 有效样本量 */
  nEff: number;
}

/** 无序对位查表：键为 `${minId}_${maxId}` */
export type MatchupTable = Map<string, MatchupCell>;

/** 查表来源：地图专属 / 模式 / 全局兜底 */
export type MatchupSource = 'map' | 'mode' | 'global';

/** `lookupMatchup` 的返回值 */
export interface MatchupHit extends MatchupCell {
  source: MatchupSource;
}

/** 一对英雄的规范键：小的 id 在前，保证 (A,B) 与 (B,A) 落到同一个键 */
export function matchupKey(a: number, b: number): string {
  return a <= b ? `${a}_${b}` : `${b}_${a}`;
}

/** 把 `[min_id, max_id, delta_pp, n_eff][]` 折成 Map，重复键后者覆盖前者 */
export function indexMatchupTable(rows: readonly MatchupTuple[]): MatchupTable {
  const table: MatchupTable = new Map();
  for (const [a, b, deltaPp, nEff] of rows) {
    table.set(matchupKey(a, b), { deltaPp, nEff });
  }
  return table;
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
  const mapMatchup = new Map<string, MatchupTable>();
  for (const m of meta.maps) {
    mapByName.set(m.map_name, m);
    const arr = mapsByMode.get(m.mode) ?? [];
    arr.push(m);
    mapsByMode.set(m.mode, arr);
    const statMap = new Map<number, MapBrawlerStat>();
    for (const s of m.brawlers) statMap.set(s.id, s);
    mapStatTable.set(m.map_name, statMap);
    mapMatchupTable.set(m.map_name, indexMatchups(m.brawlers));
    mapMatchup.set(m.map_name, indexMatchupTable(m.matchup_table));
  }

  const modeByName = new Map<string, ModeEntry>();
  const matchupTable = new Map<string, Map<number, Map<number, MatchupEdge>>>();
  const modeMatchup = new Map<string, MatchupTable>();
  for (const mode of meta.modes) {
    modeByName.set(mode.mode, mode);
    matchupTable.set(mode.mode, indexMatchups(mode.brawlers));
    modeMatchup.set(mode.mode, indexMatchupTable(mode.matchup_table));
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
    mapMatchup,
    modeMatchup,
    globalMatchup: indexMatchupTable(meta.global_matchups),
  };
}

/** 查询该图专属的 Top-K 对位边（仅详情页榜单用）；该图没收录这条对位时返回 undefined */
export function getMapMatchup(
  idx: MetaIndex,
  mapName: string,
  selfId: number,
  oppId: number,
): MatchupEdge | undefined {
  return idx.mapMatchupTable.get(mapName)?.get(selfId)?.get(oppId);
}

/** 查询整个模式的 Top-K 对位边（仅详情页榜单用） */
export function getMatchup(
  idx: MetaIndex,
  mode: string,
  selfId: number,
  oppId: number,
): MatchupEdge | undefined {
  return idx.matchupTable.get(mode)?.get(selfId)?.get(oppId);
}

/**
 * **唯一的对位查表入口**（v5 无序查表，严格对称）。
 *
 * 查询顺序：地图 `matchup_table` → 模式 `matchup_table` → `global_matchups`，
 * 命中即停。表里存的方向永远是 `minId → maxId`，所以：
 *
 *   - `idA <= idB`：直接取，`deltaPp` 就是 A 对 B 的值；
 *   - `idA >  idB`：取同一条记录，把 `deltaPp` **取负**。
 *
 * 因此 `lookup(A,B).deltaPp === -lookup(B,A).deltaPp` 恒成立——3×3 对位格里
 * 蓝对红、红对蓝的两格共用同一条记录，换边必然绿↔红、黄↔黄、空↔空。
 *
 * 命中即有效：`deltaPp === 0`（五五开）也返回记录，调用方**不得**用 falsy 判空。
 * 只有三层都没命中才返回 null（真正无数据）。
 *
 * 传同一个 id、或 id 不是有限数字时返回 null（自己打自己没有对位意义）。
 */
export function lookupMatchup(
  idx: MetaIndex,
  mapName: string,
  mode: string,
  idA: number,
  idB: number,
): MatchupHit | null {
  if (!Number.isFinite(idA) || !Number.isFinite(idB) || idA === idB) return null;

  const flipped = idA > idB;
  const key = matchupKey(idA, idB);
  const sign = flipped ? -1 : 1;

  const fromMap = idx.mapMatchup.get(mapName)?.get(key);
  if (fromMap) {
    return { deltaPp: sign * fromMap.deltaPp, nEff: fromMap.nEff, source: 'map' };
  }

  const fromMode = idx.modeMatchup.get(mode)?.get(key);
  if (fromMode) {
    return { deltaPp: sign * fromMode.deltaPp, nEff: fromMode.nEff, source: 'mode' };
  }

  const fromGlobal = idx.globalMatchup.get(key);
  if (fromGlobal) {
    return { deltaPp: sign * fromGlobal.deltaPp, nEff: fromGlobal.nEff, source: 'global' };
  }

  return null;
}

/** 这份数据里是否存在任何 v5 查表（旧版数据全是空表） */
export function hasMatchupTables(idx: MetaIndex): boolean {
  if (idx.globalMatchup.size > 0) return true;
  for (const table of idx.mapMatchup.values()) if (table.size > 0) return true;
  for (const table of idx.modeMatchup.values()) if (table.size > 0) return true;
  return false;
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
