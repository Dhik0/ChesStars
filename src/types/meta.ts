/**
 * Brawl Meta Schema v5 — 类型定义
 *
 * v5 相对 v3/v4 的关键变化：后端新增**无序对位查表**，对位不再依赖 Top-K 列表。
 *
 *   maps[].matchup_table:  [min_id, max_id, delta_pp, n_eff][]
 *   modes[].matchup_table: [min_id, max_id, delta_pp, n_eff][]
 *   global_matchups:       [min_id, max_id, delta_pp, n_eff][]
 *
 *   - `min_id` / `max_id`：一对英雄的 id 按数值排好序，**同一对只出现一次**，
 *     所以 `(A,B)` 与 `(B,A)` 命中同一条记录，天然对称；
 *   - `delta_pp`：**百分点**（`4.44` 就是 +4.44%），方向为 `min_id` 对 `max_id`，
 *     查询反向时取负号，**不要再乘 100**；
 *   - `n_eff`：有效样本量（后端已做分层平滑折算）。
 *
 * v5 取消了 Top-K 截断与均势剪枝，因此查表**命中即有效**——`delta_pp === 0`
 * 表示「有五五开数据」，不是「没有数据」。只有三层查表全部未命中才是无数据。
 *
 * 本文件同时兼容 v3/v4 旧结构（没有 matchup_table，旧缓存不会导致崩溃），
 * 字段名与层级完全对应：
 *
 *   {
 *     schema_version: 5,
 *     updated_at: "2026-11-22T02:03:49Z",
 *     season_start: "2026-07-20",
 *     total_battles: 168215,
 *     min_tier: 20,
 *     tier_audit: { min_tier, battles_total, battles_kept, unknown_tier_battles, distribution[] },
 *     params: {
 *       bayes_prior_weight, matchup_smoothing_c, matchup_min_samples,
 *       map_matchup_min_samples, map_matchup_trust_samples, decay_half_life_days
 *     },
 *     brawlers: [{ id, name }],                       // 108 条，数组（非字典）
 *     maps:     [{ map_name, mode, total_games, brawlers: MapBrawlerStat[], matchup_table }],  // 26 张
 *     modes:    [{ mode, total_games, brawlers: ModeBrawlerStat[], matchup_table }],           // 6 个
 *     global_matchups: [min_id, max_id, delta_pp, n_eff][],                                    // v5 新增
 *     roles:    { version, roles: [{ key, label, description, brawlers: string[], brawler_ids: [] }] }
 *   }
 *
 * v3 相对 v2 的关键变化（克制算法重写为「高段位筛选 + Log5 残差」）：
 *   1. 对位边结构变了：`{ opponent_id, games, win_rate, smoothed_wr }`
 *      → `{ opponent, delta, samples }`。
 *      - `delta` 是 Log5 预期胜率残差，单位为**百分点**（+12.3 表示该英雄对位多赢 12.3 个百分点）。
 *      - `samples` 是这条对位的交手场次（**原始场次**，不是有效样本 eff_n）。
 *      - 边本身不再带 win_rate，胜率层面的信息已被残差吸收。
 *   2. 对位边下沉到地图层：`maps[].brawlers[].matchups[]` 是**该图专属**的对位，
 *      模式层 `modes[].brawlers[].matchups[]` 仍然保留，作为该图样本不足时的兜底。
 *   3. 地图覆盖 26 张（新增 Flowing Springs / Goldarm Gulch，样本量很小）。
 *   4. params 里 `matchup_prior_weight` 被 `matchup_smoothing_c` 取代，
 *      并新增地图层对位的两个门槛（min / trust samples）。
 *
 * v1.1.2（后端「地图分层去偏 + 互斥分层贝叶斯平滑」）新增：
 *   - `matchup_min_eff_samples` / `matchup_min_abs_delta`：后端导出门槛
 *     （`eff_n >= 15` 且 `|delta| >= 0.02`），前端**不再**按 `samples` 二次过滤；
 *   - `same_mode_weight` / `same_mode_cap` / `other_mode_weight` / `other_mode_cap`：
 *     借用同模式其他图 / 其他模式样本时的折算权重与封顶，仅用于解释数据来源。
 *   注意：`samples` 是原始场次，`eff_n` 才是含借用样本的有效样本量。
 *   后端按 eff_n 过滤后，约 57% 的地图条目原始 `samples < 10`，属正常现象。
 *
 * 与需求文档的差异（实测结论，代码按实测结构实现）：
 *   1. v3/v4 的 1v1 克制矩阵不在 mode 顶层，而是嵌在 brawlers[].matchups[] 内，
 *      以 opponent 指向对手（Top-K 截断）。v5 起顶层 `matchup_table` 才是对位查询的
 *      唯一来源，`brawlers[].matchups` 只留给「最佳/最差对手」这类榜单展示。
 *   2. `brawlers` 是数组而非字典；`roles[].brawler_ids` 全为空数组，
 *      角色归属只能靠 `roles[].brawlers` 里的英文名匹配（且大小写/拼写存在差异）。
 *   3. 候选集以地图层为准：个别地图只覆盖 74~108 个英雄。
 *   4. `tier_audit.unknown_tier_battles` 等于总场次，说明本批数据未能解析出段位，
 *      高段位筛选在数据侧尚未真正生效（前端不依赖该字段做计算，仅展示）。
 *   5. v5 的 `score` 是**跨图统一标尺**（后端废除了逐图 Min–Max 归一化）：
 *      头部主力约 65~90，常规主力 55~65，冷门/劣势英雄大多低于 50（中位数约 27）。
 *      所以分数配色不能再用「第一名 100 分」那套阈值。
 */

