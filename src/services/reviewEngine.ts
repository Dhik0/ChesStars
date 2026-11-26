import { getClass, getMapStat } from '../data/metaIndex';
import type { MetaIndex } from '../data/metaIndex';
import { normalizeName } from '../data/localization';
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
 * 局后技术复盘引擎（V2 精细化版，纯本地、无 IO、无随机）。
 *
 * 三层结构不变：
 *   1. BP 难度（逆风 / 均势 / 优势）
 *   2. 场均表现（2:0 按 2 局、2:1 按 3 局归一化；只对录入了的项计分）
 *   3. 9 档国象式评级 + 结构化评语 + 高光标签
 *
 * V2 相对 V1 的四点变化：
 *   - 评级从 6 档扩到 9 档（新增 great / book / miss），`book` 与 `miss` 是情境专属；
 *   - 评分按**英雄画像**差异化：奶妈、功能辅助、阵地坦、刺客、射手、默认输出各一套权重，
 *     新增英雄只要职业对得上就自动落到默认画像，不需要维护名单；
 *   - 承伤只对前排（阵地坦 / 刺客）计分，且门槛提高到实战量级，射手脆皮不再蹭「有效抗伤」；
 *   - 治疗扣除脱战自然回血：非奶妈场均 < 22000 的治疗不参与计分，避免人人「高额治疗续航」。
 */

/* ------------------------------------------------------------------ *
 * 类型
 * ------------------------------------------------------------------ */

export type ReviewGrade =
  | 'brilliant'
  | 'great'
  | 'best'
  | 'good'
  | 'book'
  | 'inaccuracy'
  | 'mistake'
  | 'miss'
  | 'blunder';

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

/** 国象记谱符号（界面角标用；`book` 在界面里用书本图标，这里保留文本口径） */
export const GRADE_SYMBOL: Record<ReviewGrade, string> = {
  brilliant: '!!',
  great: '!',
  best: '★',
  good: '✓',
  book: '📖',
  inaccuracy: '?!',
  mistake: '?',
  miss: '×',
  blunder: '??',
};

/** 由高到低的档位顺序（统计、测试、排序共用） */
export const GRADE_ORDER: readonly ReviewGrade[] = [
  'brilliant',
  'great',
  'best',
  'good',
  'book',
  'inaccuracy',
  'mistake',
  'miss',
  'blunder',
];

/** 结构化评语：词条 key + 参数，由界面按当前语言渲染 */
export interface ReviewComment {
  key: string;
  params: Record<string, string | number>;
}

/** 六项总局原值（与游戏结算面板 1:1 对应，界面直接展示它） */
export interface ReviewTotals {
  kills: number | null;
  deaths: number | null;
  damage: number | null;
  healing: number | null;
  damageTaken: number | null;
  objectiveValue: number | null;
}

