import { getClass, getMapStat } from '../data/metaIndex';
import type { MetaIndex } from '../data/metaIndex';
import type { BrawlerClass } from '../data/brawlerProfile';
import { TEAM_SLOTS, baseRateOf, counterDetail } from '../utils/draftEngine';
import type {
  EnemyStat,
  MatchRecord,
  MatchScore,
  MatchStat,
  ObjectiveKind,
} from './matchHistoryStore';
import { objectiveKindOf } from './matchHistoryStore';

/**
 * 局后技术复盘引擎（V1 完整指标版，纯本地、无 IO、无随机）。
 *
 * 评的是**玩家这一局的实战技术表现**，不是 BP 推荐分。三层结构：
 *
 *   第 1 层 · BP 难度：这名英雄在本图面对对面 3 人最终阵容，理论上是逆风还是顺风。
 *            逆风打出数据 / 赢局要明显加分；顺风打崩 / 输局要明显扣分。
 *   第 2 层 · 场均表现：先按实际局数归一化（2:0 与 2:1 的局数不同），再看
 *            击杀 / 死亡 / 伤害 / 治疗 / 承伤 / 模式专属指标。**只对录入了的项计分**，
 *            未填（null）的项连同权重一起剔除，剩余项按比例归一化——填一半不会被当成 0 输出。
 *   第 3 层 · 评级映射：6 档国象式评级 + 结构化评语 + 高光标签。
 *
 * 三个刻意的取舍：
 *   1. **没有数据就不评级**：六项全 null 的队友返回 `grade: null`，绝不因为「没填」
 *      就判成 0 分——那会让「忘了填」看起来像「打得烂」。
 *   2. **承受伤害不是越高越好**：按「单命承伤」结合职业评估，高承伤 + 高死亡
 *      直接剔除该项（只剩死亡惩罚），避免送人头被当成抗压。
 *   3. **评语只输出词条 key + 参数**，不在这里拼自然语言，三语由界面翻译。
 */

/* ------------------------------------------------------------------ *
 * 类型
 * ------------------------------------------------------------------ */

export type ReviewGrade = 'brilliant' | 'best' | 'good' | 'inaccuracy' | 'mistake' | 'blunder';

/** BP 难度分档 */
export type BpContext = 'disadvantaged' | 'neutral' | 'advantaged';

/** 阵营：我方 / 敌方（两边用同一套评分，只是局势镜像） */
export type ReviewSide = 'ally' | 'enemy';

/** 可比较、可高亮的单项指标（死亡不算「领跑项」） */
export type MetricKey = 'kills' | 'damage' | 'healing' | 'damageTaken' | 'objective';

/** 界面金标 / 引擎领跑判定用的指标顺序 */
export const LEADER_METRICS: readonly MetricKey[] = [
  'kills',
  'damage',
  'healing',
  'damageTaken',
  'objective',
];

/** 整局摘要标签 */
export type ReviewTag = 'comeback' | 'throw' | 'allOnline' | 'carry' | 'shaky' | 'incomplete';

/** 国象记谱符号（界面角标用） */
export const GRADE_SYMBOL: Record<ReviewGrade, string> = {
  brilliant: '!!',
  best: '⭐',
  good: '👍',
  inaccuracy: '?!',
  mistake: '?',
  blunder: '??',
};

/** 由高到低的档位顺序（统计、测试、排序共用） */
export const GRADE_ORDER: readonly ReviewGrade[] = [
  'brilliant',
  'best',
  'good',
  'inaccuracy',
  'mistake',
  'blunder',
];

/** 结构化评语：词条 key + 参数，由界面按当前语言渲染 */
export interface ReviewComment {
  key: string;
  params: Record<string, string | number>;
}

export interface ReviewMetrics {
  /** 实际局数（2:0 / 0:2 = 2，2:1 / 1:2 = 3） */
  games: number;
  killsPerGame: number | null;
  deathsPerGame: number | null;
  damagePerGame: number | null;
  healingPerGame: number | null;
  damageTakenPerGame: number | null;
  /** 模式专属指标的场均值；淘汰赛 / 未填为 null */
  objectivePerGame: number | null;
  /** (kills + 0.5) / (deaths + 1)，任一未填为 null */
  kd: number | null;
  /** 单命承伤 = 场均承伤 / (场均死亡 + 1)，用于判断「有效抗伤」 */
  damageTakenPerLife: number | null;
  /** 队内伤害占比 0~1；三人数据不全时为 null */
  damageShare: number | null;
  /** 队内击杀占比 0~1；三人数据不全时为 null */
  killShare: number | null;
}

