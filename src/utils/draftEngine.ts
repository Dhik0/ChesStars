import type { MetaIndex } from '../data/metaIndex';
import { getClass, getMapMatchup, getMatchup, getMapStat } from '../data/metaIndex';
import { brawlerCN, normalizeName } from '../data/localization';
import { CLASS_LABEL, CLASS_ORDER, type BrawlerClass } from '../data/brawlerProfile';
import type { MapBrawlerStat, MatchupEdge, PickOrder } from '../types/meta';

/**
 * BP 算分引擎 —— 全部纯函数，无 IO、无随机、无副作用，本地毫秒级完成。
 *
 * 每个结果都带 ScoreBreakdown（加减分明细 + 可读理由），拒绝黑盒推荐。
 */

/* ------------------------------------------------------------------ *
 * 基础类型
 * ------------------------------------------------------------------ */

export type Side = 'ally' | 'enemy';

/** Ban 槽位总数（双方各 3 个，盲 Ban 同时进行） */
export const BAN_SLOTS = 6;
/** 单边 Ban 位数：前 3 槽属蓝队（己方），后 3 槽属红队（敌方） */
export const BAN_SLOTS_PER_TEAM = 3;
/** 每队选人位数 */
export const TEAM_SLOTS = 3;

/**
 * 「空 Ban」哨兵：占满当前 Ban 槽但不锁定任何英雄，也不参与推荐计算。
 * 用负数是因为真实英雄 id 都是 8 位正整数，绝不会撞上。
 */
export const EMPTY_BAN = -1;

/** Ban 槽的取值：null = 尚未填写；EMPTY_BAN = 空 Ban；其余 = 真实英雄 id */
export type BanValue = number | null;

/** 该英雄是否为空 Ban 占位 */
export const isEmptyBan = (id: number | null | undefined): boolean => id === EMPTY_BAN;

export interface ActiveSlot {
  kind: 'ban' | 'ally' | 'enemy';
  /** ban: 0-5；ally/enemy: 0-2 */
  index: number;
}

export interface DraftState {
  mapName: string;
  mode: string;
  ally: number[];
  enemy: number[];
  /**
   * Ban 位：**固定 6 格**，位置即归属（0-2 蓝队 / 3-5 红队），
   * `null` 表示该槽还没填。用定长数组而不是「填一个 push 一个」，
   * 是为了清空中间某格时后面的槽不会整体前移、把红队的 Ban 挤进蓝队。
   */
  bans: BanValue[];
  /**
   * 先手方（谁先选第一个英雄）。
   * `null` = 还没选先手方：进图后的前置态，禁止任何 Ban/Pick 录入，
   * 底部换成「蓝先 / 红先」两个大按钮。
   */
  firstPick: Side | null;
  active: ActiveSlot;
}

export type TagTone = 'good' | 'bad' | 'neutral';

export interface Tag {
  text: string;
  tone: TagTone;
}

export interface Reason {
  tone: TagTone;
  text: string;
  /** 该项对总分的实际加减分（用于明细面板） */
  delta?: number;
}

export interface ScoreBreakdown {
  /** 地图强度分 0-100 */
  base: number;
  baseWeight: number;
  baseContribution: number;
  /** 对位克制分 0-100（无对手数据时 50 = 中性） */
  counter: number;
  counterWeight: number;
  counterContribution: number;
  /** 本图胜率分 0-100（仅 Pick 阶段使用） */
  wr?: number;
  wrWeight?: number;
  wrContribution?: number;
  /** 阵容结构分 0-100 */
  comp: number;
  compWeight: number;
  compContribution: number;
  /** 顺位加减分 */
  orderAdj: number;
  /** 最终分 0-100 */
  total: number;
  reasons: Reason[];
}

export interface Candidate {
  id: number;
  name: string;
  cn: string;
  /** 排序用总分 0-100（动态推荐分，含克制/顺位/阵容修正） */
  score: number;
  /** 本图静态基础分 0-100（该图归一化强度分，与底部槽位同口径） */
  mapScore: number;
  /** 该图平滑胜率 */
  baseWR: number;
  useRate: number;
  pickOrder: PickOrder;
  /** 职业（一级，单选） */
  cls: BrawlerClass;
  tags: Tag[];
  /** 对位明细（详情面板展示用） */
  counterDetails: CounterDetail[];
  breakdown: ScoreBreakdown;
  phase: 'ban' | 'pick' | 'enemyPick';
  /** 顺位定位：先手位 / 中位 / 后手位 */
  position: 'FIRST' | 'MIDDLE' | 'LAST';
  /** 该图是否有真实统计样本；false 时分数按中性占位计算 */
  hasData: boolean;
}

/**
 * 该图没有此英雄数据时的中性占位。
 * 新英雄或冷门图会命中——仍然要能被选中录入，所以给中性值而不是剔除。
 */
const NEUTRAL_STAT: Omit<MapBrawlerStat, 'id' | 'name'> = {
  games: 0,
  wins: 0,
  win_rate: 0.5,
  smoothed_wr: 0.5,
  use_rate: 0,
  score: 50,
  pick_order: 'MIDDLE',
  matchups: [],
};

/** 取地图统计；该图没有该英雄时返回中性占位并标记 hasData=false */
function statFor(
  idx: MetaIndex,
  mapName: string,
  id: number,
  name: string,
): { stat: MapBrawlerStat; hasData: boolean } {
  const found = getMapStat(idx, mapName, id);
  if (found) return { stat: found, hasData: true };
  return { stat: { id, name, ...NEUTRAL_STAT }, hasData: false };
}

export interface CompWarning {
  key: 'noFrontline' | 'shortRange' | 'needAssassin' | 'noDamage' | 'tooManyMelee';
  text: string;
  tone: 'warn' | 'tip';
}

/* ------------------------------------------------------------------ *
 * 常量
 * ------------------------------------------------------------------ */

/**
 * Ban 与 Pick 是两套独立权重。
 *
 * Ban 的目的：拦住对面「会选」的英雄 → 出场率主导（热门 = 大概率被抢）
 * Pick 的目的：选出「能赢」的英雄 → 对位克制 + 本图胜率主导
 */
const W_BAN_USE = 0.5; // Ban：出场率
const W_BAN_SCORE = 0.35; // Ban：地图强度
const W_BAN_FIRST = 0.15; // Ban：先手优先级

const W_PICK_COUNTER = 0.4; // Pick：对位克制
const W_PICK_WR = 0.25; // Pick：本图胜率
const W_PICK_SCORE = 0.25; // Pick：地图强度
const W_PICK_COMP = 0.1; // Pick：阵容结构

/** 敌方槽位录入：只求快速定位，强度 70% + 出场率 30% */
const W_ENEMY_SCORE = 0.7;
const W_ENEMY_USE = 0.3;

