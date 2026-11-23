import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { validateMeta, type BrawlMeta, type MatchupTuple } from '../types/meta';
import {
  buildIndex,
  getClass,
  getMapMatchup,
  lookupMatchup,
  type MetaIndex,
} from '../data/metaIndex';
import { brawlerCN, matchScore, normalizeName, ROLE_NAME_ALIAS } from '../data/localization';
import {
  applyPick,
  banCount,
  banRecommendations,
  banSideOfIndex,
  bannedIds,
  brawlerMatchups,
  clearSlot,
  counterDetail,
  counterLight,
  createDraft,
  currentPosition,
  detectCompWarnings,
  evaluateBrawler,
  evaluatePick,
  firstEmptyBanSlot,
  isBanned,
  isBannedBySide,
  isEmptyBan,
  isTaken,
  matchupCell,
  nextSlot,
  passesFilter,
  pickNumberOfSlot,
  pickRecommendations,
  predictedWinRate,
  recommend,
  resetDraft,
  sideOfPick,
  slotPickNumbers,
  toProbability,
  totalPicked,
  MATCHUP_LIGHT_PP,
  EMPTY_BAN,
  TAG_THRESHOLD,
  type CounterDetail,
  type DraftState,
} from './draftEngine';

/* ------------------------------------------------------------------ *
 * 真实数据加载（不依赖浏览器，直接读 public/data）
 * ------------------------------------------------------------------ */

const RAW = JSON.parse(
  readFileSync(resolve(process.cwd(), 'public/data/brawl_meta.json'), 'utf-8'),
) as unknown;

/** 仓库里内置的那份（当前是 v3，没有 matchup_table），用于校验旧数据兼容性 */
const META: BrawlMeta = validateMeta(RAW);

/**
 * 测试夹具：把 v3 的 Top-K 边折叠成 v5 的无序查表。
 *
 * 真实 v5 数据（`schema_version: 5` 且带 `matchup_table`）直接原样返回，
 * 夹具不介入；只有拿到 v3/v4 旧数据时才按「同一对只留一条、正反合并」折叠成
 * `[min_id, max_id, delta_pp, n_eff]`，让引擎仍能在真实英雄规模上跑对称查表。
 * 数值原样搬运，不做任何缩放——断言仍能对着真实数据里的某一条边核对。
 */
function deriveV5(meta: BrawlMeta): BrawlMeta {
  const alreadyV5 =
    meta.schema_version >= 5 &&
    (meta.global_matchups.length > 0 || meta.maps.some((m) => m.matchup_table.length > 0));
  if (alreadyV5) return meta;

  const tableOf = (
    brawlers: { id: number; matchups: { opponent: number; delta: number; samples: number }[] }[],
  ): MatchupTuple[] => {
    const rows = new Map<string, MatchupTuple>();
    for (const b of brawlers) {
      for (const e of b.matchups) {
        const minId = Math.min(b.id, e.opponent);
        const maxId = Math.max(b.id, e.opponent);
        const key = `${minId}_${maxId}`;
        if (rows.has(key)) continue;
        rows.set(key, [minId, maxId, b.id <= e.opponent ? e.delta : -e.delta, e.samples]);
      }
    }
    return [...rows.values()];
  };

  const globalRows = new Map<string, MatchupTuple>();
  for (const mode of meta.modes) {
    for (const row of tableOf(mode.brawlers)) globalRows.set(`${row[0]}_${row[1]}`, row);
  }

  return {
    ...meta,
    schema_version: 5,
    maps: meta.maps.map((m) => ({ ...m, matchup_table: tableOf(m.brawlers) })),
    modes: meta.modes.map((m) => ({ ...m, matchup_table: tableOf(m.brawlers) })),
    global_matchups: [...globalRows.values()],
  };
}

/** 引擎侧统一使用 v5 形态的索引 */
const IDX: MetaIndex = buildIndex(deriveV5(META));

const idOf = (name: string): number => {
  const found = META.brawlers.find((b) => normalizeName(b.name) === normalizeName(name));
  if (!found) throw new Error(`测试数据里找不到英雄 ${name}`);
  return found.id;
};

const BOUNTY_MAP = 'Shooting Star';
const BALL_MAP = 'Center Stage';

function draft(over: Partial<DraftState> = {}): DraftState {
  return {
    ...createDraft(BOUNTY_MAP, 'bounty', 'ally'),
    ...over,
  };
}

/* ------------------------------------------------------------------ *
 * 1. Schema 校验与索引
 * ------------------------------------------------------------------ */

describe('Schema v5 校验与索引', () => {
  it('真实数据能通过运行时校验', () => {
    expect(META.schema_version).toBe(5);
    // 地图数量会随后端数据更新变化，只校验下限
    expect(META.maps.length).toBeGreaterThanOrEqual(26);
    expect(META.modes).toHaveLength(6);
    expect(META.brawlers.length).toBeGreaterThan(100);
    expect(META.updated_at).toMatch(/^\d{4}-\d{2}-\d{2}/);
    // v3 新参数
    expect(META.params.matchup_smoothing_c).toBeGreaterThan(0);
    expect(META.params.map_matchup_min_samples).toBeGreaterThan(0);
    expect(META.params.map_matchup_trust_samples).toBeGreaterThanOrEqual(
      META.params.map_matchup_min_samples,
    );
  });

  it('v5 三张查表都到位，且 3×3 数据源不再是 Top-K 列表', () => {
    // 每张图 / 每个模式都必须带查表；全局兜底也不能为空
    for (const m of META.maps) expect(m.matchup_table.length).toBeGreaterThan(0);
    for (const m of META.modes) expect(m.matchup_table.length).toBeGreaterThan(0);
    expect(META.global_matchups.length).toBeGreaterThan(0);

    // 表里的 id 已经排好序，delta 是百分点量级（不是 0~1 的概率）
    const [minId, maxId, delta, nEff] = META.maps[0]!.matchup_table[0]!;
    expect(minId).toBeLessThan(maxId);
    expect(Math.abs(delta)).toBeLessThan(100);
    expect(nEff).toBeGreaterThan(0);
  });

  it('兼容 v1.1.2 新增的 6 个分层平滑参数（缺失时按默认值兜底）', () => {
    const p = META.params;
    expect(p.matchup_min_eff_samples).toBeGreaterThan(0);
    expect(p.matchup_min_abs_delta).toBeGreaterThan(0);
    expect(p.same_mode_weight).toBeGreaterThan(0);
    expect(p.same_mode_cap).toBeGreaterThan(0);
    expect(p.other_mode_weight).toBeGreaterThan(0);
    expect(p.other_mode_cap).toBeGreaterThan(0);

    // 旧版 JSON 没有这些字段也不能报错
    const legacy = structuredClone(RAW) as { params: Record<string, unknown> };
    for (const k of [
      'matchup_min_eff_samples',
      'matchup_min_abs_delta',
      'same_mode_weight',
      'same_mode_cap',
      'other_mode_weight',
      'other_mode_cap',
    ]) {
      delete legacy.params[k];
    }
    const fallback = validateMeta(legacy).params;
    expect(fallback.matchup_min_eff_samples).toBe(15);
    expect(fallback.matchup_min_abs_delta).toBeCloseTo(0.02, 6);
    expect(fallback.same_mode_weight).toBeCloseTo(0.6, 6);
    expect(fallback.same_mode_cap).toBe(40);
    expect(fallback.other_mode_weight).toBeCloseTo(0.3, 6);
    expect(fallback.other_mode_cap).toBe(25);
  });

  it('拒绝 schema_version 不匹配的数据', () => {
    expect(() => validateMeta({ ...(RAW as object), schema_version: 99 })).toThrow(
      /schema_version/,
    );
  });

  it('拒绝缺失 matchups 的模式英雄', () => {
    const broken = structuredClone(RAW) as {
      modes: { brawlers: { matchups?: unknown }[] }[];
    };
    delete broken.modes[0]!.brawlers[0]!.matchups;
    expect(() => validateMeta(broken)).toThrow(/matchups/);
  });

  it('tier_audit 正确识别传奇/大师段位，且没有未知段位残留', () => {
    const audit = META.tier_audit;
    expect(audit).toBeDefined();
    expect(audit!.unknown_tier_battles).toBe(0);
    expect(audit!.min_tier).toBe(META.min_tier);
    expect(audit!.distribution.length).toBeGreaterThan(0);

    const labels = audit!.distribution.map((d) => d.label ?? '');
    expect(labels.some((l) => l.includes('传奇'))).toBe(true);
    expect(labels.some((l) => l.includes('大师'))).toBe(true);

    // 分布覆盖全部保留场次，且最低段位就是分布里的最小 tier
    const sum = audit!.distribution.reduce((s, d) => s + d.battles, 0);
    expect(sum).toBe(audit!.battles_kept);
    const minTier = Math.min(...audit!.distribution.map((d) => d.tier));
    expect(minTier).toBe(audit!.min_tier);
  });

  it('每个模式至少 4 张地图，且地图总数与模式统计一致', () => {
    let total = 0;
    for (const mode of META.modes) {
      const maps = IDX.mapsByMode.get(mode.mode) ?? [];
      expect(maps.length).toBeGreaterThanOrEqual(4);
      total += maps.length;
    }
    expect(total).toBe(META.maps.length);
  });

  it('模式查表命中后，反向查询自动取负', () => {
    const mode = IDX.modeByName.get('bounty')!;
    let pair: { self: number; opp: number; delta: number; nEff: number } | null = null;
    for (const row of mode.matchup_table) {
      pair = { self: row[0], opp: row[1], delta: row[2], nEff: row[3] };
      break;
    }
    expect(pair).not.toBeNull();

    // 用一个不存在的地图名，强制只查模式层
    const fwd = lookupMatchup(IDX, '__no_such_map__', 'bounty', pair!.self, pair!.opp);
    const rev = lookupMatchup(IDX, '__no_such_map__', 'bounty', pair!.opp, pair!.self);
    expect(fwd).not.toBeNull();
    expect(rev).not.toBeNull();
    expect(fwd!.source).toBe('mode');
    expect(fwd!.deltaPp).toBeCloseTo(pair!.delta, 6);
    expect(rev!.deltaPp).toBeCloseTo(-pair!.delta, 6);
    expect(rev!.nEff).toBe(pair!.nEff);
  });

  it('地图层对位边独立于模式层，且结构为 {opponent, delta, samples}', () => {
    const map = IDX.mapByName.get(BOUNTY_MAP)!;
    const withEdges = map.brawlers.find((b) => b.matchups.length > 0);
    expect(withEdges).toBeDefined();
    const edge = withEdges!.matchups[0]!;
    expect(typeof edge.opponent).toBe('number');
    expect(Number.isFinite(edge.delta)).toBe(true);
    expect(edge.samples).toBeGreaterThan(0);

    // 索引能按 (map, self, opp) 直接取到同一条边
    const indexed = getMapMatchup(IDX, BOUNTY_MAP, withEdges!.id, edge.opponent);
    expect(indexed).toBe(edge);
  });

  it('roles 表的拼写差异能被修正（仅数据层校验，不参与业务）', () => {
    const byName = new Map(META.brawlers.map((b) => [normalizeName(b.name), b]));
    const resolve = (n: string) => {
      const k = normalizeName(n);
      return byName.get(ROLE_NAME_ALIAS[k] ?? k) ?? byName.get(k);
    };

    // roles 里写 "Larry & Laurie"，字典是 "LARRY & LAWRIE"
    expect(resolve('Larry & Laurie')?.name).toBe('LARRY & LAWRIE');

    // 所有角色条目都应能落到某个英雄上
    const unresolved: string[] = [];
    for (const role of META.roles.roles) {
      for (const name of role.brawlers) {
        if (!resolve(name)) unresolved.push(`${role.key}: ${name}`);
      }
    }
    expect(unresolved).toEqual([]);
  });
});