export interface PlayerReview {
  brawlerId: string;
  /** 属于哪一方：双方共用同一套三层评分 */
  side: ReviewSide;
  isSelf: boolean;
  isStarPlayer: boolean;
  /** 是否录入了至少一项战绩（false = 未录入，不评级） */
  hasData: boolean;
  grade: ReviewGrade | null;
  /** 0~100 表现分；未评级为 null */
  score: number | null;
  bpContext: BpContext;
  /** 对位强度（百分点，正 = 优势），钳制在 ±25 */
  edgePp: number;
  /** 本图基准胜率（0~1）；该图没收录这名英雄时为 null */
  mapWinRate: number | null;
  /** 对「对面 3 人」的平均对位残差（百分点）；三层查表都没命中时为 null */
  matchupDelta: number | null;
  /** 本局的模式专属指标类型（淘汰赛为 null） */
  objectiveKind: ObjectiveKind | null;
  metrics: ReviewMetrics | null;
  /** 全场最高项（界面金标；含承伤，但承伤不加分） */
  highlights: MetricKey[];
  /** 主评语 */
  comment: ReviewComment;
  /** 高光专项（最多 2 条，界面渲染成小标签） */
  notes: ReviewComment[];
}

export interface MatchReview {
  recordId: string;
  /** 只有完赛（win / loss）才可复盘 */
  eligible: boolean;
  result: 'win' | 'loss' | null;
  score: MatchScore | null;
  /** 我方均分（只统计有数据的人）；全员未录入为 null */
  allyAvgScore: number | null;
  /** 敌方均分；敌方全员未录入时为 null（界面据此收起敌方区） */
  enemyAvgScore: number | null;
  /** 与我方选人顺序一致 */
  allyReviews: PlayerReview[];
  /** 与敌方选人顺序一致；旧记录没有敌方战绩时，这里仍会返回 3 条「未录入」 */
  enemyReviews: PlayerReview[];
  /** 本局模式专属指标类型（界面渲染第 5 列用） */
  objectiveKind: ObjectiveKind | null;
  tags: ReviewTag[];
}

/* ------------------------------------------------------------------ *
 * 可调参数（全部集中在这里，方便下一阶段微调）
 * ------------------------------------------------------------------ */

/** 对位强度分档阈值（百分点）：|edge| ≥ 3 才认为有明确方向 */
export const BP_EDGE_THRESHOLD_PP = 3;
/** edge 的钳制范围：避免极端对位把加减分拉爆 */
export const BP_EDGE_CAP_PP = 25;

/**
 * 模式权重表。
 *
 * 注意：这些数字**不需要加起来等于 1**——计分时只取「本局录入了的项」，
 * 再按它们的权重和做归一化。这样「只填了 K/D 和伤害」的人不会被治疗/承伤拖死。
 *
 * 模式专属指标固定占 27%~28%（要求 25%~30%），淘汰赛没有第 5 项，权重回到基础四项。
 */
interface WeightSet {
  kd: number;
  kill: number;
  survival: number;
  damage: number;
  healing: number;
  tanking: number;
  objective: number;
}

const MODE_WEIGHTS: Record<string, WeightSet> = {
  knockout: { kd: 0.26, kill: 0.16, survival: 0.3, damage: 0.28, healing: 0.14, tanking: 0.18, objective: 0 },
  bounty: { kd: 0.2, kill: 0.14, survival: 0.24, damage: 0.18, healing: 0.1, tanking: 0.14, objective: 0.27 },
  brawlBall: { kd: 0.18, kill: 0.12, survival: 0.2, damage: 0.17, healing: 0.1, tanking: 0.16, objective: 0.27 },
  hotZone: { kd: 0.18, kill: 0.12, survival: 0.2, damage: 0.18, healing: 0.1, tanking: 0.17, objective: 0.27 },
  heist: { kd: 0.18, kill: 0.12, survival: 0.18, damage: 0.18, healing: 0.08, tanking: 0.14, objective: 0.28 },
  gemGrab: { kd: 0.2, kill: 0.14, survival: 0.22, damage: 0.18, healing: 0.1, tanking: 0.16, objective: 0.27 },
};

/** 未登记的模式按 gemGrab 处理（有专属指标但不算极端） */
const DEFAULT_WEIGHTS: WeightSet = MODE_WEIGHTS.gemGrab!;

/** 辅助职业：治疗权重翻倍，同时压低伤害、抬高不死权重（面板伤害天然更低） */
const SUPPORT_HEALING_MULTIPLIER = 2.1;
const SUPPORT_DAMAGE_FACTOR = 0.8;
const SUPPORT_SURVIVAL_FACTOR = 1.2;

/** 死亡惩罚系数（每场阵亡扣多少分）：赏金 / 淘汰赛死一次代价更高 */
const DEATH_PENALTY_DEFAULT = 13;
const DEATH_PENALTY_HEAVY = 18;
const HEAVY_DEATH_MODES: readonly string[] = ['bounty', 'knockout'];