/**
 * 克制分刻度：对位 delta 达到 ±15 个百分点即视为满格。
 *
 * v3 后端给的是 Log5 残差（百分点），实测地图层 |delta| 中位数约 8.4pp、
 * p75 约 10.7pp，所以 15pp 满格能让绝大多数真实对位落在 50±30 的区间内，
 * 极端对位（|delta| > 15）才顶到 0/100。
 */
const COUNTER_FULL_SCALE = 15;

/**
 * 胜率置信度参数。
 * 样本低于 MIN 时完全按中性 50% 计（这类英雄的胜率基本是噪音）；
 * 达到 FULL 才完全采信，中间线性收缩。
 *
 * 当前数据是纯 Legendary+ 抓取（约 4.7 万场，单图 1,800~2,000 局），
 * 单图单英雄的样本中位数只有 30 场上下、p90≈370。门槛按这个厚度校准：
 * 15 场以下纯噪音，80 场以上才完全采信，中间按比例折算。
 */
const WR_MIN_SAMPLE = 15;
const WR_FULL_SAMPLE = 80;

/** 中后手对位权重放大：越靠后越依赖克制（先手 1.0 / 中位 1.2 / 后手 1.55） */
const COUNTER_POSITION_MULT: Record<'FIRST' | 'MIDDLE' | 'LAST', number> = {
  FIRST: 1,
  MIDDLE: 1.2,
  LAST: 1.55,
};

/**
 * 同时克制多名已亮牌英雄的协同加成。
 * 只对「双绿/三绿」生效——单绿属于正常对位，不需要额外放大。
 */
const COUNTER_SYNERGY: Record<number, number> = { 2: 1.15, 3: 1.35 };

/** 克制/被克制的标签阈值（百分点） */
export const TAG_THRESHOLD = 4;

/**
 * 底部状态灯的「优势/劣势」分界（百分点）。
 * delta >= +3 → 绿灯；delta <= -3 → 红灯；其余 → 黄灯。
 * 样本不足或没有这条对位 → 灰灯（不猜）。
 */
export const COUNTER_LIGHT_PP = 3;

/** 顺位序列（3v3 蛇形）：先手 A1 → B1 → B2 → A2 → A3 → B3 */
const PICK_SEQUENCE: Side[] = ['ally', 'enemy', 'enemy', 'ally', 'ally', 'enemy'];

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

const pct = (v: number): string => `${Math.round(v * 100)}%`;

/* ------------------------------------------------------------------ *
 * 状态推导
 * ------------------------------------------------------------------ */

/** 已选总人数（双方合计） */
export function totalPicked(state: DraftState): number {
  return state.ally.length + state.enemy.length;
}

/** 当前是第几手（1-6） */
export function pickNumber(state: DraftState): number {
  return Math.min(6, totalPicked(state) + 1);
}

/** 当前处于先手位（1-2选）/ 中位（3-4选）/ 后手位（5-6选） */
export function currentPosition(state: DraftState): 'FIRST' | 'MIDDLE' | 'LAST' {
  const n = pickNumber(state);
  if (n <= 2) return 'FIRST';
  if (n >= 5) return 'LAST';
  return 'MIDDLE';
}

/**
 * 该顺位序列上，第 n 手是哪一方（按 firstPick 换算）。
 *
 * firstPick 为 null（未选先手）时按「蓝方先」返回编号占位——此时底部面板整体
 * 被「蓝先 / 红先」按钮替换，编号不会渲染，纯粹是给内部调用一个确定值。
 */
export function sideOfPick(state: DraftState, n: number): Side {
  const base = PICK_SEQUENCE[clamp(n, 1, 6) - 1] ?? 'ally';
  if (state.firstPick !== 'enemy') return base;
  return base === 'ally' ? 'enemy' : 'ally';
}

/** 是否已占用（被 Ban 或已 Pick）——Pick 池的判定口径，双方 Ban 一并剔除 */
export function isTaken(state: DraftState, id: number): boolean {
  return isBanned(state, id) || isPicked(state, id);
}

/** 已选（不含 ban） */
export function isPicked(state: DraftState, id: number): boolean {
  return state.ally.includes(id) || state.enemy.includes(id);
}

/* ---------------- Ban 槽位 ---------------- */

/** 归一化 Ban 数组：恒定 6 格，缺失位补 null */
function normalizeBans(bans: readonly BanValue[]): BanValue[] {
  return Array.from({ length: BAN_SLOTS }, (_, i) => bans[i] ?? null);
}

/** Ban 槽 index 归属哪一方（0-2 蓝 / 3-5 红） */
export function banSideOfIndex(index: number): Side {
  return index < BAN_SLOTS_PER_TEAM ? 'ally' : 'enemy';
}

/** 已填的 Ban 槽数量（含「空 Ban」占位）——阶段流转按这个判定 */
export function banCount(state: DraftState): number {
  return state.bans.filter((v) => v !== null && v !== undefined).length;
}

/** 第一个还没填的 Ban 槽 index；全满返回 null */
export function firstEmptyBanSlot(state: DraftState): number | null {
  for (let i = 0; i < BAN_SLOTS; i += 1) {
    if ((state.bans[i] ?? null) === null) return i;
  }
  return null;
}

/** 双方所有非空 Ban 的英雄 id（去重；「空 Ban」不贡献任何 id） */
export function bannedIds(state: DraftState): number[] {
  const out: number[] = [];
  for (const v of state.bans) {
    if (typeof v === 'number' && v !== EMPTY_BAN && !out.includes(v)) out.push(v);
  }
  return out;
}

/** 该英雄是否已被任意一方 Ban */
export function isBanned(state: DraftState, id: number): boolean {
  if (id === EMPTY_BAN) return false;
  return state.bans.some((v) => v === id);
}

/** 该英雄是否已被指定阵营 Ban 过（同队互斥用） */
export function isBannedBySide(state: DraftState, side: Side, id: number): boolean {
  if (id === EMPTY_BAN) return false;
  return state.bans.some((v, i) => v === id && banSideOfIndex(i) === side);
}

/** 我方视角的对手列表：录入我方时对手是敌方；录入敌方时对手是我方 */
function opponentsFor(state: DraftState, perspective: 'ally' | 'enemy'): number[] {
  return perspective === 'ally' ? state.enemy : state.ally;
}

/* ------------------------------------------------------------------ *
 * Ban 推荐
 * ------------------------------------------------------------------ */

export interface BanCandidate extends Candidate {
  banScore: number;
}

/** 归一化 use_rate 到 0-100（以该图最高出场率为 100） */
function maxUseRate(idx: MetaIndex, mapName: string): number {
  const statMap = idx.mapStatTable.get(mapName);
  if (!statMap) return 1;
  let max = 0;
  for (const s of statMap.values()) if (s.use_rate > max) max = s.use_rate;
  return max > 0 ? max : 1;
}