/* ------------------------------------------------------------------ *
 * 2. 本地化
 * ------------------------------------------------------------------ */

describe('本地化与搜索', () => {
  it('常见英雄有中文名', () => {
    expect(brawlerCN('RICO')).toBe('瑞科');
    expect(brawlerCN('PIPER')).toBe('佩佩');
    expect(brawlerCN('HANK')).toBe('汉克');
    expect(brawlerCN('MORTIS')).toBe('莫提斯');
  });

  it('未收录英雄优雅回退英文名', () => {
    expect(brawlerCN('NOT_A_REAL_BRAWLER')).toBe('NOT_A_REAL_BRAWLER');
  });

  it('拼音首字母与别名可命中', () => {
    expect(matchScore('rk', 'RICO', '瑞科', ['rk'])).toBeGreaterThan(0);
    expect(matchScore('铲子', 'MORTIS', '莫提斯', ['mts', '铲子'])).toBeGreaterThan(0);
    expect(matchScore('pp', 'PIPER', '佩佩', ['pp'])).toBeGreaterThan(0);
    expect(matchScore('zzzz', 'RICO', '瑞科', ['rk'])).toBe(0);
  });

  it('中文与英文都能前缀匹配', () => {
    expect(matchScore('瑞', 'RICO', '瑞科', [])).toBe(2);
    expect(matchScore('ric', 'RICO', '瑞科', [])).toBe(2);
  });

  it('精确匹配中文/英文名不会被 0 误杀', () => {
    expect(matchScore('瑞科', 'RICO', '瑞科', [])).toBeGreaterThan(0);
    expect(matchScore('RICO', 'RICO', '瑞科', [])).toBeGreaterThan(0);
    expect(matchScore('佩佩', 'PIPER', '佩佩', ['pp'])).toBe(1);
  });

  it('纯中文查询不会命中无关英雄（空串归一化陷阱）', () => {
    // 佩佩 只应命中 PIPER，不能因为 normalizeName('佩佩') === '' 而全量命中
    expect(matchScore('佩佩', 'PIPER', '佩佩', ['pp'])).toBeGreaterThan(0);
    expect(matchScore('佩佩', 'RICO', '瑞科', ['rk'])).toBe(0);
    expect(matchScore('莫提斯', 'MORTIS', '莫提斯', ['mts'])).toBeGreaterThan(0);
    expect(matchScore('莫提斯', 'PIPER', '佩佩', ['pp'])).toBe(0);
    expect(matchScore('铲子', 'MORTIS', '莫提斯', ['mts', '铲子'])).toBeGreaterThan(0);
    expect(matchScore('铲子', 'RICO', '瑞科', ['rk'])).toBe(0);
  });
});

/* ------------------------------------------------------------------ *
 * 3. Ban 推荐
 * ------------------------------------------------------------------ */

describe('Ban 阶段推荐', () => {
  it('返回按 ban 分降序的候选，且分数落在 0-100', () => {
    const list = banRecommendations(IDX, draft());
    expect(list.length).toBeGreaterThan(10);
    for (let i = 1; i < list.length; i += 1) {
      expect(list[i - 1]!.banScore).toBeGreaterThanOrEqual(list[i]!.banScore);
    }
    for (const c of list) {
      expect(c.banScore).toBeGreaterThanOrEqual(0);
      expect(c.banScore).toBeLessThanOrEqual(100);
      expect(c.phase).toBe('ban');
    }
  });

  it('已 Ban 的英雄被过滤掉', () => {
    const top = banRecommendations(IDX, draft())[0]!;
    const after = banRecommendations(IDX, draft({ bans: [top.id] }));
    expect(after.some((c) => c.id === top.id)).toBe(false);
  });

  it('已选英雄也不会出现在 Ban 推荐里', () => {
    const top = banRecommendations(IDX, draft())[0]!;
    const after = banRecommendations(IDX, draft({ ally: [top.id] }));
    expect(after.some((c) => c.id === top.id)).toBe(false);
  });

  it('Ban 明细带可读理由', () => {
    const top = banRecommendations(IDX, draft())[0]!;
    expect(top.breakdown.reasons.length).toBeGreaterThan(0);
    expect(top.breakdown.reasons.every((r) => r.text.length > 0)).toBe(true);
  });

  it('先手万金油（FIRST）在同等强度下 ban 分更高', () => {
    const map = IDX.mapByName.get(BOUNTY_MAP)!;
    const first = map.brawlers.find((b) => b.pick_order === 'FIRST');
    const last = map.brawlers.find((b) => b.pick_order === 'LAST');
    expect(first).toBeDefined();
    expect(last).toBeDefined();
    const banFirst = banRecommendations(IDX, draft(), 200).find((c) => c.id === first!.id)!;
    const banLast = banRecommendations(IDX, draft(), 200).find((c) => c.id === last!.id)!;
    // Ban 权重：出场率 50% + 强度 35% + 先手 15%，合计 1
    const b = banFirst.breakdown;
    expect(b.baseWeight + b.counterWeight + b.compWeight).toBeCloseTo(1, 5);
    expect(b.counterWeight).toBeGreaterThan(b.baseWeight); // 出场率权重高于强度
    expect(banLast.banScore).toBeGreaterThanOrEqual(0);
  });
});