/** 队内占比在总分里的权重（三人数据齐全时才启用） */
const SHARE_BLEND = 0.28;

/** 比分基线修正 */
const SCORE_BONUS: Record<MatchScore, number> = {
  '2:0': 6, // 碾压
  '2:1': 3, // 鏖战
  '1:2': 0, // 惜败：不额外扣
  '0:2': -6, // 完败
};

/** 👑 最佳玩家的表现加分（覆盖拆金库 / 进球 / 带钻 / 治疗等面板外贡献） */
const STAR_PLAYER_BONUS = 8;

/**
 * 承伤评估：单命承伤达到「本职业参考值」时给 55 分，超出线性加分到 100。
 *
 * 参考值的含义是「拿满一半分需要吃多少伤害」——坦克门槛最低（吃伤害本来就是本职工作），
 * 脆皮门槛最高（吃这么多往往意味着被抓住 / 站位有问题）。这样同样是 7500 单命承伤，
 * 坦克拿满分、射手只拿一半，「前排有效抗伤」才不会被后排的高承伤蹭走。
 */
const TANKING_TARGET_BY_CLASS: Record<BrawlerClass, number> = {
  TANK: 4000,
  DAMAGE: 5500,
  CONTROL: 5500,
  ASSASSIN: 6500,
  MARKSMAN: 8000,
  ARTILLERY: 8500,
  SUPPORT: 8000,
};

/** 场均死亡 ≥ 这个数时，承伤不再算「有效抗伤」（只剩死亡惩罚） */
const TANKING_DEATH_GATE = 5;

/** 单项领跑加分：每个领跑项 +2，最多 +5（承伤领跑不加分，只做金标） */
const LEADER_BONUS = 2;
const LEADER_BONUS_CAP = 5;

/** 模式专属指标的「满分线」（场均值） */
const OBJECTIVE_TARGET: Record<ObjectiveKind, number> = {
  goals: 2, // 场均 2 球
  zoneSeconds: 45, // 场均占领 45 秒
  stars: 10, // 场均 10 星
  safeDamage: 20000, // 场均金库伤害 2 万
  gems: 10, // 场均 10 宝石
};

/** 领跑项 → 高光评语词条（模式指标按类型分叉，避免嵌套翻译） */
const TOP_OBJECTIVE_NOTE: Record<ObjectiveKind, string> = {
  goals: 'review.note.topGoals',
  zoneSeconds: 'review.note.topZone',
  stars: 'review.note.topStars',
  safeDamage: 'review.note.topSafeDamage',
  gems: 'review.note.topGems',
};

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));
const round = (v: number, digits: number): number => {
  const f = 10 ** digits;
  return Math.round(v * f) / f;
};

/* ------------------------------------------------------------------ *
 * 第 1 层：BP 难度
 * ------------------------------------------------------------------ */

/** 比分 → 实际局数 */
export function gamesOfScore(score: MatchScore): number {
  return score === '2:0' || score === '0:2' ? 2 : 3;
}

/**
 * 对位强度（百分点）= 本图基准胜率偏离 + 对敌方 3 人的平均残差。
 *
 * 基准胜率按「50% 为中性」折算成百分点，再叠加克制残差；任一项缺失就按 0 计，
 * 最后钳制在 ±25，避免一张极端地图 + 一条极端对位把系数拉到失真。
 */
export function bpEdgeOf(mapWinRate: number | null, matchupDelta: number | null): number {
  const base = mapWinRate === null ? 0 : (mapWinRate - 0.5) * 100;
  const counter = matchupDelta === null ? 0 : matchupDelta;
  return clamp(base + counter, -BP_EDGE_CAP_PP, BP_EDGE_CAP_PP);
}

/** 对位强度 → 三档 */
export function bpContextOf(edgePp: number): BpContext {
  if (edgePp <= -BP_EDGE_THRESHOLD_PP) return 'disadvantaged';
  if (edgePp >= BP_EDGE_THRESHOLD_PP) return 'advantaged';
  return 'neutral';
}

/* ------------------------------------------------------------------ *
 * 第 2 层：场均表现
 * ------------------------------------------------------------------ */

/** 六项指标里只要有一项有值就参与评级 */
export function hasAnyStat(stat: {
  kills: number | null;
  deaths: number | null;
  damage: number | null;
  healing?: number | null;
  damageTaken?: number | null;
  objectiveValue?: number | null;
}): boolean {
  return (
    stat.kills !== null ||
    stat.deaths !== null ||
    stat.damage !== null ||
    (stat.healing ?? null) !== null ||
    (stat.damageTaken ?? null) !== null ||
    (stat.objectiveValue ?? null) !== null
  );
}

