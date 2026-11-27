import { useCallback, useEffect, useState } from 'react';
import {
  BAN_SLOTS,
  TEAM_SLOTS,
  isEmptyBan,
  slotPickNumbers,
  type DraftState,
} from '../utils/draftEngine';

/**
 * 历史对局存储（localStorage）。
 *
 * 这是「局后技术复盘评级」的第一阶段基础设施：这里只负责把一局 BP 与赛后战绩
 * **完整、可追溯**地存下来，不做任何评分。下一阶段的复盘引擎直接读这份记录，
 * 因此字段口径必须一次定死：
 *
 *   - `mapId` / `mode` 存**规范 ID**（地图英文名 / 模式 key），渲染时按当前语言
 *     实时翻译。存译名会让切语言后的历史记录变成乱码。
 *   - 战绩数值 `kills` / `deaths` / `damage` 未填一律是 `null`，**绝不补 0**：
 *     0 杀和「没填」在复盘里是两个完全不同的信号，用 0 兜底会污染评分。
 *   - `score` 与 `result` 必须自洽（win ↔ 2:0/2:1，loss ↔ 1:2/0:2，pending ↔ null），
 *     任何不自洽的写入都会被归一化成 pending，避免出现「胜 0:2」这种脏数据。
 *   - `allyStats` / `enemyStats` 各自与选人顺序一一对应；「最佳玩家」跨双方合计最多 1 人。
 *     旧记录没有 `enemyStats` 时按选人补齐空数据，绝不因此丢掉整条记录。
 *
 * 容错策略：JSON 损坏、单条记录字段缺失、存储被禁用（隐私模式 / 配额满）全部
 * 降级为「读不到」或「跳过这一条」，绝不让历史数据把整个应用卡死。
 */

export const MATCH_HISTORY_STORAGE_KEY = 'brawl.draft.matchHistory';
export const MATCH_HISTORY_SCHEMA_VERSION = 1;
/** 上限：只保留最近 200 场，避免 localStorage 无限膨胀 */
export const MATCH_HISTORY_LIMIT = 200;

export type MatchResult = 'pending' | 'win' | 'loss';
export type MatchScore = '2:0' | '2:1' | '1:2' | '0:2';
/** 先手方：我方先手 / 敌方先手 */
export type MatchFirstPick = 'ally' | 'enemy';

export const WIN_SCORES: readonly MatchScore[] = ['2:0', '2:1'];
export const LOSS_SCORES: readonly MatchScore[] = ['1:2', '0:2'];
/** 录入区按这个顺序渲染 4 枚胶囊：胜 2:0 / 胜 2:1 / 负 1:2 / 负 0:2 */
export const SCORE_OPTIONS: readonly MatchScore[] = [...WIN_SCORES, ...LOSS_SCORES];

/** 我方 / 敌方单个选人：保留顺位（全局第几手 1-6）与规范英雄 ID */
export interface MatchPick {
  brawlerId: string;
  pickOrder: number;
}

/** 我方单人战绩。数值为 null 表示「没填」，与 0 严格区分 */
export interface MatchStat {
  brawlerId: string;
  /** 击杀（整数） */
  kills: number | null;
  /** 死亡（整数） */
  deaths: number | null;
  /** 造成伤害（原始整数） */
  damage: number | null;
  /** 治疗量（原始整数） */
  healing: number | null;
  /** 承受伤害（原始整数） */
  damageTaken: number | null;
  /** 模式专属指标原始值（足球=进球、热区=秒、赏金=星星、金库=伤害、宝石=颗；淘汰赛恒为 null） */
  objectiveValue: number | null;
  /** 是否标记为「我」（最多 1 人，仅我方有） */
  isSelf: boolean;
  /** 是否标记为「最佳玩家」（全场最多 1 人，可全不选） */
  isStarPlayer: boolean;
}

/** 敌方单人战绩：与我方同构，但没有「我」这个概念 */
export interface EnemyStat {
  brawlerId: string;
  kills: number | null;
  deaths: number | null;
  damage: number | null;
  healing: number | null;
  damageTaken: number | null;
  objectiveValue: number | null;
  /** 是否标记为「最佳玩家」（与 allyStats 合计最多 1 人） */
  isStarPlayer: boolean;
}