/**
 * Ban 分：出场率 50% + 地图强度 35% + 先手优先级 15%
 * 出场率权重最高——热门英雄被对面抢走的概率最大，Ban 掉收益最直接。
 */
export function banScoreOf(idx: MetaIndex, mapName: string, stat: MapBrawlerStat): number {
  const maxUse = maxUseRate(idx, mapName);
  const useNorm = (stat.use_rate / maxUse) * 100;
  const firstBonus = stat.pick_order === 'FIRST' ? 100 : 0;
  return clamp(
    useNorm * W_BAN_USE + stat.score * W_BAN_SCORE + firstBonus * W_BAN_FIRST,
    0,
    100,
  );
}

function banReasons(
  idx: MetaIndex,
  mapName: string,
  stat: MapBrawlerStat,
  banScore: number,
): Reason[] {
  const reasons: Reason[] = [];
  const maxUse = maxUseRate(idx, mapName);
  const useNorm = (stat.use_rate / maxUse) * 100;

  if (stat.score >= 92) reasons.push({ tone: 'bad', text: `该图强度榜顶端（${stat.score.toFixed(0)} 分）` });
  else if (stat.score >= 75) reasons.push({ tone: 'neutral', text: `地图强度较高（${stat.score.toFixed(0)} 分）` });

  if (useNorm >= 80) reasons.push({ tone: 'bad', text: `出场率极高（该图第 1 档）` });
  else if (useNorm >= 55) reasons.push({ tone: 'neutral', text: `出场率偏高（${useNorm.toFixed(0)} 分位）` });

  if (stat.pick_order === 'FIRST') {
    reasons.push({ tone: 'bad', text: '适合先手拿，放出来容易被对面抢走' });
  }
  if (stat.smoothed_wr >= 0.55) {
    reasons.push({ tone: 'neutral', text: `平滑胜率 ${pct(stat.smoothed_wr)}，样本 ${stat.games} 场` });
  }
  if (banScore >= 80) reasons.push({ tone: 'bad', text: '综合威胁度极高，优先 Ban' });
  return reasons;
}

export function banRecommendations(
  idx: MetaIndex,
  state: DraftState,
  limit = 60,
): BanCandidate[] {
  const map = idx.mapByName.get(state.mapName);
  if (!map) return [];

  /**
   * Ban 池的剔除口径与 Pick 池不同：
   * - 已被任何一方 **Pick** 的英雄不能再 Ban；
   * - 同队已 Ban 的英雄剔除（队内 3 位互斥）；
   * - 对方已 Ban 的英雄**保留**——排位盲 Ban 里双方同时 Ban 同一英雄是常态，
   *   保留下来才能让红队 Ban 掉蓝队刚 Ban 的人。
   * 非 Ban 阶段（active 指向 Pick）则退回全量剔除。
   */
  const banSide = state.active.kind === 'ban' ? banSideOfIndex(state.active.index) : null;

  const result: BanCandidate[] = [];
  const maxUse = maxUseRate(idx, state.mapName);
  // 遍历全量英雄：该图没数据的也要能选（实战中会有人选冷门/新英雄）
  for (const ref of idx.meta.brawlers) {
    if (isPicked(state, ref.id)) continue;
    if (banSide ? isBannedBySide(state, banSide, ref.id) : isBanned(state, ref.id)) continue;
    const { stat, hasData } = statFor(idx, state.mapName, ref.id, ref.name);
    const banScore = banScoreOf(idx, state.mapName, stat);
    const reasons = banReasons(idx, state.mapName, stat, banScore);

    // Ban 的三项权重：强度 60% / 出场率 25% / 先手优先级 15%
    const useNorm = clamp((stat.use_rate / maxUse) * 100, 0, 100);
    const firstBonus = stat.pick_order === 'FIRST' ? 100 : 0;

    result.push({
      id: stat.id,
      name: stat.name,
      cn: brawlerCN(stat.name),
      score: banScore,
      banScore,
      mapScore: stat.score,
      baseWR: stat.smoothed_wr,
      useRate: stat.use_rate,
      pickOrder: stat.pick_order,
      cls: getClass(idx, stat.id),
      tags: [],
      counterDetails: [],
      phase: 'ban',
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
        reasons: hasData ? reasons : [{ tone: 'neutral', text: '该图暂无对局样本，分数按中性 50 计' }],
      },
    });
  }

  // 有数据的排前面；同组内按分数降序
  result.sort((a, b) => {
    if (a.hasData !== b.hasData) return a.hasData ? -1 : 1;
    return b.banScore - a.banScore;
  });
  return result.slice(0, limit);
}

/* ------------------------------------------------------------------ *
 * 阵容结构分析
 * ------------------------------------------------------------------ */

interface CompProfile {
  tanks: number;
  damage: number;
  melee: number;
  assassins: number;
  throwers: number;
  controls: number;
  supports: number;
}

/**
 * 统计一套阵容的结构特征（只看职业）。
 * damage 计入「火力手 + 狙击手」——两者都是需要前排保护的远程脆皮输出。
 */
function compProfileOf(idx: MetaIndex, ids: number[]): CompProfile {
  const p: CompProfile = {
    tanks: 0,
    damage: 0,
    melee: 0,
    assassins: 0,
    throwers: 0,
    controls: 0,
    supports: 0,
  };
  for (const id of ids) {
    const cls = getClass(idx, id);
    if (cls === 'TANK') p.tanks += 1;
    if (cls === 'DAMAGE' || cls === 'MARKSMAN') p.damage += 1;
    if (cls === 'TANK' || cls === 'ASSASSIN') p.melee += 1;
    if (cls === 'ASSASSIN') p.assassins += 1;
    if (cls === 'ARTILLERY') p.throwers += 1;
    if (cls === 'CONTROL') p.controls += 1;
    if (cls === 'SUPPORT') p.supports += 1;
  }
  return p;
}

/** 阵容缺陷预警（我方视角） */
export function detectCompWarnings(idx: MetaIndex, state: DraftState): CompWarning[] {
  const mine = compProfileOf(idx, state.ally);
  const theirs = compProfileOf(idx, state.enemy);
  const out: CompWarning[] = [];

  if (mine.damage >= 2 && mine.tanks === 0) {
    out.push({ key: 'noFrontline', text: '缺少前排承伤', tone: 'warn' });
  }
  if (mine.melee >= 2) {
    out.push({ key: 'shortRange', text: '手短易被风筝', tone: 'warn' });
  }
  if (theirs.throwers > 0 && mine.assassins === 0) {
    out.push({ key: 'needAssassin', text: '建议补刺客切后排', tone: 'tip' });
  }
  if (state.ally.length >= 2 && mine.damage === 0 && mine.tanks >= 2) {
    out.push({ key: 'noDamage', text: '缺乏远程输出', tone: 'tip' });
  }
  return out;
}