/** K/D 效率：(kills + 0.5) / (deaths + 1)，0 死亡不除零 */
export function kdOf(kills: number, deaths: number): number {
  return (kills + 0.5) / (deaths + 1);
}

/** 单名英雄的评分输入（与 meta 解耦，单测可以直接构造） */
export interface PlayerEvalInput {
  brawlerId: string;
  /** 阵营；只影响输出标注与「我」标签，评分逻辑完全一致 */
  side?: ReviewSide;
  isSelf: boolean;
  isStarPlayer: boolean;
  /** 原始战绩（未填为 null；healing 等三项可省略，按 null 处理） */
  stat: {
    kills: number | null;
    deaths: number | null;
    damage: number | null;
    healing?: number | null;
    damageTaken?: number | null;
    objectiveValue?: number | null;
  };
  /** 本局模式专属指标类型；null = 淘汰赛 / 未知模式 */
  objectiveKind?: ObjectiveKind | null;
  /** 全场最高项（用于加分与高光评语） */
  leaders?: MetricKey[];
  /** 队内占比；只有三人伤害 / 击杀都录入时才有 */
  shares?: { damage: number; kills: number } | null;
  result: 'win' | 'loss';
  score: MatchScore;
  mode: string;
  brawlerClass: BrawlerClass;
  /** 本图基准胜率（0~1），null = 该图没收录 */
  mapWinRate: number | null;
  /** 对敌方 3 人的平均残差（百分点），null = 无对位数据 */
  matchupDelta: number | null;
}

/** 单个计分项：权重 + 0~100 分 */
interface Component {
  weight: number;
  score: number;
}

/** 表现分权重：辅助职业单独调整（治疗翻倍、伤害下调、生存上调） */
function weightsOf(brawlerClass: BrawlerClass, mode: string): WeightSet {
  const base = MODE_WEIGHTS[mode] ?? DEFAULT_WEIGHTS;
  if (brawlerClass !== 'SUPPORT') return base;
  return {
    ...base,
    healing: base.healing * SUPPORT_HEALING_MULTIPLIER,
    damage: base.damage * SUPPORT_DAMAGE_FACTOR,
    survival: base.survival * SUPPORT_SURVIVAL_FACTOR,
  };
}

/**
 * 单名英雄评级。
 *
 * 分数结构：`perf`（已录入项的加权归一化）→ 叠加 BP 难度 / 比分 / 👑 / 领跑修正 → 0~100。
 * 难度修正刻意做成**非对称**：
 *   - 逆风：赢局或打得好的部分才加分，打得差不再额外扣（本来就难）；
 *   - 顺风：输局或打得差才扣分，打得好不额外加（顺风打出来是本分）。
 * 这样「逆风赢」和「顺风输」才会分别落进 `!!` 与 `??`，而不是靠一条线性系数糊过去。
 */