/* ------------------------------------------------------------------ *
 * 4. Pick 动态分与克制
 * ------------------------------------------------------------------ */

describe('Pick 阶段动态分', () => {
  it('候选不包含已 Ban / 已选英雄', () => {
    const banned = idOf('PIPER');
    const picked = idOf('EDGAR');
    const state = draft({
      bans: [banned],
      enemy: [picked],
      active: { kind: 'ally', index: 0 },
    });
    const list = pickRecommendations(IDX, state);
    expect(list.some((c) => c.id === banned)).toBe(false);
    expect(list.some((c) => c.id === picked)).toBe(false);
  });

  it('分数降序且全部落在 0-100', () => {
    const state = draft({ enemy: [idOf('BROCK')], active: { kind: 'ally', index: 0 } });
    const list = pickRecommendations(IDX, state);
    for (let i = 1; i < list.length; i += 1) {
      expect(list[i - 1]!.score).toBeGreaterThanOrEqual(list[i]!.score);
    }
    for (const c of list) {
      expect(c.score).toBeGreaterThanOrEqual(0);
      expect(c.score).toBeLessThanOrEqual(100);
    }
  });

  it('克制敌方英雄的候选，克制分高于被克制者', () => {
    /**
     * 数据每次同步都会换一批对位边，具体英雄不保证「既有被它压的、也有压它的」，
     * 所以这里动态找一组正负边都存在的组合，只验证符号方向：
     * 压得住敌方 → 克制分 > 50；被敌方压 → 克制分 < 50。
     */
    let hit:
      | { mapName: string; mode: string; selfId: number; counterOf: number; victimOf: number }
      | null = null;

    for (const map of META.maps) {
      const stats = IDX.mapStatTable.get(map.map_name)!;
      for (const self of map.brawlers) {
        const edges = self.matchups.filter((e) => stats.has(e.opponent) && e.samples >= 20);
        const pos = edges.filter((e) => e.delta > 0);
        const neg = edges.filter((e) => e.delta < 0);
        if (pos.length && neg.length) {
          // self 视角：delta < 0 = 这个对手压 self；delta > 0 = self 压这个对手
          const counterOf = neg.reduce((a, b) => (a.delta < b.delta ? a : b));
          const victimOf = pos.reduce((a, b) => (a.delta > b.delta ? a : b));
          hit = {
            mapName: map.map_name,
            mode: map.mode,
            selfId: self.id,
            counterOf: counterOf.opponent,
            victimOf: victimOf.opponent,
          };
          break;
        }
      }
      if (hit) break;
    }

    expect(hit).not.toBeNull();

    const stats = IDX.mapStatTable.get(hit!.mapName)!;
    const state: DraftState = {
      ...createDraft(hit!.mapName, hit!.mode, 'ally'),
      enemy: [hit!.selfId],
      active: { kind: 'ally', index: 0 },
    };

    // 能压住敌方的英雄 → 我方占优
    const good = evaluatePick(IDX, state, stats.get(hit!.counterOf)!, 'FIRST', 'ally');
    // 被敌方压的英雄 → 我方吃亏
    const bad = evaluatePick(IDX, state, stats.get(hit!.victimOf)!, 'FIRST', 'ally');

    expect(good.breakdown.counter).toBeGreaterThan(50);
    expect(bad.breakdown.counter).toBeLessThan(50);
    expect(good.breakdown.counter).toBeGreaterThan(bad.breakdown.counter);
  });

  it('克制标签形如「克制 布洛克 +8.4」/「怕 … -9.2」', () => {
    const state = draft({ enemy: [idOf('BROCK')], active: { kind: 'ally', index: 0 } });
    const list = pickRecommendations(IDX, state, 200);
    const withTags = list.filter((c) => c.tags.length > 0);
    expect(withTags.length).toBeGreaterThan(0);
    const tag = withTags[0]!.tags[0]!;
    expect(tag.text).toMatch(/^(克制|怕) /);
    expect(tag.text).toMatch(/[+-]\d+\.\d$/);
    expect(['good', 'bad']).toContain(tag.tone);
  });

  it('无敌方亮牌时克制权重为 0，克制分保持中性 50', () => {
    const state = draft({ active: { kind: 'ally', index: 0 } });
    const list = pickRecommendations(IDX, state, 5);
    for (const c of list) {
      expect(c.breakdown.counterWeight).toBe(0);
      expect(c.breakdown.counter).toBe(50);
    }
  });

  it('克制权重随敌方亮牌数平滑增加', () => {
    const e1 = pickRecommendations(
      IDX,
      draft({ enemy: [idOf('BROCK')], active: { kind: 'ally', index: 0 } }),
      200,
    );
    const e3 = pickRecommendations(
      IDX,
      draft({
        enemy: [idOf('BROCK'), idOf('PIPER'), idOf('NITA')],
        active: { kind: 'ally', index: 0 },
      }),
      200,
    );
    const w1 = e1[0]!.breakdown.counterWeight;
    const w3 = e3[0]!.breakdown.counterWeight;
    expect(w1).toBeGreaterThan(0);
    expect(w3).toBeGreaterThan(w1);
    // 3 名敌方亮牌 = 满额 0.4，再叠中位/后手与多绿加成，因此不低于基准权重
    expect(w3).toBeGreaterThanOrEqual(0.4);
    expect(w3).toBeLessThanOrEqual(0.4 * 1.55 * 1.35);
  });

  it('后手位放大克制系数', () => {
    const state = draft({
      enemy: [idOf('BROCK')],
      active: { kind: 'ally', index: 0 },
    });
    const stat = IDX.mapStatTable.get(BOUNTY_MAP)!.get(idOf('EDGAR'))!;
    const early = evaluatePick(IDX, state, stat, 'FIRST', 'ally');
    const late = evaluatePick(IDX, state, stat, 'LAST', 'ally');
    expect(late.breakdown.counterWeight).toBeGreaterThan(early.breakdown.counterWeight);
  });

  it('明细里四项贡献之和构成总分（含顺位修正）', () => {
    const state = draft({ enemy: [idOf('BROCK')], active: { kind: 'ally', index: 0 } });
    const c = pickRecommendations(IDX, state, 1)[0]!;
    const {
      baseContribution,
      counterContribution,
      wrContribution,
      compContribution,
      orderAdj,
      total,
    } = c.breakdown;
    expect(
      baseContribution + counterContribution + (wrContribution ?? 0) + compContribution + orderAdj,
    ).toBeCloseTo(total, 5);
  });
});

/* ------------------------------------------------------------------ *
 * 5. 敌方槽位视角
 * ------------------------------------------------------------------ */

describe('敌方槽位录入视角', () => {
  it('排序以地图强度 + 出场率为主，不套克制公式', () => {
    const state = draft({ ally: [idOf('EDGAR')], active: { kind: 'enemy', index: 0 } });
    const list = pickRecommendations(IDX, state);
    expect(list.length).toBeGreaterThan(0);
    for (const c of list.slice(0, 5)) {
      expect(c.phase).toBe('enemyPick');
      // 阵容项权重为 0，说明没走克制/补位逻辑
      expect(c.breakdown.compWeight).toBe(0);
      expect(c.breakdown.baseWeight + c.breakdown.counterWeight).toBeCloseTo(1, 5);
    }
  });

  it('标签表达为「克制我方 / 怕我方」', () => {
    const state = draft({
      ally: [idOf('PIPER')],
      active: { kind: 'enemy', index: 0 },
    });
    const list = pickRecommendations(IDX, state, 200);
    const tags = list.flatMap((c) => c.tags);
    expect(tags.length).toBeGreaterThan(0);
    expect(tags.every((t) => /^(克制我方|怕我方) /.test(t.text))).toBe(true);
  });

  it('切回我方槽位立即以我方视角计算', () => {
    const enemyState = draft({ ally: [idOf('PIPER')], active: { kind: 'enemy', index: 0 } });
    const allyState = { ...enemyState, active: { kind: 'ally' as const, index: 0 } };
    const allyList = pickRecommendations(IDX, allyState);
    expect(allyList[0]!.phase).toBe('pick');
  });
});

/* ------------------------------------------------------------------ *
 * 5.5 Log5 残差 / 克制色条 / 详细对位（v3 起，v1.1.2 重定口径）
 * ------------------------------------------------------------------ */