export interface MatchRecord {
  id: string;
  createdAt: number;
  updatedAt: number;
  /** 地图规范 ID（数据里的英文地图名） */
  mapId: string;
  /** 模式 key（如 brawlBall） */
  mode: string;
  firstPick: MatchFirstPick;
  /** 本局被 Ban 的英雄 ID（不含「空 Ban」占位） */
  bans: string[];
  allyPicks: MatchPick[];
  enemyPicks: MatchPick[];
  result: MatchResult;
  score: MatchScore | null;
  /** 与 `allyPicks` 一一对应，长度恒等于 allyPicks 的长度 */
  allyStats: MatchStat[];
  /**
   * 与 `enemyPicks` 一一对应。
   * 旧版本（第二阶段之前）的记录没有这个字段，读取时按 enemyPicks 补 3 条空数据，
   * 老记录不会因为多了这一栏就被丢掉。
   */
  enemyStats: EnemyStat[];
}

/** 编辑时允许覆盖的字段（id / createdAt 由存储层自己维护） */
export type MatchPatch = Partial<
  Pick<
    MatchRecord,
    | 'mapId'
    | 'mode'
    | 'firstPick'
    | 'bans'
    | 'allyPicks'
    | 'enemyPicks'
    | 'result'
    | 'score'
    | 'allyStats'
    | 'enemyStats'
  >
>;

/* ------------------------------------------------------------------ *
 * 基础判定 / 小工具
 * ------------------------------------------------------------------ */

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

export function isMatchScore(v: unknown): v is MatchScore {
  return v === '2:0' || v === '2:1' || v === '1:2' || v === '0:2';
}

/** 比分 → 胜负（2:0 / 2:1 为胜，1:2 / 0:2 为负） */
export function resultOfScore(score: MatchScore): MatchResult {
  return WIN_SCORES.includes(score) ? 'win' : 'loss';
}

/** 战绩输入框：只接受非负整数，空串 = 未填（null） */
export function parseStatInput(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (!/^\d+$/.test(trimmed)) return null;
  const n = Number(trimmed);
  return Number.isSafeInteger(n) ? n : null;
}

/** 回填输入框：null → 空串（不显示 0） */
export function formatStatInput(value: number | null): string {
  return value === null ? '' : String(value);
}

/* ------------------------------------------------------------------ *
 * 「万」单位录入（伤害 / 治疗 / 承伤 / 金库伤害）
 * ------------------------------------------------------------------ */

/**
 * 大数值统一按「万」录入：界面 `8.02` ↔ 存储 `80200`。
 * 用万做单位是因为官方结算面板就是 8,0200 这种量级，手机上一个 5 位数键盘敲起来太慢。
 */
export const WAN = 10000;

/** 原始整数 → 输入框文本（最多 2 位小数，去掉无意义的尾零） */
export function formatWanInput(value: number | null): string {
  if (value === null) return '';
  const wan = Math.round((value / WAN) * 100) / 100;
  const fixed = wan.toFixed(2);
  // "8.00" → "8"，"8.20" → "8.2"；纯 0 要单独处理，否则会被正则吃成空串
  return fixed.replace(/\.?0+$/, '') || '0';
}

/** 输入框文本 → 原始整数；空串 / 非法 / 负数 → null */
export function parseWanInput(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed || trimmed === '.' || !/^\d*\.?\d*$/.test(trimmed)) return null;
  const n = Number(trimmed);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * WAN);
}

/** 输入过程中的清洗：只留数字与一个小数点，小数最多 2 位 */
export function sanitizeWanTyping(value: string): string {
  const cleaned = value.replace(/[^\d.]/g, '');
  const [head = '', ...rest] = cleaned.split('.');
  if (rest.length === 0) return head;
  return `${head}.${rest.join('').slice(0, 2)}`;
}

/* ------------------------------------------------------------------ *
 * 模式专属指标
 * ------------------------------------------------------------------ */

/** 第五项指标的类型（淘汰赛没有） */
export type ObjectiveKind = 'goals' | 'zoneSeconds' | 'stars' | 'safeDamage' | 'gems';

const OBJECTIVE_BY_MODE: Record<string, ObjectiveKind> = {
  brawlBall: 'goals', // 进球
  hotZone: 'zoneSeconds', // 占领秒数
  bounty: 'stars', // 获得星星
  heist: 'safeDamage', // 金库伤害
  gemGrab: 'gems', // 持有 / 收集宝石
};