/** 当前解析的目标版本 */
export const SCHEMA_VERSION = 5;

/**
 * 仍然能解析的旧版本。
 *
 * v3/v4 没有 `matchup_table`，解析时按空表处理：数据能正常加载（旧缓存不崩），
 * 但 3×3 对位格会因为没有查表数据而留空——由 `shouldReplaceMeta` 按版本号
 * 触发一次刷新，把缓存换到 v5。
 */
export const LEGACY_SCHEMA_VERSIONS: readonly number[] = [3, 4];

/** 全部可解析版本（升序） */
export const SUPPORTED_SCHEMA_VERSIONS: readonly number[] = [
  ...LEGACY_SCHEMA_VERSIONS,
  SCHEMA_VERSION,
].sort((a, b) => a - b);

/** 选人顺位：先手万金油 / 中位 / 后手 */
export type PickOrder = 'FIRST' | 'MIDDLE' | 'LAST';

/** 6 个排位模式（数据中的真实取值） */
export type ModeKey =
  | 'bounty'
  | 'brawlBall'
  | 'knockout'
  | 'hotZone'
  | 'gemGrab'
  | 'heist';

export const MODE_KEYS: readonly ModeKey[] = [
  'bounty',
  'brawlBall',
  'knockout',
  'hotZone',
  'gemGrab',
  'heist',
] as const;

/**
 * brawl_meta.json 里 roles 表的原始取值。
 *
 * ⚠️ 这是**数据结构的真实描述**，不是业务分类：它把「破墙」这类能力
 * 和「坦克/火力手」这类职业混在了一起。
 * 业务代码请使用 `src/data/brawlerProfile.ts` 的 `BrawlerClass`（纯职业，7 类）。
 */
export type RoleKey =
  | 'TANK'
  | 'DAMAGE'
  | 'WALLBREAK'
  | 'THROWER'
  | 'ASSASSIN'
  | 'CONTROL'
  | 'SUPPORT';

/** 顶层英雄字典元素 */
export interface BrawlerRef {
  id: number;
  name: string;
}

/**
 * 一条 1v1 对位边（地图层与模式层同构）。
 *
 * `delta` 是 Log5 残差，单位为百分点；正数代表这条边上的英雄占优。
 * 该值已由后端做过平滑（`matchup_smoothing_c`）与样本收缩，
 * 但样本仍然很少的边（< min_samples）不建议直接采信。
 */
export interface MatchupEdge {
  /** 对手英雄 id */
  opponent: number;
  /** Log5 残差（百分点），+ 表示本方占优 */
  delta: number;
  /** 这条对位的交手场次 */
  samples: number;
}