/**
 * 阵容结构分（针对某个候选英雄）：基准 50，命中补位需求加分，重复冗余扣分。
 */
function compScoreFor(
  idx: MetaIndex,
  state: DraftState,
  candId: number,
): { score: number; reasons: Reason[] } {
  const mine = compProfileOf(idx, state.ally);
  const theirs = compProfileOf(idx, state.enemy);
  const cls = getClass(idx, candId);
  const reasons: Reason[] = [];
  let score = 50;

  const isTank = cls === 'TANK';
  const isDamage = cls === 'DAMAGE' || cls === 'MARKSMAN';
  const isControl = cls === 'CONTROL';
  const isAssassin = cls === 'ASSASSIN';
  const isSupport = cls === 'SUPPORT';

  // 1) 双脆皮无前排 → 补坦克/半肉
  if (mine.damage >= 2 && mine.tanks === 0 && isTank) {
    score += 30;
    reasons.push({ tone: 'good', text: '补前排：我方已有 2 名脆皮且无坦克', delta: 30 });
  }

  // 2) 双近战短手 → 补中远程控场/输出
  if (mine.melee >= 2 && (isControl || isDamage)) {
    score += 22;
    reasons.push({ tone: 'good', text: '补射程：我方近战过多，需要远程压制', delta: 22 });
  }

  // 3) 敌方有投手且我方无刺客 → 补刺客切后排
  if (theirs.throwers > 0 && mine.assassins === 0 && isAssassin) {
    score += 25;
    reasons.push({ tone: 'good', text: '针对投掷：补刺客切后排', delta: 25 });
  }

  // 4) 阵容同质化冗余
  const sameRoleCount =
    (isTank ? mine.tanks : 0) +
    (isDamage ? mine.damage : 0) +
    (isAssassin ? mine.assassins : 0) +
    (isControl ? mine.controls : 0) +
    (isSupport ? mine.supports : 0);
  if (state.ally.length >= 2 && sameRoleCount >= 3) {
    score -= 14;
    reasons.push({ tone: 'bad', text: '定位过于重复，阵容结构失衡', delta: -14 });
  }

  // 5) 缺输出时的补位
  if (state.ally.length >= 2 && mine.damage === 0 && isDamage) {
    score += 16;
    reasons.push({ tone: 'good', text: '补输出：我方还没有远程输出位', delta: 16 });
  }

  return { score: clamp(score, 0, 100), reasons };
}

/* ------------------------------------------------------------------ *
 * Pick 推荐
 * ------------------------------------------------------------------ */

/** 一条对位明细（算分、状态灯、弹窗共用） */
export interface CounterDetail {
  opponentId: number;
  opponentName: string;
  /** 按样本收缩后的 delta（百分点），参与算分 */
  delta: number;
  /** 后端原始 delta（百分点），用于展示与状态灯，不做收缩 */
  rawDelta: number;
  /** 该对位的交手场次 */
  samples: number;
  /** 数据来源：该图专属 / 模式兜底 / 没有这条对位 */
  source: 'map' | 'mode' | 'none';
  /** 样本是否足够采信 */
  hasSample: boolean;
}

/** 对位边的采信权重：低于 minSamples 不可用，达到 trustSamples 完全采信 */
function trustOf(edge: MatchupEdge, minSamples: number, trustSamples: number): number | null {
  if (edge.samples < minSamples) return null;
  if (trustSamples <= 0) return 1;
  return Math.min(1, edge.samples / trustSamples);
}

/**
 * 取一条对位边，**正反都试**。
 *
 * v3 后端对同一对英雄只落一条边（实测约 35% 的对位没有反向记录），
 * 所以查不到正向时必须回退到反向并取负——否则一半克制关系会被当成「无样本」。
 */
function lookupEdge(
  get: (selfId: number, oppId: number) => MatchupEdge | undefined,
  selfId: number,
  oppId: number,
): MatchupEdge | null {
  const forward = get(selfId, oppId);
  if (forward) return forward;
  const reverse = get(oppId, selfId);
  if (reverse) return { opponent: oppId, delta: -reverse.delta, samples: reverse.samples };
  return null;
}

/**
 * 取一条对位边：**地图层优先**（该图专属），地图层没收录时退到模式层。
 * v3 的地图层样本普遍偏少，所以采信门槛由调用方按来源分别判定。
 */
export function resolveMatchup(
  idx: MetaIndex,
  mapName: string,
  mode: string,
  selfId: number,
  oppId: number,
): { edge: MatchupEdge; source: 'map' | 'mode' } | null {
  const mapEdge = lookupEdge(
    (s, o) => getMapMatchup(idx, mapName, s, o),
    selfId,
    oppId,
  );
  if (mapEdge) return { edge: mapEdge, source: 'map' };
  const modeEdge = lookupEdge((s, o) => getMatchup(idx, mode, s, o), selfId, oppId);
  if (modeEdge) return { edge: modeEdge, source: 'mode' };
  return null;
}

/** 按来源取采信权重 */
function trustForSource(
  idx: MetaIndex,
  source: 'map' | 'mode',
  edge: MatchupEdge,
): number | null {
  const p = idx.meta.params;
  return source === 'map'
    ? trustOf(edge, p.map_matchup_min_samples, p.map_matchup_trust_samples)
    : trustOf(edge, p.matchup_min_samples, p.map_matchup_trust_samples);
}

/**
 * 计算候选英雄对一组对手的平均对位 delta（百分点，已按样本收缩）与明细。
 * 只对「样本足够」的对位求平均——不足的按缺失处理，而不是塞一个 0 进去，
 * 否则会把所有候选都拉平。
 */
export function counterDetail(
  idx: MetaIndex,
  mapName: string,
  mode: string,
  candId: number,
  opponentIds: number[],
): { avgDelta: number; trustedCount: number; details: CounterDetail[] } {
  const details: CounterDetail[] = [];
  let sum = 0;
  let trusted = 0;

  for (const oppId of opponentIds) {
    const ref = idx.brawlerById.get(oppId);
    const name = ref ? ref.name : String(oppId);
    const hit = resolveMatchup(idx, mapName, mode, candId, oppId);

    if (!hit) {
      details.push({
        opponentId: oppId,
        opponentName: name,
        delta: 0,
        rawDelta: 0,
        samples: 0,
        source: 'none',
        hasSample: false,
      });
      continue;
    }

    const trust = trustForSource(idx, hit.source, hit.edge);
    const usable = trust !== null;
    const trustedDelta = usable ? hit.edge.delta * trust : 0;
    details.push({
      opponentId: oppId,
      opponentName: name,
      delta: trustedDelta,
      rawDelta: hit.edge.delta,
      samples: hit.edge.samples,
      source: hit.source,
      hasSample: usable,
    });
    if (usable) {
      sum += trustedDelta;
      trusted += 1;
    }
  }

  return { avgDelta: trusted === 0 ? 0 : sum / trusted, trustedCount: trusted, details };
}