/** 该模式的专属指标类型；淘汰赛（及未知模式）返回 null = 只有 4 项基础指标 */
export function objectiveKindOf(mode: string): ObjectiveKind | null {
  return OBJECTIVE_BY_MODE[mode] ?? null;
}

/** 金库伤害是唯一按「万」录入的模式指标 */
export function objectiveIsWan(kind: ObjectiveKind | null): boolean {
  return kind === 'safeDamage';
}

/** 记录 ID：时间戳（36 进制）+ 随机后缀，同毫秒连续保存也不会撞 */
export function createMatchId(now = Date.now()): string {
  const rand = Math.random().toString(36).slice(2, 8);
  return `${now.toString(36)}-${rand}`;
}

/**
 * 一次完整 BP 的指纹：地图 / 模式 / 先手 / Ban / 双方选人。
 * 界面用它判断「当前这局是否已经保存过」，改动任意一项都会重置保存态。
 */
export function draftSignature(draft: DraftState): string {
  return JSON.stringify([
    draft.mapName,
    draft.mode,
    draft.firstPick,
    draft.bans.map((v) => (typeof v === 'number' ? v : null)),
    draft.ally,
    draft.enemy,
  ]);
}

/* ------------------------------------------------------------------ *
 * 清洗（读盘 + 写入前统一走这里）
 * ------------------------------------------------------------------ */

/** 任意值 → 英雄 ID 字符串（数字 ID 也接受，统一转成字符串） */
function toIdString(v: unknown): string | null {
  if (typeof v === 'string') {
    const s = v.trim();
    return s ? s : null;
  }
  if (typeof v === 'number' && Number.isFinite(v)) return String(Math.trunc(v));
  return null;
}

/**
 * 任意值 → 非负整数计数。
 * `null` / `undefined` / 空串 / 负数 / 非法字符一律 null——「没填」不能用 0 代替。
 */
function toCount(v: unknown): number | null {
  if (typeof v === 'number') {
    if (!Number.isFinite(v) || v < 0) return null;
    return Math.floor(v);
  }
  if (typeof v === 'string') {
    const trimmed = v.trim();
    if (!trimmed || !/^\d+$/.test(trimmed)) return null;
    const n = Number(trimmed);
    return Number.isSafeInteger(n) ? n : null;
  }
  return null;
}

function toTimestamp(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.trunc(v) : null;
}

/** 选人列表：过滤脏项、去重、最多 3 人；顺位缺失时按顺序补 1..n */
function normalizePicks(raw: unknown): MatchPick[] {
  if (!Array.isArray(raw)) return [];
  const out: MatchPick[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    if (out.length >= TEAM_SLOTS) break;
    if (!isObj(item)) continue;
    const id = toIdString(item.brawlerId);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const order = toCount(item.pickOrder);
    out.push({ brawlerId: id, pickOrder: order && order > 0 ? order : out.length + 1 });
  }
  return out;
}

/** Ban 列表：过滤「空 Ban」与脏值，去重，最多 6 个 */
function normalizeBans(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const v of raw) {
    if (out.length >= BAN_SLOTS) break;
    const id = toIdString(v);
    if (!id || out.includes(id)) continue;
    out.push(id);
  }
  return out;
}

/** 取第一个「有值」的别名键：历史版本可能把扩展字段写成过别名 */
function firstPresent(item: Record<string, unknown>, keys: readonly string[]): unknown {
  for (const key of keys) {
    const value = item[key];
    if (value !== undefined && value !== null && value !== '') return value;
  }
  return undefined;
}

/**
 * 「万」单位字段的解析。
 *
 * 除了常规整数，还要兼容一种历史脏数据：早期版本可能把输入框原文（如 `"6.2"`）
 * 直接落盘。原始统计不可能是小数，出现小数只可能来自「万」输入框，
 * 所以按 ×10000 还原（`"6.2"` → 62000），而不是像整数解析那样判成 null。
 */
function toWanCount(v: unknown): number | null {
  if (typeof v === 'string') {
    const trimmed = v.trim();
    if (/^\d+\.\d+$/.test(trimmed)) {
      const n = Number(trimmed);
      return Number.isFinite(n) && n >= 0 ? Math.round(n * WAN) : null;
    }
  }
  return toCount(v);
}