/** 地图层单个英雄的统计（对应 maps[].brawlers[]） */
export interface MapBrawlerStat {
  id: number;
  name: string;
  games: number;
  wins: number;
  win_rate: number;
  smoothed_wr: number;
  use_rate: number;
  /** 地图内归一化强度分，0~100，该图第一名为 100 */
  score: number;
  pick_order: PickOrder;
  /** 该图专属的对位边（v3 新增） */
  matchups: MatchupEdge[];
}

/** 模式层单个英雄的统计（对应 modes[].brawlers[]） */
export interface ModeBrawlerStat {
  id: number;
  name: string;
  games: number;
  wins: number;
  win_rate: number;
  smoothed_wr: number;
  use_rate: number;
  matchups: MatchupEdge[];
}

/**
 * v5 无序对位查表的一行：`[min_id, max_id, delta_pp, n_eff]`。
 *
 * - 两个 id 已按数值升序排列，同一对英雄只有一条记录；
 * - `delta_pp` 是**百分点**，方向为 `min_id` 对 `max_id`；
 * - `n_eff` 是有效样本量（后端分层平滑后的折算样本，不是原始交手场次）。
 */
export type MatchupTuple = [minId: number, maxId: number, deltaPp: number, nEff: number];

/** 一张地图 */
export interface MapEntry {
  map_name: string;
  /** 模式 key，取值见 ModeKey */
  mode: string;
  total_games: number;
  brawlers: MapBrawlerStat[];
  /** 该图专属的无序对位查表（v5）；旧版数据为空数组 */
  matchup_table: MatchupTuple[];
}

/** 一个模式 */
export interface ModeEntry {
  mode: string;
  total_games: number;
  brawlers: ModeBrawlerStat[];
  /** 该模式的无序对位查表（v5）；旧版数据为空数组 */
  matchup_table: MatchupTuple[];
}

/** 角色定义 */
export interface RoleDef {
  key: string;
  label: string;
  description: string;
  /** 英文英雄名（Title Case），与字典的 UPPER CASE 需归一化后匹配 */
  brawlers: string[];
  /** 实测为空数组，保留字段以兼容后续版本 */
  brawler_ids: number[];
}

export interface MetaRoles {
  version: number;
  roles: RoleDef[];
}

/** 统计参数（用于解释分数来源） */
export interface MetaParams {
  /** 胜率贝叶斯先验权重（等效样本数） */
  bayes_prior_weight: number;
  /** Log5 残差平滑系数，越大越保守 */
  matchup_smoothing_c: number;
  /** 模式层对位边的最低样本数 */
  matchup_min_samples: number;
  /** 地图层对位边的最低样本数 */
  map_matchup_min_samples: number;
  /** 地图层对位边「完全采信」所需的样本数，中间线性收缩 */
  map_matchup_trust_samples: number;
  /** 时间衰减半衰期（天） */
  decay_half_life_days: number;

  /* ---------------- v1.1.2 扩展字段（全部可选，缺失时按默认值兜底） ---------------- */

  /**
   * 对位导出所需的最小**有效样本量**（`eff_n`，含借用样本）。
   * 后端已按此过滤，前端不得再拿 `samples` 做二次拦截。
   */
  matchup_min_eff_samples?: number;
  /** 对位导出所需的最小绝对残差（概率口径，0.02 = 2 个百分点） */
  matchup_min_abs_delta?: number;
  /** 同模式其他地图样本的折算权重（互斥分层平滑） */
  same_mode_weight?: number;
  /** 同模式其他地图折算样本的封顶 */
  same_mode_cap?: number;
  /** 其他模式样本的折算权重 */
  other_mode_weight?: number;
  /** 其他模式折算样本的封顶 */
  other_mode_cap?: number;
}

/** 段位筛选审计（v3 新增，仅用于展示数据质量） */
export interface TierAudit {
  min_tier: number;
  battles_total: number;
  battles_kept: number;
  unknown_tier_battles: number;
  /** tier 为数值段位，label 是后端给的中文名（如「传奇 I」「大师 II」） */
  distribution: { tier: number; battles: number; label?: string }[];
}