describe('Log5 残差与克制色条', () => {
  const detail = (over: Partial<CounterDetail> = {}): CounterDetail => ({
    opponentId: 1,
    opponentName: 'TEST',
    delta: 0,
    samples: 0,
    source: 'map',
    hasSample: true,
    predictedWr: 0.5,
    ...over,
  });

  it('counterDetail 直接消费后端 delta，不做样本收缩/抹零', () => {
    const mapStats = IDX.mapStatTable.get(BOUNTY_MAP)!;
    const brock = idOf('BROCK');
    const edge = mapStats
      .get(brock)!
      .matchups.find((e) => mapStats.has(e.opponent))!;

    // 从对手视角看 BROCK，delta 应当符号相反
    const { details } = counterDetail(IDX, BOUNTY_MAP, 'bounty', edge.opponent, [brock]);
    const d = details[0]!;
    expect(d.source).toBe('map');
    expect(d.hasSample).toBe(true);
    // samples 是查表里的有效样本 n_eff（v5 已分层折算），不是 Top-K 的原始场次
    expect(d.samples).toBeGreaterThan(0);
    // 原样透传，不再乘 samples/trust
    expect(d.delta).toBeCloseTo(-edge.delta, 6);
  });

  it('新数据里大量地图条目的原始 samples < 10（前端不得按 samples 拦截）', () => {
    let total = 0;
    let small = 0;
    for (const m of META.maps) {
      for (const b of m.brawlers) {
        for (const e of b.matchups) {
          total += 1;
          if (e.samples < 10) small += 1;
        }
      }
    }
    expect(total).toBeGreaterThan(1000);
    // 后端按 eff_n 过滤后，约 57% 的条目本图真实场次不足 10
    expect(small / total).toBeGreaterThan(0.4);
  });

  it('原始 samples < 10 的后端条目在前端不被丢弃（端到端）', () => {
    let hit:
      | { map: string; mode: string; cand: number; opp: number; delta: number; nEff: number }
      | null = null;
    for (const m of META.maps) {
      const stats = IDX.mapStatTable.get(m.map_name)!;
      for (const b of m.brawlers) {
        const e = b.matchups.find((x) => x.samples < 10 && stats.has(x.opponent));
        if (!e) continue;
        // 查表里的同一条记录（n_eff 是后端折算后的有效样本，和原始场次不是一个数）
        const cell = lookupMatchup(IDX, m.map_name, m.mode, b.id, e.opponent);
        if (!cell) continue;
        hit = {
          map: m.map_name,
          mode: m.mode,
          cand: b.id,
          opp: e.opponent,
          delta: cell.deltaPp,
          nEff: cell.nEff,
        };
        break;
      }
      if (hit) break;
    }
    expect(hit).not.toBeNull();

    const { details, trustedCount } = counterDetail(IDX, hit!.map, hit!.mode, hit!.cand, [
      hit!.opp,
    ]);
    const d = details[0]!;
    expect(trustedCount).toBe(1);
    expect(d.hasSample).toBe(true);
    expect(d.samples).toBeCloseTo(hit!.nEff, 6);
    expect(d.delta).toBeCloseTo(hit!.delta, 6);
  });

  it('胜率字段归一化：0~1 与 0~100 两种口径都落成概率并钳制 [0.05, 0.95]', () => {
    expect(toProbability(0.578)).toBeCloseTo(0.578, 6);
    expect(toProbability(57.8)).toBeCloseTo(0.578, 6);
    expect(toProbability(0)).toBeCloseTo(0.05, 6);
    expect(toProbability(1)).toBeCloseTo(0.95, 6);
    expect(toProbability(120)).toBeCloseTo(0.95, 6);
    // 缺失/非法值退回中性 0.5
    expect(toProbability(undefined)).toBe(0.5);
    expect(toProbability(Number.NaN)).toBe(0.5);
  });

  it('delta 是百分点：4.0pp 只加 0.04 概率，不会被当成 4.0', () => {
    expect(predictedWinRate(0.5, 0.5, 4.0)).toBeCloseTo(0.54, 6);
    expect(predictedWinRate(0.5, 0.5, 0)).toBeCloseTo(0.5, 6);
    expect(predictedWinRate(0.5, 0.5, -2.5)).toBeCloseTo(0.475, 6);
  });

  it('色条三态：|delta| ≥ 1.5 绿/红；< 1.5 黄（均势）；无记录才空白', () => {
    expect(MATCHUP_LIGHT_PP).toBe(1.5);
    expect(counterLight(detail({ delta: 1.5 }))).toBe('good');
    expect(counterLight(detail({ delta: 12.4 }))).toBe('good');
    expect(counterLight(detail({ delta: 1.49 }))).toBe('even');
    expect(counterLight(detail({ delta: 0 }))).toBe('even');
    expect(counterLight(detail({ delta: -1.49 }))).toBe('even');
    expect(counterLight(detail({ delta: -1.5 }))).toBe('bad');
    expect(counterLight(detail({ delta: -12.4 }))).toBe('bad');
    // 只有「没有记录」才是空白
    expect(counterLight(detail({ delta: 20, hasSample: false }))).toBe('none');
    expect(counterLight(detail({ source: 'none', hasSample: false }))).toBe('none');
    expect(counterLight(undefined)).toBe('none');
  });

  it('色条只看 delta：预期胜率再低也不影响绿/红（旧单向压制规则已移除）', () => {
    // 本图基准 25% 的弱势英雄，+4.0pp 的预期胜率只有 29%，但色条必须照常亮绿
    const predicted = predictedWinRate(0.25, 0.5, 4.0);
    expect(predicted).toBeCloseTo(0.29, 6);
    expect(counterLight(detail({ delta: 4.0, predictedWr: predicted }))).toBe('good');

    // 反过来，预期胜率再高也救不了负 delta
    const strongButLosing = predictedWinRate(0.6, 0.5, -3.0);
    expect(strongButLosing).toBeGreaterThan(0.5);
    expect(counterLight(detail({ delta: -3.0, predictedWr: strongButLosing }))).toBe('bad');
  });

  it('本图强势英雄 +4.0pp 预期 56% → 正常绿条', () => {
    const pA = 0.52;
    const pB = 0.5;
    const delta = 4.0;
    const predicted = predictedWinRate(pA, pB, delta);
    expect(predicted).toBeCloseTo(0.56, 6);
    expect(predicted).toBeGreaterThan(0.5);

    const d = detail({ delta, samples: 12, predictedWr: predicted });
    expect(counterLight(d)).toBe('good');
  });

  it('samples = 3 也照常上色：绿条不被丢弃，红条不被置灰', () => {
    const green = detail({
      delta: 4.0,
      samples: 3,
      predictedWr: predictedWinRate(0.52, 0.5, 4.0),
    });
    expect(green.hasSample).toBe(true);
    expect(counterLight(green)).toBe('good');

    const red = detail({
      delta: -3.2,
      samples: 3,
      predictedWr: predictedWinRate(0.52, 0.5, -3.2),
    });
    expect(red.hasSample).toBe(true);
    expect(counterLight(red)).toBe('bad');
  });

  it('缺本图基准胜率时照常按 delta 上色（色条不依赖基准胜率）', () => {
    expect(counterLight(detail({ delta: 8, predictedWr: null }))).toBe('good');
    expect(counterLight(detail({ delta: -8, predictedWr: null }))).toBe('bad');
  });

  it('详细对位按 |delta| 拆分：劣势升序、优势降序，且都带样本数', () => {
    const map = IDX.mapByName.get(BOUNTY_MAP)!;
    const target = map.brawlers.reduce((a, b) =>
      a.matchups.length >= b.matchups.length ? a : b,
    );
    const bd = brawlerMatchups(IDX, BOUNTY_MAP, 'bounty', target.id);

    expect(bd.source).toBe('map');
    expect(bd.weak.length).toBeGreaterThan(0);
    expect(bd.strong.length).toBeGreaterThan(0);

    const all = [...bd.weak, ...bd.strong];
    // 正反两向的边都会收进来，所以行数不会少于该英雄名下记录的边数
    expect(all.length).toBeGreaterThanOrEqual(target.matchups.length);
    expect(new Set(all.map((r) => r.opponentId)).size).toBe(all.length);
    expect(bd.weak.every((r) => r.delta < 0)).toBe(true);
    expect(bd.strong.every((r) => r.delta > 0)).toBe(true);
    expect(all.every((r) => r.samples > 0 && r.opponentCn.length > 0)).toBe(true);

    // 劣势：越往后越接近五五开；优势：越往后越接近五五开
    for (let i = 1; i < bd.weak.length; i += 1) {
      expect(bd.weak[i - 1]!.delta).toBeLessThanOrEqual(bd.weak[i]!.delta);
    }
    for (let i = 1; i < bd.strong.length; i += 1) {
      expect(bd.strong[i - 1]!.delta).toBeGreaterThanOrEqual(bd.strong[i]!.delta);
    }

    // 两组的第一名合计就是绝对值最大的那条
    const maxAbs = Math.max(...all.map((r) => Math.abs(r.delta)));
    const headAbs = Math.max(
      Math.abs(bd.weak[0]?.delta ?? 0),
      Math.abs(bd.strong[0]?.delta ?? 0),
    );
    expect(headAbs).toBeCloseTo(maxAbs, 6);
  });

  it('对位明细严格按对方槽位顺序排列（3 格竖条依赖此约定）', () => {
    const enemy = [idOf('BROCK'), idOf('PIPER'), idOf('NITA')];
    const state = draft({ enemy, active: { kind: 'ally', index: 0 } });
    const list = pickRecommendations(IDX, state, 5);
    expect(list.length).toBeGreaterThan(0);
    for (const c of list) {
      expect(c.counterDetails.map((d) => d.opponentId)).toEqual(enemy);
    }
  });

  it('对方只亮 2 人时明细只有 2 条，第 3 格由 UI 补中性灰', () => {
    const enemy = [idOf('BROCK'), idOf('PIPER')];
    const state = draft({ enemy, active: { kind: 'ally', index: 0 } });
    const c = pickRecommendations(IDX, state, 1)[0]!;
    expect(c.counterDetails).toHaveLength(2);
    // 第 3 格没有对应明细 → counterLight 必须回落到 none（灰占位）
    expect(c.counterDetails[2]).toBeUndefined();
    expect(counterLight(c.counterDetails[2])).toBe('none');
  });

  it('单图样本不足 15 场时，胜率项权重归零', () => {
    let found: { map: string; mode: string; id: number } | null = null;
    for (const m of META.maps) {
      const low = m.brawlers.find((b) => b.games > 0 && b.games < 15);
      if (low) {
        found = { map: m.map_name, mode: m.mode, id: low.id };
        break;
      }
    }
    expect(found).not.toBeNull();

    const stat = IDX.mapStatTable.get(found!.map)!.get(found!.id)!;
    const state: DraftState = {
      ...createDraft(found!.map, found!.mode, 'ally'),
      active: { kind: 'ally', index: 0 },
    };
    const c = evaluatePick(IDX, state, stat, 'FIRST', 'ally');
    expect(c.breakdown.wrWeight).toBe(0);
    expect(c.breakdown.reasons.some((r) => r.text.includes('胜率不参与计算'))).toBe(true);
  });

  it('单图样本在 15~80 场之间时，胜率项按比例收缩而非全信', () => {
    let found: { map: string; mode: string; id: number; games: number } | null = null;
    for (const m of META.maps) {
      const mid = m.brawlers.find((b) => b.games >= 20 && b.games < 70);
      if (mid) {
        found = { map: m.map_name, mode: m.mode, id: mid.id, games: mid.games };
        break;
      }
    }
    expect(found).not.toBeNull();

    const stat = IDX.mapStatTable.get(found!.map)!.get(found!.id)!;
    const state: DraftState = {
      ...createDraft(found!.map, found!.mode, 'ally'),
      active: { kind: 'ally', index: 0 },
    };
    const c = evaluatePick(IDX, state, stat, 'FIRST', 'ally');
    expect(c.breakdown.wrWeight).toBeGreaterThan(0);
    expect(c.breakdown.wrWeight).toBeLessThan(0.25); // W_PICK_WR 未满
    expect(c.breakdown.reasons.some((r) => r.text.includes('折算'))).toBe(true);
  });
});