/**
 * 战绩数组归一化：按选人顺序对齐重排，保证一一对应。
 *
 * 「我」只在我方生效且最多 1 人；「最佳玩家」跨双方合计最多 1 人——
 * 因此这里把 `starTaken` 作为**跨阵营的占用标记**传进来，敌方接着我方的结果继续判。
 *
 * 扩展字段（治疗 / 承伤 / 模式指标）额外做两件事：
 *   1. 接受历史别名（`heal` / `tanking` / `objective` 等），旧数据不会因为键名不同被清空；
 *   2. 万单位字段容忍小数文本，见 `toWanCount`。
 */
function normalizeStatRows(
  raw: unknown,
  picks: MatchPick[],
  opts: { allowSelf: boolean; starTaken: boolean; objectiveWan: boolean },
): { rows: Array<MatchStat & { isSelf: boolean }>; starTaken: boolean } {
  const list = Array.isArray(raw) ? raw : [];
  let selfTaken = false;
  let starTaken = opts.starTaken;

  const rows = picks.map((pick, i) => {
    const item = isObj(list[i]) ? list[i] : {};
    const isSelf = opts.allowSelf && item.isSelf === true && !selfTaken;
    if (isSelf) selfTaken = true;
    const isStarPlayer = item.isStarPlayer === true && !starTaken;
    if (isStarPlayer) starTaken = true;

    const objectiveRaw = firstPresent(item, [
      'objectiveValue',
      'objective_value',
      'objective',
      'objectiveMetric',
    ]);

    return {
      brawlerId: pick.brawlerId,
      kills: toCount(item.kills),
      deaths: toCount(item.deaths),
      damage: toWanCount(item.damage),
      // V1 新增：旧记录没有这三个字段时自然是 null，不丢数据
      healing: toWanCount(firstPresent(item, ['healing', 'heal', 'healingDone'])),
      damageTaken: toWanCount(
        firstPresent(item, ['damageTaken', 'damage_taken', 'taken', 'tanking']),
      ),
      objectiveValue: opts.objectiveWan ? toWanCount(objectiveRaw) : toCount(objectiveRaw),
      isSelf,
      isStarPlayer,
    };
  });

  return { rows, starTaken };
}

/** 胜负与比分自洽化：不自洽（胜 + 1:2 / 比分缺失）一律退回「待补录」 */
function normalizeOutcome(
  result: unknown,
  score: unknown,
): { result: MatchResult; score: MatchScore | null } {
  if (result !== 'win' && result !== 'loss') return { result: 'pending', score: null };
  if (!isMatchScore(score)) return { result: 'pending', score: null };
  const allowed = result === 'win' ? WIN_SCORES : LOSS_SCORES;
  if (!allowed.includes(score)) return { result: 'pending', score: null };
  return { result, score };
}

/**
 * 单条记录归一化。id / mapId 缺失视为无效记录（返回 null），
 * 其余字段尽量修复而不是丢弃——宁可少一个字段，也别让用户整场记录消失。
 */
export function normalizeMatchRecord(raw: unknown): MatchRecord | null {
  if (!isObj(raw)) return null;

  const id = toIdString(raw.id);
  const mapId = typeof raw.mapId === 'string' ? raw.mapId.trim() : '';
  if (!id || !mapId) return null;

  const allyPicks = normalizePicks(raw.allyPicks);
  const enemyPicks = normalizePicks(raw.enemyPicks);
  const createdAt = toTimestamp(raw.createdAt) ?? 0;
  const updatedAt = toTimestamp(raw.updatedAt) ?? createdAt;
  const outcome = normalizeOutcome(raw.result, raw.score);
  const mode = typeof raw.mode === 'string' ? raw.mode : '';
  // 金库的金库伤害按「万」录入，其它模式的第 5 项是个/秒/颗的整数
  const objectiveWan = objectiveIsWan(objectiveKindOf(mode));

  // 「最佳玩家」跨双方互斥：先判我方，我方占了名额敌方就全部清掉
  const ally = normalizeStatRows(raw.allyStats, allyPicks, {
    allowSelf: true,
    starTaken: false,
    objectiveWan,
  });
  const enemy = normalizeStatRows(raw.enemyStats, enemyPicks, {
    allowSelf: false,
    starTaken: ally.starTaken,
    objectiveWan,
  });

  return {
    id,
    createdAt,
    updatedAt,
    mapId,
    mode,
    firstPick: raw.firstPick === 'enemy' ? 'enemy' : 'ally',
    bans: normalizeBans(raw.bans),
    allyPicks,
    enemyPicks,
    result: outcome.result,
    score: outcome.score,
    allyStats: ally.rows,
    // 敌方没有「我」这一栏，顺手剥掉
    enemyStats: enemy.rows.map(
      ({ brawlerId, kills, deaths, damage, healing, damageTaken, objectiveValue, isStarPlayer }) => ({
        brawlerId,
        kills,
        deaths,
        damage,
        healing,
        damageTaken,
        objectiveValue,
        isStarPlayer,
      }),
    ),
  };
}