/** 状态灯档位：绿=优势 / 红=劣势 / 黄=五五开 / 灰=无数据 */
export type CounterLight = 'good' | 'bad' | 'even' | 'none';

/** 把一条对位明细映射成状态灯；样本不足或无对位一律灰灯 */
export function counterLight(d: CounterDetail | undefined): CounterLight {
  if (!d || !d.hasSample) return 'none';
  if (d.rawDelta >= COUNTER_LIGHT_PP) return 'good';
  if (d.rawDelta <= -COUNTER_LIGHT_PP) return 'bad';
  return 'even';
}

const signedPp = (v: number): string => `${v > 0 ? '+' : ''}${v.toFixed(1)}`;

/** 从对位明细里挑出最显著的克制/被克制关系生成短标签 */
export function buildCounterTags(details: CounterDetail[]): Tag[] {
  const scored = details
    .filter((d) => d.hasSample)
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));

  const tags: Tag[] = [];
  for (const d of scored) {
    if (tags.length >= 2) break;
    if (d.delta >= TAG_THRESHOLD) {
      tags.push({ text: `克制 ${brawlerCN(d.opponentName)} ${signedPp(d.delta)}`, tone: 'good' });
    } else if (d.delta <= -TAG_THRESHOLD) {
      tags.push({ text: `怕 ${brawlerCN(d.opponentName)} ${signedPp(d.delta)}`, tone: 'bad' });
    }
  }
  return tags;
}

/* ------------------------------------------------------------------ *
 * 详细对位（长按弹窗）
 * ------------------------------------------------------------------ */

/** 弹窗里的一行对位 */
export interface MatchupRow {
  opponentId: number;
  opponentName: string;
  opponentCn: string;
  /** 对手在该图的地图评分（0-100）；该图无数据为 null */
  opponentScore: number | null;
  /** 对手在该图的顺位；该图无数据为 null */
  opponentPickOrder: PickOrder | null;
  /** 后端原始 delta（百分点），+ 表示该英雄占优 */
  delta: number;
  samples: number;
}

export interface MatchupBreakdown {
  /** 数据来源：地图层专属 / 模式兜底 / 都没有 */
  source: 'map' | 'mode' | 'none';
  /** 劣势对位（怕谁），delta 从小到大 */
  weak: MatchupRow[];
  /** 优势对位（克谁），delta 从大到小 */
  strong: MatchupRow[];
}

/**
 * 汇总某英雄的全部对位：自己名下存的边 + 别人指向他的边（取负）。
 *
 * 后端对同一对英雄只落一条边，所以只看 `self.matchups` 会漏掉近三分之一对手。
 */
function collectEdges(
  brawlers: { id: number; matchups: MatchupEdge[] }[],
  selfId: number,
): MatchupEdge[] {
  const out: MatchupEdge[] = [];
  const seen = new Set<number>();

  const self = brawlers.find((b) => b.id === selfId);
  if (self) {
    for (const e of self.matchups) {
      out.push(e);
      seen.add(e.opponent);
    }
  }

  for (const b of brawlers) {
    if (b.id === selfId || seen.has(b.id)) continue;
    const reverse = b.matchups.find((e) => e.opponent === selfId);
    if (!reverse) continue;
    out.push({ opponent: b.id, delta: -reverse.delta, samples: reverse.samples });
    seen.add(b.id);
  }

  return out;
}

/**
 * 某英雄在当前地图的完整对位表，按 |delta| 从高到低拆成「劣势 / 优势」两组。
 *
 * 这里用**后端原始 delta**（不做样本收缩）——弹窗的职责是把数据摊开给人看，
 * 每一行都带样本数，可信度由使用者自己判断。样本量低于 `minSamples` 的边
 * 仍然保留（否则冷门英雄会一片空白），但会在 UI 上标注。
 */
export function brawlerMatchups(
  idx: MetaIndex,
  mapName: string,
  mode: string,
  brawlerId: number,
  minSamples = 1,
): MatchupBreakdown {
  const mapEntry = idx.mapByName.get(mapName);
  const mapBrawlers = mapEntry?.brawlers ?? [];
  const modeBrawlers = idx.modeByName.get(mode)?.brawlers ?? [];

  // 该图有对位就用地图层，否则退到模式层
  let edges: MatchupEdge[] = [];
  let source: MatchupBreakdown['source'] = 'none';
  if (mapBrawlers.some((b) => b.id === brawlerId)) {
    const mapEdges = collectEdges(mapBrawlers, brawlerId);
    if (mapEdges.length > 0) {
      edges = mapEdges;
      source = 'map';
    }
  }
  if (source === 'none') {
    const modeEdges = collectEdges(modeBrawlers, brawlerId);
    if (modeEdges.length > 0) {
      edges = modeEdges;
      source = 'mode';
    }
  }

  // 地图层的 score / pick_order 用于展示对手强度；地图没这个英雄时留空
  const mapStats = mapEntry ? idx.mapStatTable.get(mapEntry.map_name) : undefined;

  const rows: MatchupRow[] = [];
  for (const edge of edges) {
    if (edge.samples < minSamples) continue;
    const ref = idx.brawlerById.get(edge.opponent);
    const name = ref ? ref.name : String(edge.opponent);
    const oppStat = mapStats?.get(edge.opponent);
    rows.push({
      opponentId: edge.opponent,
      opponentName: name,
      opponentCn: brawlerCN(name),
      opponentScore: oppStat ? oppStat.score : null,
      opponentPickOrder: oppStat ? oppStat.pick_order : null,
      delta: edge.delta,
      samples: edge.samples,
    });
  }

  const weak = rows
    .filter((r) => r.delta < 0)
    .sort((a, b) => a.delta - b.delta);
  const strong = rows
    .filter((r) => r.delta > 0)
    .sort((a, b) => b.delta - a.delta);

  return { source, weak, strong };
}