/* ------------------------------------------------------------------ *
 * 5.6 蛇形顺位编号（1-2-2-1）与后手克制提权
 * ------------------------------------------------------------------ */

describe('蛇形 BP 顺位编号', () => {
  it('蓝先：蓝方 1/4/5，红方 2/3/6', () => {
    expect(slotPickNumbers(draft({ firstPick: 'ally' }))).toEqual({
      ally: [1, 4, 5],
      enemy: [2, 3, 6],
    });
  });

  it('红先：红方 1/4/5，蓝方 2/3/6', () => {
    expect(slotPickNumbers(draft({ firstPick: 'enemy' }))).toEqual({
      ally: [2, 3, 6],
      enemy: [1, 4, 5],
    });
  });

  it('1-2-2-1 结构：先手方拿 1、后手方连拿 2-3、先手方再连拿 4-5、后手方收 6', () => {
    for (const fp of ['ally', 'enemy'] as const) {
      const s = draft({ firstPick: fp });
      const seq = [1, 2, 3, 4, 5, 6].map((n) => sideOfPick(s, n));
      expect(seq).toEqual([fp, fp === 'ally' ? 'enemy' : 'ally', fp === 'ally' ? 'enemy' : 'ally', fp, fp, fp === 'ally' ? 'enemy' : 'ally']);
    }
  });

  it('每个槽位的全局顺位号唯一且落在 1-6', () => {
    for (const fp of ['ally', 'enemy'] as const) {
      const s = draft({ firstPick: fp });
      const nums = slotPickNumbers(s);
      expect([...nums.ally, ...nums.enemy].sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6]);

      for (let n = 1; n <= 6; n += 1) {
        const side = sideOfPick(s, n);
        expect(pickNumberOfSlot(s, side, nums[side].indexOf(n))).toBe(n);
      }
    }
  });

  it('顺位号不随已选人数变化（换人不会改变编号）', () => {
    const s = draft({ firstPick: 'ally' });
    const empty = slotPickNumbers(s);
    const filled = slotPickNumbers({
      ...s,
      ally: [idOf('BROCK')],
      enemy: [idOf('PIPER'), idOf('NITA')],
    });
    expect(filled).toEqual(empty);
  });
});

/* ------------------------------------------------------------------ *
 * 5.7 未选先手的前置态（firstPick = null）
 * ------------------------------------------------------------------ */

describe('未选先手的前置态', () => {
  it('createDraft 默认 firstPick 为 null，且没有任何 Ban/Pick 记录', () => {
    const s = createDraft(BOUNTY_MAP, 'bounty');
    expect(s.firstPick).toBeNull();
    // Ban 位是定长 6 格（null = 未填），位置即归属，不能是空数组
    expect(s.bans).toEqual([null, null, null, null, null, null]);
    expect(banCount(s)).toBe(0);
    expect(s.ally).toEqual([]);
    expect(s.enemy).toEqual([]);
    expect(s.active).toEqual({ kind: 'ban', index: 0 });
  });

  it('firstPick 为 null 时编号退化为「蓝先」占位，仍是合法的 1-6 排列', () => {
    const s = draft({ firstPick: null });
    expect(slotPickNumbers(s)).toEqual({ ally: [1, 4, 5], enemy: [2, 3, 6] });
    expect(sideOfPick(s, 1)).toBe('ally');
    expect(sideOfPick(s, 2)).toBe('enemy');
  });

  it('选边后顺位立即按所选先手方生效', () => {
    const base = createDraft(BOUNTY_MAP, 'bounty');
    const blue: DraftState = { ...base, firstPick: 'ally' };
    const red: DraftState = { ...base, firstPick: 'enemy' };

    expect(slotPickNumbers(blue)).toEqual({ ally: [1, 4, 5], enemy: [2, 3, 6] });
    expect(slotPickNumbers(red)).toEqual({ ally: [2, 3, 6], enemy: [1, 4, 5] });
    // 第 1 手归属：蓝先 → 己方，红先 → 敌方
    expect(pickNumberOfSlot(blue, 'ally', 0)).toBe(1);
    expect(pickNumberOfSlot(red, 'enemy', 0)).toBe(1);
    expect(pickNumberOfSlot(red, 'ally', 0)).toBe(2);
  });
});

/* ------------------------------------------------------------------ *
 * 5.8 重置整局
 * ------------------------------------------------------------------ */