/** 列表归一化：逐条修复 → 按 id 去重 → 按创建时间倒序 → 截断到上限 */
export function normalizeMatchList(raw: unknown): MatchRecord[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: MatchRecord[] = [];
  for (const item of raw) {
    const record = normalizeMatchRecord(item);
    if (!record || seen.has(record.id)) continue;
    seen.add(record.id);
    out.push(record);
  }
  out.sort((a, b) => b.createdAt - a.createdAt || b.updatedAt - a.updatedAt);
  return out.slice(0, MATCH_HISTORY_LIMIT);
}

/* ------------------------------------------------------------------ *
 * 读写 localStorage
 * ------------------------------------------------------------------ */

/** 取存储句柄：隐私模式 / SSR / 被策略禁用时返回 null，调用方全部按「无持久化」处理 */
function getStorage(): Storage | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    return localStorage;
  } catch {
    return null;
  }
}

/** 读历史对局；文件损坏 / 结构不认识 → 空数组（不会抛错） */
export function loadMatchHistory(): MatchRecord[] {
  const storage = getStorage();
  if (!storage) return [];

  let raw: string | null;
  try {
    raw = storage.getItem(MATCH_HISTORY_STORAGE_KEY);
  } catch {
    return [];
  }
  if (!raw) return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    return [];
  }

  // 兼容两种形态：带 schemaVersion 的信封 / 直接是数组（更早的实验数据）
  if (Array.isArray(parsed)) return normalizeMatchList(parsed);
  if (isObj(parsed) && Array.isArray(parsed.records)) return normalizeMatchList(parsed.records);
  return [];
}

/** 写历史对局；写失败（配额满 / 隐私模式）只影响持久化，不影响本次会话 */
export function writeMatchHistory(records: MatchRecord[]): boolean {
  const storage = getStorage();
  if (!storage) return false;
  const payload = JSON.stringify({
    schemaVersion: MATCH_HISTORY_SCHEMA_VERSION,
    records: normalizeMatchList(records),
  });
  try {
    storage.setItem(MATCH_HISTORY_STORAGE_KEY, payload);
    return true;
  } catch {
    return false;
  }
}

/* ------------------------------------------------------------------ *
 * 纯函数：增 / 改 / 删 / 统计
 * ------------------------------------------------------------------ */

export interface NewMatchInput {
  mapId: string;
  mode: string;
  firstPick: MatchFirstPick;
  bans: string[];
  allyPicks: MatchPick[];
  enemyPicks: MatchPick[];
  now?: number;
}

/** 新建一条「待补录」记录：双方战绩全为 null，等待赛后填写 */
export function createMatchRecord(input: NewMatchInput): MatchRecord {
  const now = input.now ?? Date.now();
  const allyPicks = normalizePicks(input.allyPicks);
  const enemyPicks = normalizePicks(input.enemyPicks);
  return {
    id: createMatchId(now),
    createdAt: now,
    updatedAt: now,
    mapId: input.mapId,
    mode: input.mode,
    firstPick: input.firstPick === 'enemy' ? 'enemy' : 'ally',
    bans: normalizeBans(input.bans),
    allyPicks,
    enemyPicks,
    result: 'pending',
    score: null,
    allyStats: allyPicks.map((p) => ({
      brawlerId: p.brawlerId,
      kills: null,
      deaths: null,
      damage: null,
      healing: null,
      damageTaken: null,
      objectiveValue: null,
      isSelf: false,
      isStarPlayer: false,
    })),
    enemyStats: enemyPicks.map((p) => ({
      brawlerId: p.brawlerId,
      kills: null,
      deaths: null,
      damage: null,
      healing: null,
      damageTaken: null,
      objectiveValue: null,
      isStarPlayer: false,
    })),
  };
}