/** 顺位加权：先手位吃 FIRST，后手位吃 LAST */
function orderAdjust(
  position: 'FIRST' | 'MIDDLE' | 'LAST',
  pickOrder: PickOrder,
): { adj: number; reasons: Reason[] } {
  const reasons: Reason[] = [];
  let adj = 0;

  if (position === 'FIRST') {
    if (pickOrder === 'FIRST') {
      adj += 7;
      reasons.push({ tone: 'good', text: '先手位拿万金油，容错高', delta: 7 });
    } else if (pickOrder === 'LAST') {
      adj -= 5;
      reasons.push({ tone: 'bad', text: '先手位拿后手英雄，容易被针对', delta: -5 });
    }
  } else if (position === 'LAST') {
    if (pickOrder === 'LAST') {
      adj += 6;
      reasons.push({ tone: 'good', text: '后手位拿后手英雄，顺位加成吃满', delta: 6 });
    } else if (pickOrder === 'FIRST') {
      adj -= 2;
      reasons.push({ tone: 'neutral', text: '后手位选先手英雄，顺位价值被浪费', delta: -2 });
    }
  }

  return { adj, reasons };
}

/**
 * 单个英雄的 Pick 动态分（我方视角）。
 * 权重：对位克制 40%（按敌方亮牌数缩放，后手位放大）/ 本图胜率 25% / 地图强度 25% / 阵容 10%
 *
 * 与 Ban 分刻意分开：Ban 看「谁会被选」（出场率主导），Pick 看「谁真的能赢」（克制 + 胜率）。
 */
export function evaluatePick(
  idx: MetaIndex,
  state: DraftState,
  stat: MapBrawlerStat,
  position: 'FIRST' | 'MIDDLE' | 'LAST',
  perspective: 'ally' | 'enemy',
  hasData = true,
): Candidate {
  const oppIds = opponentsFor(state, perspective);
  const { avgDelta, trustedCount, details } = counterDetail(
    idx,
    state.mapName,
    state.mode,
    stat.id,
    oppIds,
  );

  // 克制分：后端 Log5 残差（百分点）直接映射到 0-100，±15pp 满格
  const counterScore = clamp(50 + 50 * clamp(avgDelta / COUNTER_FULL_SCALE, -1, 1), 0, 100);

  // 本图胜率分：50% 为中性，±10% 胜率差映射到 0/100
  // 样本不足时直接降低该项权重（而非塞一个 50 分进去）——
  // 否则不可信的项会以中性值占住权重，把所有英雄都拉平到 50 附近。
  const confidence =
    stat.games < WR_MIN_SAMPLE ? 0 : Math.min(1, stat.games / WR_FULL_SAMPLE);
  const wrScore = clamp(50 + (stat.smoothed_wr - 0.5) * 500, 0, 100);
  const wrWeight = W_PICK_WR * confidence;

  // 克制权重随敌方亮牌数平滑生效；中后手放大，双绿/三绿再叠协同加成
  const revealRatio = Math.min(1, oppIds.length / 3);
  const greens = details.filter((d) => d.hasSample && d.delta >= TAG_THRESHOLD).length;
  const synergy = COUNTER_SYNERGY[greens] ?? 1;
  const positionMult = COUNTER_POSITION_MULT[position];
  const counterWeight = W_PICK_COUNTER * revealRatio * positionMult * synergy;

  const comp = compScoreFor(idx, state, stat.id);
  const order = orderAdjust(position, stat.pick_order);

  const totalWeight = W_PICK_SCORE + counterWeight + wrWeight + W_PICK_COMP;
  const weighted =
    (stat.score * W_PICK_SCORE +
      counterScore * counterWeight +
      wrScore * wrWeight +
      comp.score * W_PICK_COMP) /
    totalWeight;
  const total = clamp(weighted + order.adj, 0, 100);

  const reasons: Reason[] = hasData
    ? [{ tone: 'neutral', text: `地图强度 ${stat.score.toFixed(0)} 分（该图归一化）` }]
    : [{ tone: 'neutral', text: '该图暂无对局样本，地图强度按中性 50 计' }];

  if (oppIds.length === 0) {
    reasons.push({ tone: 'neutral', text: '敌方尚未亮牌，对位修正暂不生效' });
  } else if (trustedCount === 0) {
    reasons.push({ tone: 'neutral', text: '对位样本不足，克制项按中性处理' });
  } else {
    const tone: TagTone =
      avgDelta >= TAG_THRESHOLD ? 'good' : avgDelta <= -TAG_THRESHOLD ? 'bad' : 'neutral';
    reasons.push({
      tone,
      text: `对位均值 ${signedPp(avgDelta)}pp（对阵 ${trustedCount}/${oppIds.length} 名已亮牌英雄）`,
      delta: (counterScore - 50) * (counterWeight / totalWeight),
    });
  }

  if (trustedCount > 0 && trustedCount < oppIds.length) {
    reasons.push({ tone: 'neutral', text: '部分对位样本不足，未计入克制均值' });
  }

  if (greens >= 2) {
    reasons.push({
      tone: 'good',
      text: `同时克制 ${greens} 名对手，${position === 'FIRST' ? '对位' : '后手'}权重上调 ×${(positionMult * synergy).toFixed(2)}`,
    });
  }

  if (confidence === 0) {
    reasons.push({
      tone: 'neutral',
      text: `本图样本仅 ${stat.games} 场，胜率不参与计算`,
    });
  } else if (confidence < 1) {
    reasons.push({
      tone: 'neutral',
      text: `本图样本 ${stat.games} 场偏少，胜率按 ${Math.round(confidence * 100)}% 折算`,
    });
  }

  reasons.push(...comp.reasons);
  reasons.push(...order.reasons);

  const tags = perspective === 'ally' ? buildCounterTags(details) : enemyThreatTags(details);

  return {
    id: stat.id,
    name: stat.name,
    cn: brawlerCN(stat.name),
    score: total,
    mapScore: stat.score,
    baseWR: stat.smoothed_wr,
    useRate: stat.use_rate,
    pickOrder: stat.pick_order,
    cls: getClass(idx, stat.id),
    tags,
    counterDetails: details,
    phase: perspective === 'ally' ? 'pick' : 'enemyPick',
    position,
    hasData,
    breakdown: {
      base: stat.score,
      baseWeight: W_PICK_SCORE,
      baseContribution: (stat.score * W_PICK_SCORE) / totalWeight,
      counter: counterScore,
      counterWeight,
      counterContribution: (counterScore * counterWeight) / totalWeight,
      wr: wrScore,
      wrWeight,
      wrContribution: (wrScore * wrWeight) / totalWeight,
      comp: comp.score,
      compWeight: W_PICK_COMP,
      compContribution: (comp.score * W_PICK_COMP) / totalWeight,
      orderAdj: order.adj,
      total,
      reasons,
    },
  };
}

/**
 * 敌方槽位录入时，标签表达的是「这个英雄会威胁我方谁」。
 * details 是候选(敌方) vs 我方已选的对位胜率：候选胜率高 = 它克制我方。
 */