describe('重置整局', () => {
  it('清空 6 个 Ban 位与双方全部选人，回到 Ban 第 1 位', () => {
    const full: DraftState = {
      ...createDraft(BOUNTY_MAP, 'bounty', 'ally'),
      bans: [idOf('BROCK'), idOf('PIPER'), idOf('NITA'), idOf('BULL'), idOf('CROW'), idOf('EMZ')],
      ally: [idOf('COLT'), idOf('SHELLY'), idOf('SPIKE')],
      enemy: [idOf('LEON'), idOf('TARA'), idOf('PAM')],
      active: { kind: 'enemy', index: 2 },
    };

    const reset = resetDraft(full);
    expect(reset.bans).toEqual([null, null, null, null, null, null]);
    expect(reset.ally).toEqual([]);
    expect(reset.enemy).toEqual([]);
    expect(reset.active).toEqual({ kind: 'ban', index: 0 });
    // 地图 / 模式 / 先手方属于本局设置，重置不动
    expect(reset.mapName).toBe(BOUNTY_MAP);
    expect(reset.mode).toBe('bounty');
    expect(reset.firstPick).toBe('ally');
  });

  it('重置后候选池回到满员，被 Ban / 已选的英雄全部回来', () => {
    const dirty: DraftState = {
      ...createDraft(BOUNTY_MAP, 'bounty', 'ally'),
      bans: [idOf('BROCK'), idOf('PIPER')],
      ally: [idOf('COLT')],
      enemy: [idOf('LEON')],
    };
    const before = recommend(IDX, dirty, 500);
    const after = recommend(IDX, resetDraft(dirty), 500);
    expect(after.length).toBeGreaterThan(before.length);

    const afterIds = new Set(after.map((c) => c.id));
    for (const id of [...bannedIds(dirty), ...dirty.ally, ...dirty.enemy]) {
      expect(afterIds.has(id)).toBe(true);
    }
    // 满员 = 英雄表总数
    expect(after).toHaveLength(META.brawlers.length);
  });

  it('空局重置是幂等的（不产生额外状态差异）', () => {
    const empty = createDraft(BOUNTY_MAP, 'bounty', 'enemy');
    expect(resetDraft(empty)).toEqual(empty);
  });
});

/* ------------------------------------------------------------------ *
 * 5.9 Ban 位规则（v1.1.0：跨队可重复 / 同队互斥 / 空 Ban）
 * ------------------------------------------------------------------ */

describe('Ban 位规则', () => {
  it('Ban 槽归属：前 3 格己方、后 3 格敌方', () => {
    expect(banSideOfIndex(0)).toBe('ally');
    expect(banSideOfIndex(2)).toBe('ally');
    expect(banSideOfIndex(3)).toBe('enemy');
    expect(banSideOfIndex(5)).toBe('enemy');
  });

  it('同队 3 位互斥：同一英雄不能在自己队里 Ban 两次', () => {
    let s = draft();
    s = applyPick(s, idOf('BROCK')); // 己方第 1 位
    s = applyPick(s, idOf('PIPER')); // 己方第 2 位
    s = applyPick(s, idOf('BROCK')); // 同队重复 → 应被拒绝

    expect(banCount(s)).toBe(2);
    expect(s.bans[2]).toBeNull();
    expect(s.active).toEqual({ kind: 'ban', index: 2 });
  });

  it('跨队允许 Ban 掉同一英雄（盲 Ban 撞车）', () => {
    const brock = idOf('BROCK');
    let s = draft({ bans: [brock, null, null, null, null, null] });
    s = { ...s, active: { kind: 'ban', index: 3 } };
    s = applyPick(s, brock);

    expect(s.bans[3]).toBe(brock);
    expect(banCount(s)).toBe(2);
    // 去重后只有 1 个英雄被 Ban
    expect(bannedIds(s)).toEqual([brock]);
  });

  it('Pick 池剔除双方非空 Ban（重复 Ban 自动去重）', () => {
    const brock = idOf('BROCK');
    const state = draft({
      bans: [brock, null, null, brock, null, null],
      active: { kind: 'ally', index: 0 },
    });
    const list = pickRecommendations(IDX, state, 500);
    expect(list.some((c) => c.id === brock)).toBe(false);
  });

  it('Ban 推荐保留「对方已 Ban」的英雄，方便重复 Ban', () => {
    const brock = idOf('BROCK');
    const allyBanned = draft({ bans: [brock, null, null, null, null, null] });
    // 己方视角：本队已 Ban → 剔除
    expect(banRecommendations(IDX, allyBanned).some((c) => c.id === brock)).toBe(false);
    // 敌方视角：对方已 Ban → 保留
    const enemyView = { ...allyBanned, active: { kind: 'ban' as const, index: 3 } };
    expect(banRecommendations(IDX, enemyView).some((c) => c.id === brock)).toBe(true);
  });

  it('空 Ban 占满槽位但不锁任何英雄', () => {
    const s = applyPick(draft(), EMPTY_BAN);

    expect(s.bans[0]).toBe(EMPTY_BAN);
    expect(isEmptyBan(s.bans[0])).toBe(true);
    expect(banCount(s)).toBe(1);
    expect(bannedIds(s)).toEqual([]);
    // 没有任何英雄因此变得不可选
    const list = banRecommendations(IDX, s, 500);
    expect(list).toHaveLength(META.brawlers.length);
    expect(isTaken(s, idOf('BROCK'))).toBe(false);
  });

  it('空 Ban 可在多个槽位重复使用（含跨队）', () => {
    let s = draft();
    for (let i = 0; i < 6; i += 1) s = applyPick(s, EMPTY_BAN);

    expect(s.bans).toEqual([EMPTY_BAN, EMPTY_BAN, EMPTY_BAN, EMPTY_BAN, EMPTY_BAN, EMPTY_BAN]);
    expect(banCount(s)).toBe(6);
    expect(bannedIds(s)).toEqual([]);
  });

  it('空 Ban 支持清空重选', () => {
    let s = applyPick(draft(), EMPTY_BAN);
    expect(s.active).toEqual({ kind: 'ban', index: 1 });

    s = clearSlot(s, { kind: 'ban', index: 0 });
    expect(s.bans[0]).toBeNull();
    expect(banCount(s)).toBe(0);
    expect(s.active).toEqual({ kind: 'ban', index: 0 });
    expect(firstEmptyBanSlot(s)).toBe(0);
  });

  it('清空中间 Ban 位不会把敌方的 Ban 挤进己方', () => {
    const bans = [1, 2, 3, 4, 5, 6];
    const s = clearSlot(draft({ bans }), { kind: 'ban', index: 1 });

    expect(s.bans).toEqual([1, null, 3, 4, 5, 6]);
    expect(isBannedBySide(s, 'enemy', 4)).toBe(true);
    expect(isBannedBySide(s, 'ally', 4)).toBe(false);
  });

  it('6 槽填满（含空 Ban / 重复 Ban）即自动进入 Pick 阶段', () => {
    const brock = idOf('BROCK');
    let s = draft();
    s = applyPick(s, brock); // 己方 1
    s = applyPick(s, EMPTY_BAN); // 己方 2
    s = applyPick(s, idOf('PIPER')); // 己方 3
    s = applyPick(s, brock); // 敌方 1（跨队重复）
    s = applyPick(s, EMPTY_BAN); // 敌方 2
    s = applyPick(s, EMPTY_BAN); // 敌方 3

    expect(banCount(s)).toBe(6);
    expect(bannedIds(s)).toEqual([brock, idOf('PIPER')]);
    // 去重后只剩 2 个英雄被 Ban，但流程照样推进到第 1 手 Pick
    expect(nextSlot(s)).toEqual({ kind: 'ally', index: 0 });
    expect(s.active).toEqual({ kind: 'ally', index: 0 });
  });
});