/** 根对象 */
export interface BrawlMeta {
  schema_version: number;
  updated_at: string;
  season_start: string;
  total_battles: number;
  min_tier: number;
  tier_audit?: TierAudit;
  params: MetaParams;
  brawlers: BrawlerRef[];
  maps: MapEntry[];
  modes: ModeEntry[];
  /** 全局无序对位查表（v5）：地图/模式都查不到时最后兜底；旧版数据为空数组 */
  global_matchups: MatchupTuple[];
  roles: MetaRoles;
}

/** 数据来源状态 */
export type MetaSource = 'builtin' | 'cache' | 'remote';

/** 校验失败时抛出的错误，带可读原因 */
export class MetaValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MetaValidationError';
  }
}

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const isNum = (v: unknown): v is number =>
  typeof v === 'number' && Number.isFinite(v);

const isStr = (v: unknown): v is string => typeof v === 'string';

function requireArray(v: unknown, path: string): unknown[] {
  if (!Array.isArray(v)) {
    throw new MetaValidationError(`${path} 必须是数组，实际为 ${typeof v}`);
  }
  return v;
}

function requireNum(v: unknown, path: string): number {
  if (!isNum(v)) {
    throw new MetaValidationError(`${path} 必须是有限数字，实际为 ${JSON.stringify(v)}`);
  }
  return v;
}

function requireStr(v: unknown, path: string): string {
  if (!isStr(v)) {
    throw new MetaValidationError(`${path} 必须是字符串，实际为 ${JSON.stringify(v)}`);
  }
  return v;
}

function optionalNum(v: unknown, fallback: number): number {
  return isNum(v) ? v : fallback;
}

/** 校验一组对位边；v3 结构为 { opponent, delta, samples } */
function validateMatchups(raw: unknown, path: string): MatchupEdge[] {
  return requireArray(raw, path).map((edge, i) => {
    const ep = `${path}[${i}]`;
    if (!isObj(edge)) throw new MetaValidationError(`${ep} 必须是对象`);
    return {
      opponent: requireNum(edge.opponent, `${ep}.opponent`),
      delta: requireNum(edge.delta, `${ep}.delta`),
      samples: requireNum(edge.samples, `${ep}.samples`),
    } satisfies MatchupEdge;
  });
}

/**
 * 校验 v5 的无序对位查表 `[min_id, max_id, delta_pp, n_eff][]`。
 *
 * 缺字段（v3/v4 旧数据）按空表处理，保证旧缓存不崩；单行结构不对则**跳过该行**
 * 而不是整体报错——查表是纯附加数据，一行脏数据不该让整份 meta 加载失败。
 * 若后端意外把两个 id 写反，这里统一按「小的在前」规整并同步翻转 delta 符号，
 * 保证 `delta_pp` 的方向始终是 `min_id → max_id`。
 */
function validateMatchupTable(raw: unknown, path: string): MatchupTuple[] {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw)) {
    throw new MetaValidationError(`${path} 必须是数组，实际为 ${typeof raw}`);
  }
  const out: MatchupTuple[] = [];
  for (const row of raw) {
    if (!Array.isArray(row) || row.length < 4) continue;
    const [a, b, delta, nEff] = row as unknown[];
    if (!isNum(a) || !isNum(b) || !isNum(delta) || !isNum(nEff)) continue;
    if (a === b) continue;
    const minId = Math.min(a, b);
    const maxId = Math.max(a, b);
    out.push([minId, maxId, a <= b ? delta : -delta, Math.max(0, nEff)]);
  }
  return out;
}