function enemyThreatTags(details: CounterDetail[]): Tag[] {
  const scored = details
    .filter((d) => d.hasSample)
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));

  const tags: Tag[] = [];
  for (const d of scored) {
    if (tags.length >= 2) break;
    if (d.delta >= TAG_THRESHOLD) {
      tags.push({
        text: `克制我方 ${brawlerCN(d.opponentName)} ${signedPp(d.delta)}`,
        tone: 'bad',
      });
    } else if (d.delta <= -TAG_THRESHOLD) {
      tags.push({
        text: `怕我方 ${brawlerCN(d.opponentName)} ${signedPp(d.delta)}`,
        tone: 'good',
      });
    }
  }
  return tags;
}

/**
 * 敌方槽位排序分：以「方便快速找到敌方可能选的英雄」为主 —— 地图强度 + 热度，
 * 不做克制修正（克制只在切回我方槽位时生效）。
 */
function enemyPickScoreOf(idx: MetaIndex, mapName: string, stat: MapBrawlerStat): number {
  const maxUse = maxUseRate(idx, mapName);
  const useNorm = (stat.use_rate / maxUse) * 100;
  return clamp(stat.score * W_ENEMY_SCORE + useNorm * W_ENEMY_USE, 0, 100);
}

/** Pick 推荐列表（自动按激活槽位选择视角） */
export function pickRecommendations(
  idx: MetaIndex,
  state: DraftState,
  limit = 60,
): Candidate[] {
  const map = idx.mapByName.get(state.mapName);
  if (!map) return [];

  const perspective: 'ally' | 'enemy' = state.active.kind === 'enemy' ? 'enemy' : 'ally';
  const position = currentPosition(state);

  const out: Candidate[] = [];
  // 遍历全量英雄：该图没数据的也要能选
  for (const ref of idx.meta.brawlers) {
    if (isTaken(state, ref.id)) continue;
    const { stat, hasData } = statFor(idx, state.mapName, ref.id, ref.name);

    if (perspective === 'enemy') {
      // 敌方录入：排序以出场率为主，但标签仍给出威胁提示
      const oppIds = opponentsFor(state, 'enemy');
      const { details } = counterDetail(idx, state.mapName, state.mode, stat.id, oppIds);
      const baseScore = enemyPickScoreOf(idx, state.mapName, stat);
      const useNorm = clamp(
        (stat.use_rate / maxUseRate(idx, state.mapName)) * 100,
        0,
        100,
      );
      out.push({
        id: stat.id,
        name: stat.name,
        cn: brawlerCN(stat.name),
        score: baseScore,
        mapScore: stat.score,
        baseWR: stat.smoothed_wr,
        useRate: stat.use_rate,
        pickOrder: stat.pick_order,
        cls: getClass(idx, stat.id),
        tags: enemyThreatTags(details),
        counterDetails: details,
        phase: 'enemyPick',
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
            { tone: 'neutral', text: '敌方录入模式：按地图强度 + 出场率排序，便于快速点选' },
          ],
        },
      });
      continue;
    }

    out.push(evaluatePick(idx, state, stat, position, 'ally', hasData));
  }

  // 有真实数据的排前面，无样本的沉底（它们只是兜底占位，基本不会有人选）
  out.sort((a, b) => {
    if (a.hasData !== b.hasData) return a.hasData ? -1 : 1;
    return b.score - a.score;
  });
  return out.slice(0, limit);
}

/** 统一入口：按激活槽位自动分发 Ban / Pick 推荐 */
export function recommend(idx: MetaIndex, state: DraftState, limit = 60): Candidate[] {
  if (state.active.kind === 'ban') return banRecommendations(idx, state, limit);
  return pickRecommendations(idx, state, limit);
}

/** 详情弹窗：对任意英雄（含已选/已禁）给出完整拆解 */
export function evaluateBrawler(
  idx: MetaIndex,
  state: DraftState,
  brawlerId: number,
): Candidate | null {
  const ref = idx.brawlerById.get(brawlerId);
  if (!ref) return null;
  // 该图没数据也允许查看详情（分数按中性占位）
  const { stat, hasData } = statFor(idx, state.mapName, brawlerId, ref.name);
  const position = currentPosition(state);

  if (state.active.kind === 'ban') {
    const banScore = banScoreOf(idx, state.mapName, stat);
    const maxUse = maxUseRate(idx, state.mapName);
    const useNorm = clamp((stat.use_rate / maxUse) * 100, 0, 100);
    const firstBonus = stat.pick_order === 'FIRST' ? 100 : 0;
    return {
      id: stat.id,
      name: stat.name,
      cn: brawlerCN(stat.name),
      score: banScore,
      mapScore: stat.score,
      baseWR: stat.smoothed_wr,
      useRate: stat.use_rate,
      pickOrder: stat.pick_order,
      cls: getClass(idx, stat.id),
      tags: [],
      counterDetails: [],
      phase: 'ban',
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
        reasons: banReasons(idx, state.mapName, stat, banScore),
      },
    };
  }

  const perspective: 'ally' | 'enemy' = state.active.kind === 'enemy' ? 'enemy' : 'ally';
  return evaluatePick(idx, state, stat, position, perspective, hasData);
}

/**
 * 底部槽位用：只取该英雄的**本图静态基础分**与顺位，不带任何对局动态修正。
 *
 * 为什么不再用动态分：动态分会被克制/阵容项压到 60 上下，
 * 刚选完一个本图 99 分的英雄却显示 62 分，观感是「一选就被打折」。
 * 动态排序仍然在候选列表里按 score 走，槽位只负责如实展示这张图的强度。
 */
export function slotBase(
  idx: MetaIndex,
  state: DraftState,
  brawlerId: number,
): { score: number; pickOrder: PickOrder; hasData: boolean } | null {
  const ref = idx.brawlerById.get(brawlerId);
  if (!ref) return null;
  const { stat, hasData } = statFor(idx, state.mapName, brawlerId, ref.name);
  return { score: stat.score, pickOrder: stat.pick_order, hasData };
}

/* ------------------------------------------------------------------ *
 * 蛇形 BP 顺位
 * ------------------------------------------------------------------ */

/**
 * 全局蛇形顺位号（1-2-2-1）：先手方拿 1 / 4 / 5，后手方拿 2 / 3 / 6。
 *
 * 返回值按「该阵营自己的槽位顺序」排列，即 ally[0] 是左侧第 1 行对应的全局第几手。
 * 先手方 = ally 时：ally = [1,4,5]，enemy = [2,3,6]；先手方 = enemy 时镜像。
 */
export function slotPickNumbers(state: DraftState): { ally: number[]; enemy: number[] } {
  const ally: number[] = [];
  const enemy: number[] = [];
  for (let n = 1; n <= 6; n += 1) {
    if (sideOfPick(state, n) === 'ally') ally.push(n);
    else enemy.push(n);
  }
  return { ally, enemy };
}

/** 单个槽位的全局顺位号（1-6） */
export function pickNumberOfSlot(state: DraftState, side: Side, index: number): number {
  return slotPickNumbers(state)[side][index] ?? 0;
}