export function evaluatePlayer(input: PlayerEvalInput): PlayerReview {
  const { result, score, mode, brawlerClass } = input;
  const objectiveKind = input.objectiveKind ?? null;
  const leaders = input.leaders ?? [];
  const edgePp = bpEdgeOf(input.mapWinRate, input.matchupDelta);
  const bpContext = bpContextOf(edgePp);

  const kills = input.stat.kills;
  const deaths = input.stat.deaths;
  const damage = input.stat.damage;
  const healing = input.stat.healing ?? null;
  const damageTaken = input.stat.damageTaken ?? null;
  const objectiveValue = objectiveKind === null ? null : (input.stat.objectiveValue ?? null);

  const hasData = hasAnyStat(input.stat);

  const base: Omit<
    PlayerReview,
    'grade' | 'score' | 'metrics' | 'comment' | 'notes' | 'highlights'
  > = {
    brawlerId: input.brawlerId,
    side: input.side ?? 'ally',
    isSelf: input.isSelf,
    isStarPlayer: input.isStarPlayer,
    hasData,
    bpContext,
    edgePp: round(edgePp, 1),
    mapWinRate: input.mapWinRate === null ? null : round(input.mapWinRate, 3),
    matchupDelta: input.matchupDelta === null ? null : round(input.matchupDelta, 1),
    objectiveKind,
  };

  // 未录入：不给虚假低分，也不产出指标
  if (!hasData) {
    return {
      ...base,
      grade: null,
      score: null,
      metrics: null,
      highlights: [],
      comment: { key: 'review.comment.noData', params: {} },
      notes: [],
    };
  }

  const games = gamesOfScore(score);
  const perGame = (v: number | null): number | null => (v === null ? null : v / games);

  const killsPerGame = perGame(kills);
  const deathsPerGame = perGame(deaths);
  const damagePerGame = perGame(damage);
  const healingPerGame = perGame(healing);
  const damageTakenPerGame = perGame(damageTaken);
  const objectivePerGame = perGame(objectiveValue);

  const kd = kills !== null && deaths !== null ? kdOf(kills, deaths) : null;
  const takenPerLife =
    damageTakenPerGame !== null && deathsPerGame !== null
      ? damageTakenPerGame / (deathsPerGame + 1)
      : null;

  const damageShare = input.shares ? input.shares.damage : null;
  const killShare = input.shares ? input.shares.kills : null;

  const metrics: ReviewMetrics = {
    games,
    killsPerGame: killsPerGame === null ? null : round(killsPerGame, 2),
    deathsPerGame: deathsPerGame === null ? null : round(deathsPerGame, 2),
    damagePerGame: damagePerGame === null ? null : Math.round(damagePerGame),
    healingPerGame: healingPerGame === null ? null : Math.round(healingPerGame),
    damageTakenPerGame: damageTakenPerGame === null ? null : Math.round(damageTakenPerGame),
    objectivePerGame: objectivePerGame === null ? null : Math.round(objectivePerGame),
    kd: kd === null ? null : round(kd, 2),
    damageTakenPerLife: takenPerLife === null ? null : Math.round(takenPerLife),
    damageShare: damageShare === null ? null : round(damageShare, 3),
    killShare: killShare === null ? null : round(killShare, 3),
  };

  /* --- 分项打分（只给录入了的项算，权重按已录入项归一化） --- */
  const w = weightsOf(brawlerClass, mode);
  const components: Component[] = [];

  if (kills !== null) {
    components.push({
      weight: w.kill,
      score: clamp(((killsPerGame ?? 0) / 10) * 100, 0, 100),
    });
  }

  if (deaths !== null) {
    const penalty = HEAVY_DEATH_MODES.includes(mode) ? DEATH_PENALTY_HEAVY : DEATH_PENALTY_DEFAULT;
    components.push({
      weight: w.survival,
      score: clamp(100 - (deathsPerGame ?? 0) * penalty, 0, 100),
    });
  }

  if (kd !== null) {
    components.push({ weight: w.kd, score: clamp(20 + 35 * Math.log2(1 + kd), 0, 100) });
  }

  if (damagePerGame !== null) {
    components.push({ weight: w.damage, score: clamp((damagePerGame / 35000) * 100, 0, 100) });
  }

  if (healingPerGame !== null) {
    components.push({ weight: w.healing, score: clamp((healingPerGame / 8000) * 100, 0, 100) });
  }

  /**
   * 承伤：单命承伤 ÷ 职业参考值。高死亡（≥5/场）直接剔除该项——
   * 频繁掉点的「高承伤」不是抗压，是送能量，只保留死亡惩罚。
   */
  let tankingScore: number | null = null;
  if (takenPerLife !== null && (deathsPerGame ?? 0) < TANKING_DEATH_GATE) {
    const target = TANKING_TARGET_BY_CLASS[brawlerClass];
    tankingScore = clamp((takenPerLife / target) * 55, 0, 100);
    components.push({ weight: w.tanking, score: tankingScore });
  }

  if (objectivePerGame !== null && objectiveKind !== null) {
    const target = OBJECTIVE_TARGET[objectiveKind];
    components.push({ weight: w.objective, score: clamp((objectivePerGame / target) * 100, 0, 100) });
  }

  const weightSum = components.reduce((sum, c) => sum + c.weight, 0);
  let perf =
    weightSum > 0
      ? components.reduce((sum, c) => sum + c.weight * c.score, 0) / weightSum
      : 50; // 只填了「淘汰赛模式指标」这类无意义组合时的中性兜底

  // 队内占比：三人都有数据时才有意义，它衡量「队内相对贡献」
  if (damageShare !== null && killShare !== null) {
    const shareScore = clamp(50 + ((damageShare - 1 / 3) + (killShare - 1 / 3)) * 120, 0, 100);
    perf = perf * (1 - SHARE_BLEND) + shareScore * SHARE_BLEND;
  }

  /* --- 修正项 --- */
  const perfDelta = perf - 55;
  let contextAdj = 0;
  if (bpContext === 'disadvantaged') {
    contextAdj = (result === 'win' ? 8 : 0) + clamp(perfDelta * 0.25, 0, 10);
  } else if (bpContext === 'advantaged') {
    contextAdj = (result === 'loss' ? -8 : 0) + clamp(perfDelta * 0.25, -12, 0);
  }
  const outcomeAdj = SCORE_BONUS[score];
  const starAdj = input.isStarPlayer ? STAR_PLAYER_BONUS : 0;

  // 领跑加分：只有伤害 / 治疗 / 模式指标算，承伤最高只做金标
  const leaderBonus = clamp(
    (leaders.includes('damage') && damagePerGame !== null ? LEADER_BONUS : 0) +
      (leaders.includes('healing') && healingPerGame !== null ? LEADER_BONUS : 0) +
      (leaders.includes('objective') && objectivePerGame !== null ? LEADER_BONUS : 0),
    0,
    LEADER_BONUS_CAP,
  );

  const score100 = Math.round(
    clamp(perf + contextAdj + outcomeAdj + starAdj + leaderBonus, 0, 100),
  );
  const grade = gradeOf(score100, bpContext, result);

  const params: Record<string, string | number> = {
    kd: kd === null ? '—' : kd.toFixed(2),
    dpg: deathsPerGame === null ? '—' : deathsPerGame.toFixed(1),
    dmg: damagePerGame === null ? '—' : Math.round(damagePerGame),
  };

  return {
    ...base,
    grade,
    score: score100,
    metrics,
    highlights: leaders.filter((key) => metricPresent(key, metrics, objectiveKind)),
    comment: { key: commentKeyOf(grade, bpContext), params },
    notes: notesOf({ leaders, metrics, objectiveKind, tankingScore }),
  };
}