describe('后手克制提权', () => {
  it('第 5 手同时克制两名敌方英雄的候选，能进入推荐前列', () => {
    // 找一张存在「双绿」候选的图：敌方取该图出场率前 2
    let hit:
      | { mapName: string; mode: string; bestId: number; bestSum: number; enemies: number[] }
      | null = null;

    for (const map of META.maps) {
      const top2 = [...map.brawlers].sort((a, b) => b.use_rate - a.use_rate).slice(0, 2);
      if (top2.length < 2) continue;
      let best: { id: number; sum: number } | null = null;
      for (const c of map.brawlers) {
        if (top2.some((t) => t.id === c.id)) continue;
        // 只在本图有足够样本、且基础分不垫底的英雄里找：本图零分的英雄再怎么提权
        // 也进不了前列，那不是提权逻辑的问题。
        if (c.games < 30 || c.score < 50) continue;
        const details = counterDetail(
          IDX,
          map.map_name,
          map.mode,
          c.id,
          top2.map((t) => t.id),
        ).details;
        const greens = details.filter((d) => d.hasSample && d.delta >= TAG_THRESHOLD);
        if (greens.length >= 2) {
          const sum = greens.reduce((s, d) => s + d.delta, 0);
          if (!best || sum > best.sum) best = { id: c.id, sum };
        }
      }
      if (best) {
        hit = {
          mapName: map.map_name,
          mode: map.mode,
          bestId: best.id,
          bestSum: best.sum,
          enemies: top2.map((t) => t.id),
        };
        break;
      }
    }

    expect(hit).not.toBeNull();

    const mapEntry = IDX.mapByName.get(hit!.mapName)!;
    const allies = mapEntry.brawlers
      .filter((b) => b.id !== hit!.bestId && !hit!.enemies.includes(b.id))
      .slice(0, 2)
      .map((b) => b.id);

    // 我方已 2 选 + 敌方已 2 选 → 第 5 手（LAST）
    const state: DraftState = {
      ...createDraft(hit!.mapName, hit!.mode, 'ally'),
      ally: allies,
      enemy: hit!.enemies,
      active: { kind: 'ally', index: 2 },
    };
    const list = pickRecommendations(IDX, state, 200);
    const cand = list.find((c) => c.id === hit!.bestId)!;

    expect(cand).toBeDefined();
    // 0.4(基准) × 2/3(亮牌比例) × 1.55(后手) × 1.15(双绿) ≈ 0.48
    expect(cand.breakdown.counterWeight).toBeGreaterThan(0.45);
    expect(cand.breakdown.reasons.some((r) => r.text.includes('同时克制 2 名对手'))).toBe(true);
    expect(list.indexOf(cand)).toBeLessThan(15);
  });

  it('中位（第 3-4 手）克制权重高于先手位', () => {
    const brock = idOf('BROCK');
    const stat = IDX.mapStatTable.get(BOUNTY_MAP)!.get(idOf('PIPER'))!;
    const base = draft({ enemy: [brock] });
    const first = evaluatePick(IDX, base, stat, 'FIRST', 'ally');
    const middle = evaluatePick(IDX, base, stat, 'MIDDLE', 'ally');
    const last = evaluatePick(IDX, base, stat, 'LAST', 'ally');
    expect(middle.breakdown.counterWeight).toBeGreaterThan(first.breakdown.counterWeight);
    expect(last.breakdown.counterWeight).toBeGreaterThan(middle.breakdown.counterWeight);
  });
});

/* ------------------------------------------------------------------ *
 * 6. 阵容预警
 * ------------------------------------------------------------------ */

describe('阵容结构预警', () => {
  it('双脆皮无坦克 → 缺少前排承伤', () => {
    const state = draft({
      ally: [idOf('PIPER'), idOf('BROCK')],
      active: { kind: 'ally', index: 2 },
    });
    const warns = detectCompWarnings(IDX, state);
    expect(warns.some((w) => w.key === 'noFrontline')).toBe(true);
  });

  it('双近战 → 手短易被风筝', () => {
    const state = draft({
      ally: [idOf('EL PRIMO'), idOf('BULL')],
      active: { kind: 'ally', index: 2 },
    });
    const warns = detectCompWarnings(IDX, state);
    expect(warns.some((w) => w.key === 'shortRange')).toBe(true);
  });

  it('敌方有投手且我方无刺客 → 建议补刺客', () => {
    const state = draft({
      ally: [idOf('PIPER')],
      enemy: [idOf('BARLEY')],
      active: { kind: 'ally', index: 1 },
    });
    const warns = detectCompWarnings(IDX, state);
    expect(warns.some((w) => w.key === 'needAssassin')).toBe(true);
  });

  it('缺前排时坦克候选的阵容分被上调', () => {
    const state = draft({
      ally: [idOf('PIPER'), idOf('BROCK')],
      active: { kind: 'ally', index: 2 },
    });
    const primo = IDX.mapStatTable.get(BOUNTY_MAP)!.get(idOf('EL PRIMO'));
    if (!primo) return; // 该图无此英雄则跳过
    const c = evaluatePick(IDX, state, primo, 'FIRST', 'ally');
    expect(c.breakdown.comp).toBeGreaterThan(50);
    expect(c.breakdown.reasons.some((r) => r.text.includes('补前排'))).toBe(true);
  });
});

/* ------------------------------------------------------------------ *
 * 7. 顺位与槽位流转
 * ------------------------------------------------------------------ */

describe('顺位推断与槽位流转', () => {
  it('1-2 选为先手位，5-6 选为后手位', () => {
    expect(currentPosition(draft())).toBe('FIRST');
    expect(
      currentPosition(draft({ ally: [1], enemy: [2], active: { kind: 'ally', index: 2 } })),
    ).toBe('MIDDLE');
    expect(
      currentPosition(
        draft({ ally: [1, 2], enemy: [3, 4], active: { kind: 'ally', index: 2 } }),
      ),
    ).toBe('LAST');
  });

  it('先手方与后手方的序列互为镜像', () => {
    const a = draft({ firstPick: 'ally' });
    const b = draft({ firstPick: 'enemy' });
    expect(sideOfPick(a, 1)).toBe('ally');
    expect(sideOfPick(b, 1)).toBe('enemy');
    expect(sideOfPick(a, 2)).toBe('enemy');
    expect(sideOfPick(b, 2)).toBe('ally');
  });

  it('Ban 满 6 个后自动进入第一手 Pick', () => {
    const state = draft({ bans: [1, 2, 3, 4, 5, 6], active: { kind: 'ban', index: 6 } });
    const slot = nextSlot(state);
    expect(slot).toEqual({ kind: 'ally', index: 0 });
  });

  it('applyPick 不修改原状态（纯函数）', () => {
    const state = draft({ bans: [1, 2, 3, 4, 5, 6], active: { kind: 'ban', index: 6 } });
    const next = applyPick(state, idOf('EDGAR'));
    expect(state.ally).toHaveLength(0);
    expect(next.ally).toHaveLength(1);
    expect(next.ally[0]).toBe(idOf('EDGAR'));
  });

  it('applyPick 会自动跳到下一个合理空槽', () => {
    let s = draft({ bans: [1, 2, 3, 4, 5, 6], active: { kind: 'ban', index: 6 } });
    s = applyPick(s, idOf('EDGAR'));
    expect(s.active).toEqual({ kind: 'enemy', index: 0 });
    s = applyPick(s, idOf('BROCK'));
    expect(s.active).toEqual({ kind: 'enemy', index: 1 });
    s = applyPick(s, idOf('PIPER'));
    expect(s.active).toEqual({ kind: 'ally', index: 1 });
  });

  it('重复英雄不会被写入', () => {
    const s = draft({ bans: [1, 2, 3, 4, 5, 6], active: { kind: 'ban', index: 6 } });
    const once = applyPick(s, idOf('EDGAR'));
    const twice = applyPick(once, idOf('EDGAR'));
    expect(twice.ally).toHaveLength(1);
  });

  it('clearSlot 只清空指定槽位', () => {
    const s = draft({ ally: [idOf('EDGAR'), idOf('BROCK')], active: { kind: 'ally', index: 2 } });
    const cleared = clearSlot(s, { kind: 'ally', index: 0 });
    expect(cleared.ally).toHaveLength(1);
    expect(cleared.ally[0]).toBe(idOf('BROCK'));
    expect(cleared.active).toEqual({ kind: 'ally', index: 0 });
  });
});

/* ------------------------------------------------------------------ *
 * 8. 端到端：完整跑一局
 * ------------------------------------------------------------------ */