function validateMapBrawler(raw: unknown, path: string): MapBrawlerStat {
  if (!isObj(raw)) throw new MetaValidationError(`${path} 必须是对象`);
  const pickOrder = requireStr(raw.pick_order, `${path}.pick_order`);
  if (pickOrder !== 'FIRST' && pickOrder !== 'MIDDLE' && pickOrder !== 'LAST') {
    throw new MetaValidationError(
      `${path}.pick_order 取值非法: ${pickOrder}（期望 FIRST|MIDDLE|LAST）`,
    );
  }
  return {
    id: requireNum(raw.id, `${path}.id`),
    name: requireStr(raw.name, `${path}.name`),
    games: requireNum(raw.games, `${path}.games`),
    wins: requireNum(raw.wins, `${path}.wins`),
    win_rate: requireNum(raw.win_rate, `${path}.win_rate`),
    smoothed_wr: requireNum(raw.smoothed_wr, `${path}.smoothed_wr`),
    use_rate: requireNum(raw.use_rate, `${path}.use_rate`),
    score: requireNum(raw.score, `${path}.score`),
    pick_order: pickOrder,
    matchups: validateMatchups(raw.matchups, `${path}.matchups`),
  };
}

function validateModeBrawler(raw: unknown, path: string): ModeBrawlerStat {
  if (!isObj(raw)) throw new MetaValidationError(`${path} 必须是对象`);
  return {
    id: requireNum(raw.id, `${path}.id`),
    name: requireStr(raw.name, `${path}.name`),
    games: requireNum(raw.games, `${path}.games`),
    wins: requireNum(raw.wins, `${path}.wins`),
    win_rate: requireNum(raw.win_rate, `${path}.win_rate`),
    smoothed_wr: requireNum(raw.smoothed_wr, `${path}.smoothed_wr`),
    use_rate: requireNum(raw.use_rate, `${path}.use_rate`),
    matchups: validateMatchups(raw.matchups, `${path}.matchups`),
  };
}

function validateRole(raw: unknown, path: string): RoleDef {
  if (!isObj(raw)) throw new MetaValidationError(`${path} 必须是对象`);
  const brawlers = requireArray(raw.brawlers, `${path}.brawlers`).map((n, i) =>
    requireStr(n, `${path}.brawlers[${i}]`),
  );
  const ids = Array.isArray(raw.brawler_ids)
    ? raw.brawler_ids.map((n, i) => requireNum(n, `${path}.brawler_ids[${i}]`))
    : [];
  return {
    key: requireStr(raw.key, `${path}.key`),
    label: requireStr(raw.label, `${path}.label`),
    description: isStr(raw.description) ? raw.description : '',
    brawlers,
    brawler_ids: ids,
  };
}

function validateTierAudit(raw: unknown): TierAudit | undefined {
  if (!isObj(raw)) return undefined;
  const distribution = Array.isArray(raw.distribution)
    ? raw.distribution
        .filter(isObj)
        .map((d) => ({
          tier: optionalNum(d.tier, 0),
          battles: optionalNum(d.battles, 0),
          label: isStr(d.label) ? d.label : undefined,
        }))
    : [];
  return {
    min_tier: optionalNum(raw.min_tier, 0),
    battles_total: optionalNum(raw.battles_total, 0),
    battles_kept: optionalNum(raw.battles_kept, 0),
    unknown_tier_battles: optionalNum(raw.unknown_tier_battles, 0),
    distribution,
  };
}

/**
 * 运行时校验：把 unknown（fetch/JSON.parse 的结果）收窄为 BrawlMeta。
 * 任何结构不符都会抛 MetaValidationError，避免脏数据进入算分引擎。
 */