/** 该指标在本局是否真的有值（用于过滤金标） */
function metricPresent(
  key: MetricKey,
  metrics: ReviewMetrics,
  objectiveKind: ObjectiveKind | null,
): boolean {
  switch (key) {
    case 'kills':
      return metrics.killsPerGame !== null;
    case 'damage':
      return metrics.damagePerGame !== null;
    case 'healing':
      return metrics.healingPerGame !== null;
    case 'damageTaken':
      return metrics.damageTakenPerGame !== null;
    case 'objective':
      return objectiveKind !== null && metrics.objectivePerGame !== null;
    default:
      return false;
  }
}

/** 高光专项：最多 2 条，先领跑、再有效抗伤 / 高额治疗 */
function notesOf(input: {
  leaders: MetricKey[];
  metrics: ReviewMetrics;
  objectiveKind: ObjectiveKind | null;
  tankingScore: number | null;
}): ReviewComment[] {
  const { leaders, metrics, objectiveKind, tankingScore } = input;
  const notes: ReviewComment[] = [];

  if (leaders.includes('damage') && metrics.damagePerGame !== null) {
    notes.push({ key: 'review.note.topDamage', params: {} });
  }
  if (leaders.includes('healing') && metrics.healingPerGame !== null) {
    notes.push({ key: 'review.note.topHealing', params: {} });
  }
  if (leaders.includes('objective') && objectiveKind !== null && metrics.objectivePerGame !== null) {
    notes.push({ key: TOP_OBJECTIVE_NOTE[objectiveKind], params: {} });
  }
  if (tankingScore !== null && tankingScore >= 70) {
    notes.push({ key: 'review.note.tanking', params: {} });
  }
  if (notes.length < 2 && metrics.healingPerGame !== null && metrics.healingPerGame >= 6000) {
    notes.push({ key: 'review.note.sustain', params: {} });
  }

  return notes.slice(0, 2);
}

/**
 * 分数 → 档位。
 *
 * 两条**情境优先**的规则排在纯分数阈值之前，因为它们是这套评级的灵魂：
 *   - 逆风对位 + 赢局 + 分数 ≥ 70 → `!!`（逆天改命）
 *   - 优势对位 + 输局 + 分数 ≤ 40 → `??`（顺风翻车）
 * 其余按分数落档；`≤ 30` 无论什么对位都是「全场断层」。
 */
export function gradeOf(score: number, context: BpContext, result: 'win' | 'loss'): ReviewGrade {
  if (context === 'disadvantaged' && result === 'win' && score >= 70) return 'brilliant';
  if (score >= 92) return 'brilliant';
  if (context === 'advantaged' && result === 'loss' && score <= 40) return 'blunder';
  if (score <= 30) return 'blunder';
  if (score >= 78) return 'best';
  if (score >= 58) return 'good';
  if (score >= 44) return 'inaccuracy';
  return 'mistake';
}

/** 评语 key：只有 `!!` / `??` 需要按对位分叉，其余按档位取 */
function commentKeyOf(grade: ReviewGrade, context: BpContext): string {
  if (grade === 'brilliant') {
    return context === 'disadvantaged'
      ? 'review.comment.brilliant.disadvantaged'
      : 'review.comment.brilliant.default';
  }
  if (grade === 'blunder') {
    return context === 'advantaged'
      ? 'review.comment.blunder.advantaged'
      : 'review.comment.blunder.default';
  }
  return `review.comment.${grade}`;
}

/* ------------------------------------------------------------------ *
 * 整局复盘
 * ------------------------------------------------------------------ */

/** 比分镜像：2:0 ↔ 0:2，2:1 ↔ 1:2 */
const FLIP_SCORE: Record<MatchScore, MatchScore> = {
  '2:0': '0:2',
  '0:2': '2:0',
  '2:1': '1:2',
  '1:2': '2:1',
};