export interface ReviewMetrics {
  /** 实际局数（2:0 / 0:2 = 2，2:1 / 1:2 = 3） */
  games: number;
  /** 总局原值：界面展示用，评分仍走下面的场均 */
  totals: ReviewTotals;
  killsPerGame: number | null;
  deathsPerGame: number | null;
  damagePerGame: number | null;
  healingPerGame: number | null;
  damageTakenPerGame: number | null;
  /** 模式专属指标的场均值；淘汰赛 / 未填为 null */
  objectivePerGame: number | null;
  /** 算分用的平滑 K/D：(kills + 0.5) / (deaths + 1) */
  kd: number | null;
  /** 展示用的真实 K/D：`kills / deaths`，0 死显示 ∞，0/0 显示 0.00 */
  displayKd: string | null;
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
  /** 评分画像（细分英雄画像） */
  archetype: BrawlerArchetype;
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
  /** 全场最高项（界面金标；含承伤，但承伤只在画像允许时才加分） */
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
 * 英雄画像
 * ------------------------------------------------------------------ */

export type BrawlerArchetype =
  | 'healer'
  | 'utility_support'
  | 'frontline_tank'
  | 'assassin'
  | 'marksman_artillery'
  | 'damage_controller';

/**
 * 细分画像覆盖表（key = 英文名归一化）。
 *
 * 只列「官方职业不足以描述职责」的英雄；其余按官方职业兜底：
 * MARKSMAN / ARTILLERY → 射手投掷，SUPPORT → 功能辅助，其它 → 主力输出。
 * 新英雄即使没进这张表，也会自动落到兜底画像，不会算错。
 */
const ARCHETYPE_BY_NAME: Record<string, BrawlerArchetype> = {
  // 专职治疗
  poco: 'healer',
  byron: 'healer',
  berry: 'healer',
  pam: 'healer',
  doug: 'healer',
  kit: 'healer',
  // 功能辅助（不靠治疗吃饭）
  max: 'utility_support',
  gray: 'utility_support',
  gus: 'utility_support',
  ruffs: 'utility_support',
  // 阵地纯坦
  frank: 'frontline_tank',
  rosa: 'frontline_tank',
  hank: 'frontline_tank',
  buster: 'frontline_tank',
  elprimo: 'frontline_tank',
  ash: 'frontline_tank',
  jacky: 'frontline_tank',
  draco: 'frontline_tank',
  ollie: 'frontline_tank',
  // 刺客 / 突进收割
  mortis: 'assassin',
  edgar: 'assassin',
  lily: 'assassin',
  leon: 'assassin',
  fang: 'assassin',
  melodie: 'assassin',
  kenji: 'assassin',
  mico: 'assassin',
  darryl: 'assassin',
};

/** 官方职业 → 兜底画像 */
function archetypeFromClass(brawlerClass: BrawlerClass): BrawlerArchetype {
  if (brawlerClass === 'MARKSMAN' || brawlerClass === 'ARTILLERY') return 'marksman_artillery';
  if (brawlerClass === 'SUPPORT') return 'utility_support';
  return 'damage_controller';
}

/** 取英雄画像：先查覆盖表，再按官方职业兜底 */
export function archetypeOf(idx: MetaIndex, brawlerId: number): BrawlerArchetype {
  const ref = idx.brawlerById.get(brawlerId);
  const override = ref ? ARCHETYPE_BY_NAME[normalizeName(ref.name)] : undefined;
  if (override) return override;
  return archetypeFromClass(getClass(idx, brawlerId));
}

/* ------------------------------------------------------------------ *
 * 可调参数
 * ------------------------------------------------------------------ */

/** 对位强度分档阈值（百分点）：|edge| ≥ 3 才认为有明确方向 */
export const BP_EDGE_THRESHOLD_PP = 3;
/** edge 的钳制范围：避免极端对位把加减分拉爆 */
export const BP_EDGE_CAP_PP = 25;

/**
 * 模式权重表。
 *
 * 这些数字**不需要加起来等于 1**——计分时只取「本局录入了的项」，
 * 再按它们的权重和做归一化。这样「只填了 K/D 和伤害」的人不会被治疗/承伤拖死。
 *
 * 模式专属指标固定占 27%~28%，淘汰赛没有第 5 项，权重回到基础四项。
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

/**
 * 画像权重系数（乘在模式权重上）。
 *
 * 每个画像只改「它真正在乎的那几项」，其余保持模式默认：
 *   - 奶妈：治疗拉满、少死、不苛求伤害；
 *   - 功能辅助：不考核治疗，侧重生存 + 机制 + 辅助输出；
 *   - 阵地坦：承伤是本职，给独立权重，机制贡献略提；
 *   - 刺客：击杀效率与占比说话，不拿总伤害跟射手比；
 *   - 射手：伤害 + 严格死亡惩罚，承伤不计；
 *   - 默认输出：模式标准权重均衡。
 */
const ARCHETYPE_WEIGHT_FACTORS: Record<BrawlerArchetype, Partial<WeightSet>> = {
  healer: { healing: 3.2, survival: 1.25, damage: 0.65, kill: 0.8, tanking: 0.5 },
  utility_support: { healing: 0.5, survival: 1.2, objective: 1.3, damage: 0.95, kill: 0.9 },
  frontline_tank: { tanking: 1.9, survival: 1.15, damage: 0.85, objective: 1.15 },
  assassin: { kill: 1.55, kd: 1.25, damage: 0.8, survival: 0.95, tanking: 0.7 },
  marksman_artillery: { damage: 1.3, survival: 1.2, kill: 0.9 },
  damage_controller: {},
};

/**
 * 金库模式下的刺客：击杀 / 对人伤害的极端倾斜收一收，机制权重抬上来。
 * 金库的胜负是「谁先把箱子拆了」，拆箱流不该被击杀面板压死。
 */
const HEIST_ASSASSIN_FACTOR: Partial<WeightSet> = {
  kill: 1.15,
  kd: 1,
  damage: 0.9,
  objective: 1.35,
};

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
 * 承伤参考值：单命承伤达到它给 55 分，超出线性加分到 100。
 *
 * 只给前排两个画像开放：阵地坦 1 万、刺客 1.3 万（刺客不是专职抗伤，门槛更高）。
 * 射手 / 投掷 / 辅助 / 奶妈一律不计——他们的高承伤通常是站位问题，不该被当成抗压。
 */
const TANKING_TARGET_BY_ARCHETYPE: Partial<Record<BrawlerArchetype, number>> = {
  frontline_tank: 10000,
  assassin: 13000,
};

/** 场均死亡 ≥ 3.5 直接取消承伤加分（防止送人头混分） */
const TANKING_DEATH_GATE = 3.5;

/**
 * 金库「拆箱换命流」保护：对金库贡献足够大的人，不该因为击杀少被判欠佳。
 * 判定口径是「场均金库伤 ≥ 25000」或「占本队金库总伤 ≥ 30%」。
 */
const HEIST_CARRY_DAMAGE = 25000;
const HEIST_CARRY_SHARE = 0.3;
/** 达到上述贡献时的保底分（对应「稳健」档） */
const HEIST_CARRY_FLOOR = 58;
/** 金库贡献大的人，死亡惩罚打折（换命是战术，不是送） */
const HEIST_CARRY_DEATH_RELIEF = 0.6;

/** 整局顺逆风判定：双方净 BP 优势差超过这个值才算真顺风 / 真逆风 */
export const NET_BP_THRESHOLD_PP = 3;

/** 单项领跑加分：每个领跑项 +2，最多 +5（承伤领跑不加分，只做金标） */
const LEADER_BONUS = 2;
const LEADER_BONUS_CAP = 5;

/**
 * 治疗门槛：脱战自然回血会算进治疗面板，所以
 *   - 非奶妈：场均 < 22000 一律不参与计分（否则人人都是「高额治疗续航」）；
 *   - 奶妈：≥ 18000 才算真实治疗水准，才挂续航标签。
 */
const HEALER_SUSTAIN_MIN = 18000;
const SELF_HEAL_MIN = 22000;
/** 非奶妈的治疗项只给「轻度」权重 */
const SELF_HEAL_WEIGHT_FACTOR = 0.6;

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

/** 算分用的平滑 K/D：(kills + 0.5) / (deaths + 1)，0 死亡不除零 */
export function kdOf(kills: number, deaths: number): number {
  return (kills + 0.5) / (deaths + 1);
}

/**
 * 展示用的真实 K/D（与游戏内一致）：`kills / deaths` 两位小数；
 * 0 死有击杀显示 `∞`；0/0 显示 `0.00`。
 */
export function displayKdOf(kills: number | null, deaths: number | null): string | null {
  if (kills === null || deaths === null) return null;
  if (deaths === 0) return kills > 0 ? '∞' : '0.00';
  return (kills / deaths).toFixed(2);
}

/** 单名英雄的评分输入（与 meta 解耦，单测可以直接构造） */
export interface PlayerEvalInput {
  brawlerId: string;
  /** 阵营；只影响输出标注与「我」标签，评分逻辑完全一致 */
  side?: ReviewSide;
  /** 评分画像；缺省时按 brawlerClass 兜底 */
  archetype?: BrawlerArchetype;
  /** 官方职业（仅在没给 archetype 时用于兜底） */
  brawlerClass?: BrawlerClass;
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
  /** 本队模式机制总占比（金库拆箱流保护用）；null = 无机制指标 */
  objectiveShare?: number | null;
  result: 'win' | 'loss';
  score: MatchScore;
  mode: string;
  /** 本图基准胜率（0~1），null = 该图没收录 */
  mapWinRate: number | null;
  /** 对敌方 3 人的平均残差（百分点），null = 无对位数据 */
  matchupDelta: number | null;
  /** 大数值格式化（评语里输出「8.0万 / 80.2k」）；缺省用裸整数 */
  formatBig?: (value: number) => string;
}

/** 单个计分项：权重 + 0~100 分 */
interface Component {
  weight: number;
  score: number;
}

/** 模式权重 × 画像系数 */
function weightsOf(mode: string, archetype: BrawlerArchetype): WeightSet {
  const base = MODE_WEIGHTS[mode] ?? DEFAULT_WEIGHTS;
  const factor: Partial<WeightSet> = {
    ...ARCHETYPE_WEIGHT_FACTORS[archetype],
    ...(mode === 'heist' && archetype === 'assassin' ? HEIST_ASSASSIN_FACTOR : {}),
  };
  return {
    kd: base.kd * (factor.kd ?? 1),
    kill: base.kill * (factor.kill ?? 1),
    survival: base.survival * (factor.survival ?? 1),
    damage: base.damage * (factor.damage ?? 1),
    healing: base.healing * (factor.healing ?? 1),
    tanking: base.tanking * (factor.tanking ?? 1),
    objective: base.objective * (factor.objective ?? 1),
  };
}

/**
 * 单名英雄评级。
 *
 * 分数结构：`perf`（已录入项的加权归一化）→ 叠加 BP 难度 / 比分 / 👑 / 领跑修正 → 0~100。
 * 难度修正刻意做成**非对称**：
 *   - 逆风：赢局或打得好的部分才加分，打得差不再额外扣（本来就难）；
 *   - 顺风：输局或打得差才扣分，打得好不额外加（顺风打出来是本分）。
 */
export function evaluatePlayer(input: PlayerEvalInput): PlayerReview {
  const { result, score, mode } = input;
  const archetype = input.archetype ?? archetypeFromClass(input.brawlerClass ?? 'DAMAGE');
  const objectiveKind = input.objectiveKind ?? null;
  const leaders = input.leaders ?? [];
  const formatBig = input.formatBig ?? ((v: number) => String(Math.round(v)));
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
    archetype,
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
  const objectiveShare = input.objectiveShare ?? null;

  /**
   * 金库拆箱流：机制贡献足够大时给保底 + 死亡减免。
   * 「场均 2.5 万金库伤」或「占本队金库总伤 30%」都算真的在拆家，不是混子。
   */
  const heistCarry =
    mode === 'heist' &&
    objectivePerGame !== null &&
    (objectivePerGame >= HEIST_CARRY_DAMAGE ||
      (objectiveShare !== null && objectiveShare >= HEIST_CARRY_SHARE));

  const metrics: ReviewMetrics = {
    games,
    totals: { kills, deaths, damage, healing, damageTaken, objectiveValue },
    killsPerGame: killsPerGame === null ? null : round(killsPerGame, 2),
    deathsPerGame: deathsPerGame === null ? null : round(deathsPerGame, 2),
    damagePerGame: damagePerGame === null ? null : Math.round(damagePerGame),
    healingPerGame: healingPerGame === null ? null : Math.round(healingPerGame),
    damageTakenPerGame: damageTakenPerGame === null ? null : Math.round(damageTakenPerGame),
    objectivePerGame: objectivePerGame === null ? null : Math.round(objectivePerGame),
    kd: kd === null ? null : round(kd, 2),
    displayKd: displayKdOf(kills, deaths),
    damageTakenPerLife: takenPerLife === null ? null : Math.round(takenPerLife),
    damageShare: damageShare === null ? null : round(damageShare, 3),
    killShare: killShare === null ? null : round(killShare, 3),
  };

  /* --- 分项打分（只给录入了的项算，权重按已录入项归一化） --- */
  const w = weightsOf(mode, archetype);
  const components: Component[] = [];

  if (kills !== null) {
    components.push({
      weight: w.kill,
      score: clamp(((killsPerGame ?? 0) / 10) * 100, 0, 100),
    });
  }

  if (deaths !== null) {
    const basePenalty = HEAVY_DEATH_MODES.includes(mode)
      ? DEATH_PENALTY_HEAVY
      : DEATH_PENALTY_DEFAULT;
    // 金库拆箱流是「换命」不是「送」：死亡惩罚打折
    const penalty = basePenalty * (heistCarry ? HEIST_CARRY_DEATH_RELIEF : 1);
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

  /**
   * 治疗：脱战自然回血会算进面板，所以
   *   - 奶妈：始终计分（治疗就是本职工作）；
   *   - 其它画像：场均 ≥ 22000 才计分，且只给轻度权重。
   */
  if (healingPerGame !== null) {
    const isHealer = archetype === 'healer';
    if (isHealer || healingPerGame >= SELF_HEAL_MIN) {
      components.push({
        weight: w.healing * (isHealer ? 1 : SELF_HEAL_WEIGHT_FACTOR),
        score: clamp((healingPerGame / 8000) * 100, 0, 100),
      });
    }
  }

  /**
   * 承伤：只有前排画像参与，单命承伤 ÷ 画像参考值。
   * 场均死亡 ≥ 3.5 直接剔除该项——频繁掉点的「高承伤」不是抗压，是送能量。
   */
  const tankingTarget = TANKING_TARGET_BY_ARCHETYPE[archetype];
  let tankingScore: number | null = null;
  if (
    tankingTarget !== undefined &&
    takenPerLife !== null &&
    (deathsPerGame ?? 0) < TANKING_DEATH_GATE
  ) {
    tankingScore = clamp((takenPerLife / tankingTarget) * 55, 0, 100);
    components.push({ weight: w.tanking, score: tankingScore });
  }

  let objectiveScore: number | null = null;
  if (objectivePerGame !== null && objectiveKind !== null) {
    objectiveScore = clamp((objectivePerGame / OBJECTIVE_TARGET[objectiveKind]) * 100, 0, 100);
    components.push({ weight: w.objective, score: objectiveScore });
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

  // 金库拆箱流的机制保底：贡献够了就不该被判欠佳
  const rawScore = Math.round(clamp(perf + contextAdj + outcomeAdj + starAdj + leaderBonus, 0, 100));
  const score100 = heistCarry ? Math.max(rawScore, HEIST_CARRY_FLOOR) : rawScore;

  const objectiveLeader = leaders.includes('objective') && objectivePerGame !== null;
  const objectiveWeak = objectiveScore !== null && objectiveScore < 25;
  // 真实 K/D（用于评级里的「面板尚可」判定，不吃平滑公式的便宜）
  const kdRatio =
    kills === null || deaths === null ? null : deaths === 0 ? (kills > 0 ? Infinity : 0) : kills / deaths;

  const grade = gradeOf({
    score: score100,
    context: bpContext,
    result,
    isStarPlayer: input.isStarPlayer,
    objectiveLeader,
    objectiveWeak,
    kdRatio,
    damageShare,
  });

  // 评语里的伤害 / 阵亡统一用总局原值，与卡片 1:1 对应
  const params: Record<string, string | number> = {
    kd: metrics.displayKd ?? '—',
    deaths: deaths === null ? '—' : deaths,
    dmg: damage === null ? '—' : formatBig(damage),
  };

  return {
    ...base,
    grade,
    score: score100,
    metrics,
    highlights: leaders.filter((key) => metricPresent(key, metrics, objectiveKind)),
    comment: { key: commentKeyOf(grade, bpContext, objectiveWeak), params },
    notes: notesOf({
      leaders,
      metrics,
      objectiveKind,
      archetype,
      tankingScore,
      healingPerGame,
    }),
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

/**
 * 高光专项：最多 2 条，先领跑、再有效抗伤 / 高额治疗。
 *
 * 「前排有效抗伤」只发给阵地坦——射手 / 控场 / 刺客的高承伤通常是被抓，不该被表扬。
 * 「高额治疗续航」有硬门槛：脱战回血会计进面板，不放阈值会全员触发。
 */
function notesOf(input: {
  leaders: MetricKey[];
  metrics: ReviewMetrics;
  objectiveKind: ObjectiveKind | null;
  archetype: BrawlerArchetype;
  tankingScore: number | null;
  healingPerGame: number | null;
}): ReviewComment[] {
  const { leaders, metrics, objectiveKind, archetype, tankingScore, healingPerGame } = input;
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
  if (archetype === 'frontline_tank' && tankingScore !== null && tankingScore >= 70) {
    notes.push({ key: 'review.note.tanking', params: {} });
  }

  const sustainMin = archetype === 'healer' ? HEALER_SUSTAIN_MIN : SELF_HEAL_MIN;
  const sustain =
    healingPerGame !== null && healingPerGame >= sustainMin && !leaders.includes('healing');
  if (notes.length < 2 && sustain) {
    notes.push({ key: 'review.note.sustain', params: {} });
  }

  return notes.slice(0, 2);
}

/* ------------------------------------------------------------------ *
 * 第 3 层：评级映射（9 档）
 * ------------------------------------------------------------------ */

export interface GradeContext {
  score: number;
  context: BpContext;
  result: 'win' | 'loss';
  /** 是否 👑 最佳玩家 */
  isStarPlayer?: boolean;
  /** 是否拿到本局模式机制最高 */
  objectiveLeader?: boolean;
  /** 有机制指标但明显拖后腿 */
  objectiveWeak?: boolean;
  /** 真实 K/D（kills / deaths），用于「面板尚可」判定 */
  kdRatio?: number | null;
  /** 队内伤害占比 0~1 */
  damageShare?: number | null;
}

/** 「面板尚可」的门槛：真实 K/D 与队内伤害占比都不能垫底 */
const PANEL_OK_KD = 1;
const PANEL_OK_SHARE = 0.25;

/**
 * 分数 + 情境 → 9 档。
 *
 * 判定顺序即优先级，几条**情境专属**的规则必须排在纯分数阈值之前：
 *   - `!!` 逆风赢（逆天改命）或断层统治（≥92 且 👑 / ≥95）；
 *   - `??` 全场断层（≤30）或优势对位输到崩（≤40）；
 *   - `×` 优势对位输了但没崩（白费好阵容），或机制拖后腿致败；
 *   - `!` 关键制胜（👑 且良好 / 非顺风局 ≥80 / 机制最高 + 赢）；
 *   - `📖` 顺风局按剧本赢下（中上稳健区间，无 carry 也无失误）。
 */
export function gradeOf(input: GradeContext): ReviewGrade {
  const {
    score,
    context,
    result,
    isStarPlayer,
    objectiveLeader,
    objectiveWeak,
    kdRatio,
    damageShare,
  } = input;

  // 妙手
  if (context === 'disadvantaged' && result === 'win' && score >= 70) return 'brilliant';
  if (score >= 92 && (isStarPlayer || score >= 95)) return 'brilliant';

  // 败招：全场断层 / 顺风崩盘
  if (score <= 30) return 'blunder';
  if (context === 'advantaged' && result === 'loss' && score <= 40) return 'blunder';

  // 错失良机：白费好阵容（未到崩盘）
  if (context === 'advantaged' && result === 'loss' && score <= 77) return 'miss';

  /**
   * 错失良机（机制拖后腿）：只有「面板真的还行」的人配这条。
   * 真实 K/D < 1 或伤害占比垫底的低效输局，直接落到 ? / ??，不能拿 × 洗白。
   */
  const panelOk = (kdRatio ?? 0) >= PANEL_OK_KD && (damageShare ?? 0) >= PANEL_OK_SHARE;
  if (objectiveWeak && result === 'loss' && score < 78 && panelOk) return 'miss';

  // 好棋：关键制胜发挥
  if (isStarPlayer && score >= 78) return 'great';
  if (context !== 'advantaged' && score >= 80) return 'great';
  // 机制最高 + 赢：加底分保护，且不能是「躺赢」（K/D 太低要靠分数本身兜住）
  if (
    objectiveLeader &&
    result === 'win' &&
    score >= 65 &&
    ((kdRatio ?? 0) >= PANEL_OK_KD || score >= 78)
  ) {
    return 'great';
  }

  // 谱着：顺风局按剧本稳稳赢下（没有惊艳 carry，也没有明显失误）
  if (
    context === 'advantaged' &&
    result === 'win' &&
    score >= 55 &&
    score < 78 &&
    !isStarPlayer &&
    !objectiveLeader
  ) {
    return 'book';
  }

  if (score >= 78) return 'best';
  if (score >= 58) return 'good';
  if (score >= 44) return 'inaccuracy';
  return 'mistake';
}

/** 评语 key：情境专属档位单独分叉，其余按档位取 */
function commentKeyOf(grade: ReviewGrade, context: BpContext, objectiveWeak: boolean): string {
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
  if (grade === 'miss') {
    return objectiveWeak ? 'review.comment.missObjective' : 'review.comment.miss';
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
 * 其余（BP 难度、场均归一化、占比、画像权重、评级映射）完全一致。
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
  formatBig: (value: number) => string,
): PlayerReview[] {
  const totalKills = stats.reduce((sum, s) => sum + (s.kills ?? 0), 0);
  const totalDamage = stats.reduce((sum, s) => sum + (s.damage ?? 0), 0);
  const totalObjective = stats.reduce((sum, s) => sum + (s.objectiveValue ?? 0), 0);
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
      archetype: Number.isFinite(id) ? archetypeOf(idx, id) : 'damage_controller',
      brawlerClass: Number.isFinite(id) ? getClass(idx, id) : 'DAMAGE',
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
      objectiveShare:
        stat.objectiveValue !== null && totalObjective > 0
          ? stat.objectiveValue / totalObjective
          : null,
      result: sideResult,
      score: sideScore,
      mode: record.mode,
      mapWinRate: mapStat ? baseRateOf(mapStat) : null,
      matchupDelta: counter.trustedCount > 0 ? counter.avgDelta : null,
      formatBig,
    });
  });
}

/** 团队均分：只统计有评级的人；全员未录入返回 null */
function averageOf(reviews: PlayerReview[]): number | null {
  const rated = reviews.filter((p) => p.score !== null);
  if (rated.length === 0) return null;
  return Math.round(rated.reduce((sum, p) => sum + (p.score ?? 0), 0) / rated.length);
}

export interface ReviewOptions {
  /** 评语里的大数值格式化（中文「万」/ 英文「k」），由界面注入 */
  formatBig?: (value: number) => string;
}

/**
 * 复盘一局（我方 + 敌方 6 人）。
 *
 * 只有完赛对局参与评级；待补录直接返回 `eligible: false`（界面对它只开编辑抽屉）。
 * 队内占比要求「本方 3 人击杀与伤害都录入且总量 > 0」，两边各自独立判断。
 *
 * 敌方视角完全镜像：我方 win → 敌方 loss，2:0 → 0:2，对位对象换成我方 3 人。
 * 旧记录没有敌方战绩时，敌方 3 人按「未录入」处理，不影响我方评级。
 */
export function reviewMatch(
  idx: MetaIndex,
  record: MatchRecord,
  options: ReviewOptions = {},
): MatchReview {
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
  const formatBig = options.formatBig ?? ((v: number) => String(Math.round(v)));
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
    formatBig,
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
    formatBig,
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
    tags: tagsOf(allyReviews, result, netBpEdgeOf(allyReviews, enemyReviews)),
  };
}

/** 一方平均 BP 优势（百分点）；空数组按 0 处理 */
function avgEdgeOf(reviews: PlayerReview[]): number {
  if (reviews.length === 0) return 0;
  return reviews.reduce((sum, p) => sum + p.edgePp, 0) / reviews.length;
}

/**
 * 整局净 BP 优势 = 我方平均 edge − 敌方平均 edge。
 *
 * 用它判顺逆风，而不是看「某个人是否优势对位」：双方各有一个优势对位时，
 * 这局其实是均势 BP，不该被记成「顺风翻车」。
 */
export function netBpEdgeOf(allyReviews: PlayerReview[], enemyReviews: PlayerReview[]): number {
  return avgEdgeOf(allyReviews) - avgEdgeOf(enemyReviews);
}

/** 整局摘要标签：按「逆风翻盘 / 顺风翻车 / 一己之力 / 全员在线 / 状态低迷 / 数据不全」排优先级 */
export function tagsOf(
  players: PlayerReview[],
  result: 'win' | 'loss',
  netEdgePp = 0,
): ReviewTag[] {
  const tags: ReviewTag[] = [];
  const rated = players.filter((p) => p.grade !== null);
  const grades = rated.map((p) => p.grade as ReviewGrade);
  const solid: ReviewGrade[] = ['brilliant', 'great', 'best', 'good', 'book'];
  const weak: ReviewGrade[] = ['inaccuracy', 'mistake', 'miss', 'blunder'];

  // 只有整局真的逆风（净差 ≤ -3pp）才算翻盘；单个人逆风不作数
  if (
    result === 'win' &&
    netEdgePp <= -NET_BP_THRESHOLD_PP &&
    players.some(
      (p) => p.bpContext === 'disadvantaged' && (p.grade === 'brilliant' || p.grade === 'great'),
    )
  ) {
    tags.push('comeback');
  }
  // 只有整局真的顺风（净差 ≥ 3pp）才算翻车；双方各有优势对位时是均势，不记
  if (
    result === 'loss' &&
    netEdgePp >= NET_BP_THRESHOLD_PP &&
    players.some(
      (p) => p.bpContext === 'advantaged' && (p.grade === 'miss' || p.grade === 'blunder'),
    )
  ) {
    tags.push('throw');
  }
  if (grades.includes('brilliant') || players.some((p) => p.isStarPlayer && p.grade === 'great')) {
    tags.push('carry');
  }
  if (
    players.length === TEAM_SLOTS &&
    grades.length === TEAM_SLOTS &&
    grades.every((g) => solid.includes(g))
  ) {
    tags.push('allOnline');
  }
  if (result === 'loss' && rated.length > 0 && grades.every((g) => weak.includes(g))) {
    tags.push('shaky');
  }
  if (players.some((p) => !p.hasData)) tags.push('incomplete');

  return tags;
}