/* ------------------------------------------------------------------ *
 * 槽位流转
 * ------------------------------------------------------------------ */

/**
 * 智能跳转：从当前激活槽位往后找下一个合理空槽。
 * 顺序：先补完当前阵营/当前阶段，再按 BP 序列推进；全部填满返回 null。
 *
 * Ban 阶段的推进只看「已填槽位数（含空 Ban）」而不是去重后的英雄数——
 * 双方重复 Ban 同一英雄、或连续空 Ban，都不会让流程卡在 Ban 阶段。
 */
export function nextSlot(state: DraftState): ActiveSlot | null {
  const { ally, enemy } = state;

  // Ban 阶段未满 → 继续填 Ban（按槽位顺序找第一个空格）
  if (state.active.kind === 'ban') {
    const idx = firstEmptyBanSlot(state);
    if (idx !== null) return { kind: 'ban', index: idx };
  }

  // Pick 阶段：从第 (已选数 + 1) 手开始按序列找第一个还有空位的阵营
  const n = totalPicked(state) + 1;
  for (let i = n; i <= 6; i += 1) {
    const side = sideOfPick(state, i);
    const arr = side === 'ally' ? ally : enemy;
    if (arr.length < TEAM_SLOTS) return { kind: side, index: arr.length };
  }

  // 序列走完但仍有空位（用户手动跳选过）→ 补任意空槽
  if (ally.length < TEAM_SLOTS) return { kind: 'ally', index: ally.length };
  if (enemy.length < TEAM_SLOTS) return { kind: 'enemy', index: enemy.length };
  const banIdx = firstEmptyBanSlot(state);
  if (banIdx !== null) return { kind: 'ban', index: banIdx };
  return null;
}

/** 解析实际写入目标：激活槽位有效就用它，否则回退到 nextSlot */
function resolveTargetSlot(state: DraftState): ActiveSlot | null {
  const a = state.active;
  // Ban 槽必须自己还在 6 格范围内、且是空的才认；
  // 点开一个已填的槽不会把英雄覆盖进去，index 越界（如 6）也不认。
  if (a.kind === 'ban' && a.index >= 0 && a.index < BAN_SLOTS && (state.bans[a.index] ?? null) === null) {
    return a;
  }
  if (a.kind === 'ally' && state.ally.length < TEAM_SLOTS) return a;
  if (a.kind === 'enemy' && state.enemy.length < TEAM_SLOTS) return a;
  return nextSlot(state);
}

/**
 * 填入英雄：写入对应槽位，返回新状态（纯函数）。
 *
 * Ban 与 Pick 的规则不同：
 * - Pick：任何已被 Ban（双方）或已选的英雄都不能再选；
 * - Ban：允许 Ban 掉对方已经 Ban 的英雄（盲 Ban 重复），但队内 3 位互斥；
 * - 「空 Ban」不锁英雄，可重复填任意槽位。
 */
export function applyPick(state: DraftState, brawlerId: number): DraftState {
  const next = cloneState(state);
  const target = resolveTargetSlot(next);
  if (!target) return next;

  if (target.kind === 'ban') {
    if (!isEmptyBan(brawlerId)) {
      if (isPicked(next, brawlerId)) return next;
      if (isBannedBySide(next, banSideOfIndex(target.index), brawlerId)) return next;
    }
    next.bans[target.index] = brawlerId;
  } else if (target.kind === 'ally') {
    if (isTaken(next, brawlerId)) return next;
    next.ally = [...next.ally, brawlerId];
  } else {
    if (isTaken(next, brawlerId)) return next;
    next.enemy = [...next.enemy, brawlerId];
  }

  const slot = nextSlot(next);
  next.active = slot ?? target;
  return next;
}

/** 清空某个槽位（Ban 位只置 null，后面的槽不前移，避免串队） */
export function clearSlot(state: DraftState, slot: ActiveSlot): DraftState {
  const next = cloneState(state);
  if (slot.kind === 'ban') next.bans[slot.index] = null;
  else if (slot.kind === 'ally') next.ally = next.ally.filter((_, i) => i !== slot.index);
  else next.enemy = next.enemy.filter((_, i) => i !== slot.index);
  next.active = slot;
  return next;
}

export function cloneState(state: DraftState): DraftState {
  return {
    ...state,
    ally: [...state.ally],
    enemy: [...state.enemy],
    bans: normalizeBans(state.bans),
    active: { ...state.active },
  };
}

/** 初始化一局 */
export function createDraft(
  mapName: string,
  mode: string,
  firstPick: Side | null = null,
): DraftState {
  return {
    mapName,
    mode,
    ally: [],
    enemy: [],
    bans: normalizeBans([]),
    firstPick,
    active: { kind: 'ban', index: 0 },
  };
}

/**
 * 重置整局：清空 6 个 Ban 位与双方已选，回到 Ban 第 1 位。
 * 保留地图与先手方（这两项属于「本局设置」，不是对局进度）。
 */
export function resetDraft(state: DraftState): DraftState {
  return {
    ...state,
    bans: normalizeBans([]),
    ally: [],
    enemy: [],
    active: { kind: 'ban', index: 0 },
  };
}

/* ------------------------------------------------------------------ *
 * 搜索 / 过滤
 * ------------------------------------------------------------------ */

/**
 * 筛选键：通用项 + 职业（一级标签）。
 * 「召唤」「破墙」这类是能力不是职业，已不再作为筛选维度。
 */
export type QuickFilter = 'all' | 'first' | 'counter' | BrawlerClass;

const CLASS_SET = new Set<string>(CLASS_ORDER);

export interface FilterChip {
  key: QuickFilter;
  label: string;
}

export const GENERAL_FILTERS: FilterChip[] = [
  { key: 'all', label: '全部' },
  { key: 'first', label: '先手' },
  { key: 'counter', label: '后手' },
];

/** 职业筛选，顺序按 CLASS_ORDER */
export const CLASS_FILTERS: FilterChip[] = CLASS_ORDER.map((k) => ({
  key: k,
  label: CLASS_LABEL[k],
}));

export const QUICK_FILTERS: FilterChip[] = [...GENERAL_FILTERS, ...CLASS_FILTERS];

export function passesFilter(c: Candidate, filter: QuickFilter): boolean {
  if (filter === 'all') return true;
  if (filter === 'first') return c.pickOrder === 'FIRST';
  if (filter === 'counter') return c.pickOrder === 'LAST';
  // 职业是单选，精确匹配
  if (CLASS_SET.has(filter)) return (c.cls as string) === filter;
  return true;
}

/** 名字归一化后比较，供外部搜索复用 */
export const sameName = (a: string, b: string): boolean =>
  normalizeName(a) === normalizeName(b);