/** 胜负镜像 */
export function flipResult(result: 'win' | 'loss'): 'win' | 'loss' {
  return result === 'win' ? 'loss' : 'win';
}

/** 比分镜像（敌方视角） */
export function flipScore(score: MatchScore): MatchScore {
  return FLIP_SCORE[score];
}

/** 一方 3 人的战绩行（我方多一个 isSelf） */
type SideStat = Pick<
  MatchStat,
  'kills' | 'deaths' | 'damage' | 'healing' | 'damageTaken' | 'objectiveValue' | 'isStarPlayer'
> & { isSelf?: boolean };

/** 某一方的 6 项原始指标（用于算全场最高） */
function metricsOfStat(stat: SideStat | undefined): Record<MetricKey, number | null> {
  return {
    kills: stat?.kills ?? null,
    damage: stat?.damage ?? null,
    healing: stat?.healing ?? null,
    damageTaken: stat?.damageTaken ?? null,
    objective: stat?.objectiveValue ?? null,
  };
}

/**
 * 全场单项最高：只比较「有值且 > 0」的项；并列时都算领跑。
 * 返回 key = `${side}-${index}` → 领跑的指标列表。
 */
function computeLeaders(
  entries: Array<{ key: string; values: Record<MetricKey, number | null> }>,
): Map<string, MetricKey[]> {
  const best: Record<MetricKey, number> = {
    kills: 0,
    damage: 0,
    healing: 0,
    damageTaken: 0,
    objective: 0,
  };

  for (const entry of entries) {
    for (const key of LEADER_METRICS) {
      const value = entry.values[key];
      if (value !== null && value > best[key]) best[key] = value;
    }
  }

  const out = new Map<string, MetricKey[]>();
  for (const entry of entries) {
    const keys = LEADER_METRICS.filter((key) => {
      const value = entry.values[key];
      return value !== null && value > 0 && value === best[key];
    });
    out.set(entry.key, keys);
  }
  return out;
}

/**
 * 评估一方 3 人。
 *
 * 双方共用这一份实现：敌方只是把 `result` / `score` 取反、把对手换成我方 3 人，
 * 其余（BP 难度、场均归一化、占比、职业权重、评级映射）完全一致——
 * 对称性靠「同一段代码 + 镜像入参」保证，而不是两套相似的公式。
 */
function evaluateSide(
  idx: MetaIndex,
  record: MatchRecord,
  side: ReviewSide,
  picks: MatchRecord['allyPicks'],
  stats: SideStat[],
  opponentIds: number[],
  sideResult: 'win' | 'loss',
  sideScore: MatchScore,
  leaders: Map<string, MetricKey[]>,
  objectiveKind: ObjectiveKind | null,
): PlayerReview[] {
  const totalKills = stats.reduce((sum, s) => sum + (s.kills ?? 0), 0);
  const totalDamage = stats.reduce((sum, s) => sum + (s.damage ?? 0), 0);
  const sharesAvailable =
    stats.length === TEAM_SLOTS &&
    stats.every((s) => s.kills !== null && s.damage !== null) &&
    totalKills > 0 &&
    totalDamage > 0;

  return picks.map((pick, i) => {
    const id = Number(pick.brawlerId);
    const stat: SideStat =
      stats[i] ??
      ({
        kills: null,
        deaths: null,
        damage: null,
        healing: null,
        damageTaken: null,
        objectiveValue: null,
        isStarPlayer: false,
      } satisfies SideStat);
    const mapStat = Number.isFinite(id) ? getMapStat(idx, record.mapId, id) : undefined;
    const counter = Number.isFinite(id)
      ? counterDetail(idx, record.mapId, record.mode, id, opponentIds)
      : { avgDelta: 0, trustedCount: 0, details: [] };

    return evaluatePlayer({
      brawlerId: pick.brawlerId,
      side,
      isSelf: side === 'ally' && stat.isSelf === true,
      isStarPlayer: stat.isStarPlayer,
      stat: {
        kills: stat.kills,
        deaths: stat.deaths,
        damage: stat.damage,
        healing: stat.healing,
        damageTaken: stat.damageTaken,
        objectiveValue: stat.objectiveValue,
      },
      objectiveKind,
      leaders: leaders.get(`${side}-${i}`) ?? [],
      shares:
        sharesAvailable && stat.kills !== null && stat.damage !== null
          ? { damage: stat.damage / totalDamage, kills: stat.kills / totalKills }
          : null,
      result: sideResult,
      score: sideScore,
      mode: record.mode,
      brawlerClass: Number.isFinite(id) ? getClass(idx, id) : 'DAMAGE',
      mapWinRate: mapStat ? baseRateOf(mapStat) : null,
      matchupDelta: counter.trustedCount > 0 ? counter.avgDelta : null,
    });
  });
}