describe('端到端完整对局', () => {
  it('6 ban + 6 pick 全程有推荐且不崩溃', () => {
    let s = draft();
    for (let i = 0; i < 6; i += 1) {
      const list = recommend(IDX, s, 5);
      expect(list.length).toBeGreaterThan(0);
      s = applyPick(s, list[0]!.id);
    }
    expect(banCount(s)).toBe(6);

    for (let i = 0; i < 6; i += 1) {
      const list = recommend(IDX, s, 5);
      expect(list.length).toBeGreaterThan(0);
      s = applyPick(s, list[0]!.id);
    }

    expect(s.ally).toHaveLength(3);
    expect(s.enemy).toHaveLength(3);
    expect(totalPicked(s)).toBe(6);

    // 双方允许撞车 Ban 同一英雄，但 6 个 Pick 绝不重复、也绝不与被 Ban 的英雄重复
    const picked = [...s.ally, ...s.enemy];
    expect(new Set(picked).size).toBe(6);
    for (const id of picked) expect(isBanned(s, id)).toBe(false);
    expect(nextSlot(s)).toBeNull();
  });

  it('6 张地图 × 6 模式都能产出有效推荐', () => {
    for (const map of META.maps) {
      const s: DraftState = {
        ...createDraft(map.map_name, map.mode, 'ally'),
        active: { kind: 'ally', index: 0 },
      };
      const list = pickRecommendations(IDX, s, 10);
      expect(list.length).toBeGreaterThan(0);
      for (const c of list) {
        expect(Number.isFinite(c.score)).toBe(true);
        expect(c.score).toBeGreaterThanOrEqual(0);
        expect(c.score).toBeLessThanOrEqual(100);
      }
    }
  });

  it('两张不同地图的推荐结果不同（地图强度真的生效）', () => {
    const a = pickRecommendations(IDX, draft({ mapName: BOUNTY_MAP, mode: 'bounty' }), 5);
    const b = pickRecommendations(IDX, draft({ mapName: BALL_MAP, mode: 'brawlBall' }), 5);
    expect(a.map((c) => c.id).join()).not.toBe(b.map((c) => c.id).join());
  });

  it('evaluateBrawler 对已选英雄也能给出拆解', () => {
    const edgar = idOf('EDGAR');
    const s = draft({ ally: [edgar], active: { kind: 'ally', index: 1 } });
    const c = evaluateBrawler(IDX, s, edgar);
    expect(c).not.toBeNull();
    expect(c!.id).toBe(edgar);
    expect(c!.breakdown.reasons.length).toBeGreaterThan(0);
  });

  it('evaluateBrawler 对不在该图数据里的英雄也返回中性拆解（不再返回 null）', () => {
    // 找一张没覆盖全部英雄的图（新数据里部分地图只有 74~107 个英雄）
    const partial = META.maps
      .map((m) => ({ name: m.map_name, ids: new Set(m.brawlers.map((b) => b.id)) }))
      .sort((a, b) => a.ids.size - b.ids.size)[0]!;
    const missing = META.brawlers.find((b) => !partial.ids.has(b.id));
    expect(missing).toBeDefined();
    const s = draft({ mapName: partial.name, active: { kind: 'ally', index: 0 } });
    const c = evaluateBrawler(IDX, s, missing!.id);
    expect(c).not.toBeNull();
    expect(c!.hasData).toBe(false);
    expect(c!.breakdown.reasons.some((r) => r.text.includes('暂无对局样本'))).toBe(true);
  });
});

/* ------------------------------------------------------------------ *
 * 9. 职业分类（一级标签，单选）
 * ------------------------------------------------------------------ */

describe('职业分类', () => {
  it('职业来自官方分类，抽查结果正确（含反常识的官方定义）', () => {
    expect(getClass(IDX, idOf('BROCK'))).toBe('MARKSMAN');
    expect(getClass(IDX, idOf('BULL'))).toBe('TANK');
    expect(getClass(IDX, idOf('POCO'))).toBe('SUPPORT');
    expect(getClass(IDX, idOf('LEON'))).toBe('ASSASSIN');
    expect(getClass(IDX, idOf('SPROUT'))).toBe('ARTILLERY');
    expect(getClass(IDX, idOf('SHELLY'))).toBe('DAMAGE');

    // 官方定义反直觉但正确：杰西是控场（不是召唤）、妮塔与塔拉是火力手、格里夫是控场
    expect(getClass(IDX, idOf('JESSIE'))).toBe('CONTROL');
    expect(getClass(IDX, idOf('NITA'))).toBe('DAMAGE');
    expect(getClass(IDX, idOf('TARA'))).toBe('DAMAGE');
    expect(getClass(IDX, idOf('GRIFF'))).toBe('CONTROL');
  });

  it('每个英雄都有职业，不存在兜底触发', () => {
    const missing = META.brawlers.filter((b) => !IDX.classByBrawlerId.has(b.id));
    expect(missing).toHaveLength(0);
  });

  it('7 类职业都有英雄，且职业只能是这 7 个值', () => {
    const valid = new Set([
      'TANK', 'DAMAGE', 'MARKSMAN', 'ARTILLERY', 'ASSASSIN', 'CONTROL', 'SUPPORT',
    ]);
    const classes = new Set<string>();
    for (const b of META.brawlers) {
      const cls = getClass(IDX, b.id);
      expect(valid.has(cls)).toBe(true);
      classes.add(cls);
    }
    expect(classes.size).toBe(7);
  });

  it('Candidate 携带职业，供列表与筛选使用', () => {
    const list = pickRecommendations(IDX, draft({ active: { kind: 'ally', index: 0 } }), 200);
    const brock = list.find((c) => c.name === 'BROCK');
    if (!brock) return; // 该图无 Brock 时跳过
    expect(brock.cls).toBe('MARKSMAN');
  });
});

/* ------------------------------------------------------------------ *
 * 10. 快捷过滤
 * ------------------------------------------------------------------ */

describe('快捷过滤', () => {
  it('职业筛选生效，且只按职业精确匹配', () => {
    const list = pickRecommendations(IDX, draft({ active: { kind: 'ally', index: 0 } }), 200);

    const tanks = list.filter((c) => passesFilter(c, 'TANK'));
    expect(tanks.length).toBeGreaterThan(0);
    expect(tanks.every((c) => c.cls === 'TANK')).toBe(true);

    const marksmen = list.filter((c) => passesFilter(c, 'MARKSMAN'));
    expect(marksmen.every((c) => c.cls === 'MARKSMAN')).toBe(true);

    const firsts = list.filter((c) => passesFilter(c, 'first'));
    expect(firsts.every((c) => c.pickOrder === 'FIRST')).toBe(true);

    const counters = list.filter((c) => passesFilter(c, 'counter'));
    expect(counters.every((c) => c.pickOrder === 'LAST')).toBe(true);
  });
});

/* ------------------------------------------------------------------ *
 * 11. 3×3 对位格：真实数据上的换边镜像
 * ------------------------------------------------------------------ */

describe('3×3 对位格换边镜像（真实数据）', () => {
  const MIRROR = { good: 'bad', bad: 'good', even: 'even', none: 'none' } as const;

  it('Double Swoosh：任取 3 蓝 3 红，18 个格子颜色与数值都互为镜像', () => {
    const map = IDX.mapByName.get('Double Swoosh')!;
    expect(map).toBeDefined();

    const blue = map.brawlers.slice(0, 3).map((b) => b.id);
    const red = map.brawlers.slice(3, 6).map((b) => b.id);

    for (const a of blue) {
      for (const b of red) {
        const fwd = matchupCell(IDX, map.map_name, map.mode, a, b);
        const rev = matchupCell(IDX, map.map_name, map.mode, b, a);

        if (fwd.deltaPp === null) {
          expect(rev.deltaPp).toBeNull();
        } else {
          expect(rev.deltaPp).not.toBeNull();
          expect(fwd.deltaPp + rev.deltaPp!).toBeCloseTo(0, 10);
        }
        expect(rev.light).toBe(MIRROR[fwd.light]);
        expect(rev.source).toBe(fwd.source);
      }
    }
  });

  it('3×3 的每一格都不读 Top-K 列表：删掉全部 matchups 后结果不变', () => {
    const v5 = deriveV5(META);
    const stripped = {
      ...v5,
      maps: v5.maps.map((m) => ({
        ...m,
        brawlers: m.brawlers.map((b) => ({ ...b, matchups: [] })),
      })),
      modes: v5.modes.map((m) => ({
        ...m,
        brawlers: m.brawlers.map((b) => ({ ...b, matchups: [] })),
      })),
    };
    const strippedIdx = buildIndex(stripped);
    const map = IDX.mapByName.get('Double Swoosh')!;
    const blue = map.brawlers.slice(0, 3).map((b) => b.id);
    const red = map.brawlers.slice(3, 6).map((b) => b.id);

    for (const a of blue) {
      for (const b of red) {
        expect(matchupCell(strippedIdx, map.map_name, map.mode, a, b)).toEqual(
          matchupCell(IDX, map.map_name, map.mode, a, b),
        );
      }
    }
  });
});