/**
 * 从当前 BP 状态生成一条待补录记录。
 * 「空 Ban」占位不落盘——它不是英雄，复盘引擎拿到负数 ID 只会当成脏数据。
 */
export function buildMatchFromDraft(draft: DraftState, now = Date.now()): MatchRecord {
  const pickNos = slotPickNumbers(draft);
  const allyPicks: MatchPick[] = draft.ally.map((id, i) => ({
    brawlerId: String(id),
    pickOrder: pickNos.ally[i] ?? i + 1,
  }));
  const enemyPicks: MatchPick[] = draft.enemy.map((id, i) => ({
    brawlerId: String(id),
    pickOrder: pickNos.enemy[i] ?? i + 1,
  }));
  const bans = draft.bans
    .filter((v): v is number => typeof v === 'number' && !isEmptyBan(v))
    .map(String);

  return createMatchRecord({
    mapId: draft.mapName,
    mode: draft.mode,
    firstPick: draft.firstPick === 'enemy' ? 'enemy' : 'ally',
    bans,
    allyPicks,
    enemyPicks,
    now,
  });
}

/** 追加一条记录（新的在最前），顺带做上限裁剪 */
export function addMatch(records: MatchRecord[], record: MatchRecord): MatchRecord[] {
  return normalizeMatchList([record, ...records]);
}

/** 更新一条记录：合并补丁、刷新 updatedAt、重新做一次自洽校验 */
export function updateMatch(
  records: MatchRecord[],
  id: string,
  patch: MatchPatch,
  now = Date.now(),
): MatchRecord[] {
  const next = records.map((record) => {
    if (record.id !== id) return record;
    return (
      normalizeMatchRecord({ ...record, ...patch, id: record.id, createdAt: record.createdAt, updatedAt: now }) ??
      record
    );
  });
  return normalizeMatchList(next);
}

/** 删除一条记录 */
export function deleteMatch(records: MatchRecord[], id: string): MatchRecord[] {
  return records.filter((record) => record.id !== id);
}

export interface HistorySummary {
  /** 总记录场次 */
  total: number;
  /** 已完赛场次（win + loss） */
  completed: number;
  wins: number;
  losses: number;
  /** 待补录场次 */
  pending: number;
  /** 已完赛胜率（0~1）；没有完赛记录时为 null */
  winRate: number | null;
}

/** 战绩页顶部概览：胜率只统计已完赛，pending 不计入分母 */
export function summarizeHistory(records: MatchRecord[]): HistorySummary {
  let wins = 0;
  let losses = 0;
  let pending = 0;
  for (const record of records) {
    if (record.result === 'win') wins += 1;
    else if (record.result === 'loss') losses += 1;
    else pending += 1;
  }
  const completed = wins + losses;
  return {
    total: records.length,
    completed,
    wins,
    losses,
    pending,
    winRate: completed === 0 ? null : wins / completed,
  };
}

/* ------------------------------------------------------------------ *
 * React 绑定
 * ------------------------------------------------------------------ */

export interface MatchHistoryApi {
  /** 按 createdAt 倒序 */
  records: MatchRecord[];
  add: (record: MatchRecord) => void;
  update: (id: string, patch: MatchPatch) => void;
  remove: (id: string) => void;
}

/**
 * 历史对局的 React 绑定：状态在进程内唯一来源，每次变更同步落盘。
 *
 * 落盘放在 effect 里而不是 setState 更新函数里——更新函数在 StrictMode 下会被
 * 重复执行，把同一份数据写两遍（还会让配额告警翻倍）。
 */
export function useMatchHistory(): MatchHistoryApi {
  const [records, setRecords] = useState<MatchRecord[]>(() => loadMatchHistory());

  useEffect(() => {
    writeMatchHistory(records);
  }, [records]);

  const add = useCallback((record: MatchRecord) => {
    setRecords((prev) => addMatch(prev, record));
  }, []);

  const update = useCallback((id: string, patch: MatchPatch) => {
    setRecords((prev) => updateMatch(prev, id, patch));
  }, []);

  const remove = useCallback((id: string) => {
    setRecords((prev) => deleteMatch(prev, id));
  }, []);

  return { records, add, update, remove };
}