/** 团队均分：只统计有评级的人；全员未录入返回 null */
function averageOf(reviews: PlayerReview[]): number | null {
  const rated = reviews.filter((p) => p.score !== null);
  if (rated.length === 0) return null;
  return Math.round(rated.reduce((sum, p) => sum + (p.score ?? 0), 0) / rated.length);
}

/**
 * 复盘一局（我方 + 敌方 6 人）。
 *
 * 只有完赛对局参与评级；待补录直接返回 `eligible: false`（界面对它只开编辑抽屉）。
 * 队内占比要求「本方 3 人击杀与伤害都录入且总量 > 0」，两边各自独立判断——
 * 缺一个人就算占比，剩下两人的占比会被系统性高估。
 *
 * 敌方视角完全镜像：我方 win → 敌方 loss，2:0 → 0:2，对位对象换成我方 3 人。
 * 旧记录没有敌方战绩时，敌方 3 人按「未录入」处理，不影响我方评级。
 */
export function reviewMatch(idx: MetaIndex, record: MatchRecord): MatchReview {
  const eligible = record.result === 'win' || record.result === 'loss';
  if (!eligible || record.score === null) {
    return {
      recordId: record.id,
      eligible: false,
      result: null,
      score: record.score,
      allyAvgScore: null,
      enemyAvgScore: null,
      allyReviews: [],
      enemyReviews: [],
      objectiveKind: objectiveKindOf(record.mode),
      tags: [],
    };
  }

  const result = record.result as 'win' | 'loss';
  const score = record.score;
  const objectiveKind = objectiveKindOf(record.mode);
  const idsOf = (picks: MatchRecord['allyPicks']): number[] =>
    picks.map((pick) => Number(pick.brawlerId)).filter((id) => Number.isFinite(id));

  const enemyStats = (record.enemyStats ?? []) as EnemyStat[];

  // 全场最高项要先算：加分与高光都依赖它，而它只跟原始数值有关
  const leaders = computeLeaders([
    ...record.allyPicks.map((_, i) => ({
      key: `ally-${i}`,
      values: metricsOfStat(record.allyStats[i]),
    })),
    ...record.enemyPicks.map((_, i) => ({
      key: `enemy-${i}`,
      values: metricsOfStat(enemyStats[i]),
    })),
  ]);

  const allyReviews = evaluateSide(
    idx,
    record,
    'ally',
    record.allyPicks,
    record.allyStats,
    idsOf(record.enemyPicks),
    result,
    score,
    leaders,
    objectiveKind,
  );

  const enemyReviews = evaluateSide(
    idx,
    record,
    'enemy',
    record.enemyPicks,
    enemyStats,
    idsOf(record.allyPicks),
    flipResult(result),
    flipScore(score),
    leaders,
    objectiveKind,
  );

  return {
    recordId: record.id,
    eligible: true,
    result,
    score,
    allyAvgScore: averageOf(allyReviews),
    enemyAvgScore: averageOf(enemyReviews),
    allyReviews,
    enemyReviews,
    objectiveKind,
    tags: tagsOf(allyReviews, result),
  };
}

/** 整局摘要标签：按「逆风翻盘 / 顺风翻车 / 一己之力 / 全员在线 / 状态低迷 / 数据不全」排优先级 */
export function tagsOf(players: PlayerReview[], result: 'win' | 'loss'): ReviewTag[] {
  const tags: ReviewTag[] = [];
  const rated = players.filter((p) => p.grade !== null);
  const grades = rated.map((p) => p.grade as ReviewGrade);

  if (
    result === 'win' &&
    players.some(
      (p) => p.bpContext === 'disadvantaged' && (p.grade === 'brilliant' || p.grade === 'best'),
    )
  ) {
    tags.push('comeback');
  }
  if (
    result === 'loss' &&
    players.some(
      (p) => p.bpContext === 'advantaged' && (p.grade === 'blunder' || p.grade === 'mistake'),
    )
  ) {
    tags.push('throw');
  }
  if (grades.includes('brilliant') || players.some((p) => p.isStarPlayer && p.grade === 'best')) {
    tags.push('carry');
  }
  if (
    players.length === TEAM_SLOTS &&
    grades.length === TEAM_SLOTS &&
    grades.every((g) => g === 'brilliant' || g === 'best' || g === 'good')
  ) {
    tags.push('allOnline');
  }
  if (
    result === 'loss' &&
    rated.length > 0 &&
    grades.every((g) => g === 'inaccuracy' || g === 'mistake' || g === 'blunder')
  ) {
    tags.push('shaky');
  }
  if (players.some((p) => !p.hasData)) tags.push('incomplete');

  return tags;
}