export function validateMeta(raw: unknown): BrawlMeta {
  if (!isObj(raw)) throw new MetaValidationError('根节点必须是对象');

  const schemaVersion = requireNum(raw.schema_version, 'schema_version');
  if (!SUPPORTED_SCHEMA_VERSIONS.includes(schemaVersion)) {
    throw new MetaValidationError(
      `schema_version 不兼容: 支持 ${SUPPORTED_SCHEMA_VERSIONS.join('/')}，实际 ${schemaVersion}`,
    );
  }

  const paramsRaw = raw.params;
  if (!isObj(paramsRaw)) throw new MetaValidationError('params 必须是对象');
  const params: MetaParams = {
    bayes_prior_weight: requireNum(paramsRaw.bayes_prior_weight, 'params.bayes_prior_weight'),
    matchup_smoothing_c: optionalNum(paramsRaw.matchup_smoothing_c, 15),
    matchup_min_samples: requireNum(paramsRaw.matchup_min_samples, 'params.matchup_min_samples'),
    map_matchup_min_samples: optionalNum(
      paramsRaw.map_matchup_min_samples,
      paramsRaw.matchup_min_samples as number,
    ),
    map_matchup_trust_samples: optionalNum(paramsRaw.map_matchup_trust_samples, 15),
    decay_half_life_days: requireNum(
      paramsRaw.decay_half_life_days,
      'params.decay_half_life_days',
    ),
    // v1.1.2 扩展参数：旧版 JSON 没有这些字段，缺失时按后端默认值兜底
    matchup_min_eff_samples: optionalNum(paramsRaw.matchup_min_eff_samples, 15),
    matchup_min_abs_delta: optionalNum(paramsRaw.matchup_min_abs_delta, 0.02),
    same_mode_weight: optionalNum(paramsRaw.same_mode_weight, 0.6),
    same_mode_cap: optionalNum(paramsRaw.same_mode_cap, 40),
    other_mode_weight: optionalNum(paramsRaw.other_mode_weight, 0.3),
    other_mode_cap: optionalNum(paramsRaw.other_mode_cap, 25),
  };

  const brawlers = requireArray(raw.brawlers, 'brawlers').map((b, i) => {
    const p = `brawlers[${i}]`;
    if (!isObj(b)) throw new MetaValidationError(`${p} 必须是对象`);
    return { id: requireNum(b.id, `${p}.id`), name: requireStr(b.name, `${p}.name`) };
  });

  const maps = requireArray(raw.maps, 'maps').map((m, i) => {
    const p = `maps[${i}]`;
    if (!isObj(m)) throw new MetaValidationError(`${p} 必须是对象`);
    return {
      map_name: requireStr(m.map_name, `${p}.map_name`),
      mode: requireStr(m.mode, `${p}.mode`),
      total_games: requireNum(m.total_games, `${p}.total_games`),
      brawlers: requireArray(m.brawlers, `${p}.brawlers`).map((b, j) =>
        validateMapBrawler(b, `${p}.brawlers[${j}]`),
      ),
      matchup_table: validateMatchupTable(m.matchup_table, `${p}.matchup_table`),
    } satisfies MapEntry;
  });

  const modes = requireArray(raw.modes, 'modes').map((m, i) => {
    const p = `modes[${i}]`;
    if (!isObj(m)) throw new MetaValidationError(`${p} 必须是对象`);
    return {
      mode: requireStr(m.mode, `${p}.mode`),
      total_games: requireNum(m.total_games, `${p}.total_games`),
      brawlers: requireArray(m.brawlers, `${p}.brawlers`).map((b, j) =>
        validateModeBrawler(b, `${p}.brawlers[${j}]`),
      ),
      matchup_table: validateMatchupTable(m.matchup_table, `${p}.matchup_table`),
    } satisfies ModeEntry;
  });

  const rolesRaw = raw.roles;
  if (!isObj(rolesRaw)) throw new MetaValidationError('roles 必须是对象');
  const roles: MetaRoles = {
    version: requireNum(rolesRaw.version, 'roles.version'),
    roles: requireArray(rolesRaw.roles, 'roles.roles').map((r, i) =>
      validateRole(r, `roles.roles[${i}]`),
    ),
  };

  if (maps.length === 0) throw new MetaValidationError('maps 为空，无法进行 BP 推荐');
  if (modes.length === 0) throw new MetaValidationError('modes 为空，无法查询对位矩阵');

  return {
    schema_version: schemaVersion,
    updated_at: requireStr(raw.updated_at, 'updated_at'),
    season_start: isStr(raw.season_start) ? raw.season_start : '',
    total_battles: requireNum(raw.total_battles, 'total_battles'),
    min_tier: isNum(raw.min_tier) ? raw.min_tier : 0,
    tier_audit: validateTierAudit(raw.tier_audit),
    params,
    brawlers,
    maps,
    modes,
    global_matchups: validateMatchupTable(raw.global_matchups, 'global_matchups'),
    roles,
  };
}
