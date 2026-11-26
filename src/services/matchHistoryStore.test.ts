import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EMPTY_BAN, applyPick, createDraft, type DraftState } from '../utils/draftEngine';
import {
  MATCH_HISTORY_LIMIT,
  MATCH_HISTORY_SCHEMA_VERSION,
  MATCH_HISTORY_STORAGE_KEY,
  addMatch,
  buildMatchFromDraft,
  createMatchRecord,
  deleteMatch,
  draftSignature,
  formatWanInput,
  loadMatchHistory,
  normalizeMatchRecord,
  objectiveIsWan,
  objectiveKindOf,
  parseStatInput,
  parseWanInput,
  sanitizeWanTyping,
  summarizeHistory,
  updateMatch,
  writeMatchHistory,
  type MatchRecord,
} from './matchHistoryStore';

/**
 * 历史对局存储的守卫测试。
 *
 * 重点不是「UI 好不好看」，而是三条会直接影响下一阶段复盘引擎的硬约束：
 *   1. `null`（没填）与 `0`（真的是 0）必须原样往返，不能被兜底成同一个值；
 *   2. 损坏 / 脏数据只能降级成「读不到这一条」，绝不能抛错或污染其他记录；
 *   3. 上限裁剪、胜负比分自洽、唯一「我 / 最佳」这些不变量在写入后仍然成立。
 */

const BASE_TS = 1_700_000_000_000;

/** 内存版 localStorage：Node 环境没有 window，用 stubGlobal 顶替 */
function installFakeStorage(): Map<string, string> {
  const data = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    get length() {
      return data.size;
    },
    clear: () => data.clear(),
    getItem: (key: string) => (data.has(key) ? data.get(key)! : null),
    key: (index: number) => Array.from(data.keys())[index] ?? null,
    removeItem: (key: string) => {
      data.delete(key);
    },
    setItem: (key: string, value: string) => {
      data.set(key, value);
    },
  });
  return data;
}

/** 一局完整的 6 手 BP：我方先手 → 顺位 1/4/5，敌方 2/3/6 */
function completedDraft(): DraftState {
  // 先把 6 个 Ban 位填满（含空 Ban），BP 才会推进到选人阶段
  const base = createDraft('Shooting Star', 'bounty', 'ally');
  let state: DraftState = { ...base, bans: [EMPTY_BAN, 301, 302, EMPTY_BAN, EMPTY_BAN, EMPTY_BAN] };
  for (const id of [101, 201, 202, 102, 103, 203]) state = applyPick(state, id);
  return state;
}

function baseRecord(now = BASE_TS): MatchRecord {
  return buildMatchFromDraft(completedDraft(), now);
}

beforeEach(() => {
  installFakeStorage();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

/* ------------------------------------------------------------------ *
 * 1. 建记录
 * ------------------------------------------------------------------ */

describe('从 BP 状态建记录', () => {
  it('默认是待补录：result=pending / score=null / 战绩全为 null', () => {
    const record = baseRecord();
    expect(record.result).toBe('pending');
    expect(record.score).toBeNull();
    expect(record.allyStats).toHaveLength(3);
    for (const stat of record.allyStats) {
      expect(stat.kills).toBeNull();
      expect(stat.deaths).toBeNull();
      expect(stat.damage).toBeNull();
      expect(stat.isSelf).toBe(false);
      expect(stat.isStarPlayer).toBe(false);
    }
  });

  it('保留规范 ID 与蛇形顺位，Ban 里的「空 Ban」不落盘', () => {
    const record = baseRecord();
    expect(record.mapId).toBe('Shooting Star');
    expect(record.mode).toBe('bounty');
    expect(record.firstPick).toBe('ally');
    expect(record.bans).toEqual(['301', '302']);
    expect(record.allyPicks).toEqual([
      { brawlerId: '101', pickOrder: 1 },
      { brawlerId: '102', pickOrder: 4 },
      { brawlerId: '103', pickOrder: 5 },
    ]);
    expect(record.enemyPicks.map((p) => p.pickOrder)).toEqual([2, 3, 6]);
  });

  it('战绩数组与 allyPicks 一一对应', () => {
    const record = baseRecord();
    expect(record.allyStats.map((s) => s.brawlerId)).toEqual(
      record.allyPicks.map((p) => p.brawlerId),
    );
  });

  it('敌方战绩默认补齐 3 条，且与 enemyPicks 一一对应', () => {
    const record = baseRecord();
    expect(record.enemyStats).toHaveLength(3);
    expect(record.enemyStats.map((s) => s.brawlerId)).toEqual(
      record.enemyPicks.map((p) => p.brawlerId),
    );
    for (const stat of record.enemyStats) {
      expect(stat.kills).toBeNull();
      expect(stat.deaths).toBeNull();
      expect(stat.damage).toBeNull();
      expect(stat.isStarPlayer).toBe(false);
      // 敌方没有「我」
      expect('isSelf' in stat).toBe(false);
    }
  });

  it('敌方先手时顺位镜像（我方 2/3/6）', () => {
    const base = createDraft('Hideout', 'gemGrab', 'enemy');
    let state: DraftState = {
      ...base,
      bans: [EMPTY_BAN, EMPTY_BAN, EMPTY_BAN, EMPTY_BAN, EMPTY_BAN, EMPTY_BAN],
    };
    // 敌方先手：敌(1) → 我(2) → 我(3) → 敌(4) → 敌(5) → 我(6)
    for (const id of [201, 101, 102, 203, 202, 103]) state = applyPick(state, id);
    const record = buildMatchFromDraft(state, BASE_TS);
    expect(record.firstPick).toBe('enemy');
    expect(record.allyPicks.map((p) => p.brawlerId)).toEqual(['101', '102', '103']);
    expect(record.allyPicks.map((p) => p.pickOrder)).toEqual([2, 3, 6]);
    expect(record.enemyPicks.map((p) => p.brawlerId)).toEqual(['201', '203', '202']);
    expect(record.enemyPicks.map((p) => p.pickOrder)).toEqual([1, 4, 5]);
  });

  it('同一局的指纹稳定，改动任意一项都会变', () => {
    const draft = completedDraft();
    expect(draftSignature(draft)).toBe(draftSignature({ ...draft }));
    expect(draftSignature(draft)).not.toBe(draftSignature({ ...draft, ally: [999, 102, 103] }));
    expect(draftSignature(draft)).not.toBe(draftSignature({ ...draft, mapName: 'Hideout' }));
  });
});

/* ------------------------------------------------------------------ *
 * 2. 持久化往返
 * ------------------------------------------------------------------ */

describe('localStorage 持久化', () => {
  it('写入带 schemaVersion 的信封，读回结构一致', () => {
    const data = installFakeStorage();
    const record = baseRecord();
    expect(writeMatchHistory([record])).toBe(true);

    const raw = JSON.parse(data.get(MATCH_HISTORY_STORAGE_KEY)!);
    expect(raw.schemaVersion).toBe(MATCH_HISTORY_SCHEMA_VERSION);
    expect(raw.records).toHaveLength(1);

    expect(loadMatchHistory()).toEqual([record]);
  });

  it('0 与 null 严格区分：0 杀原样保留，未填仍是 null', () => {
    const original = baseRecord();
    const record = updateMatch([original], original.id, {
      result: 'win',
      score: '2:0',
      allyStats: [
        {
          brawlerId: '101',
          kills: 0,
          deaths: 0,
          damage: 0,
          healing: 0,
          damageTaken: 0,
          objectiveValue: 0,
          isSelf: true,
          isStarPlayer: false,
        },
        {
          brawlerId: '102',
          kills: 7,
          deaths: null,
          damage: 12345,
          healing: 8000,
          damageTaken: 21000,
          objectiveValue: 2,
          isSelf: false,
          isStarPlayer: true,
        },
        {
          brawlerId: '103',
          kills: null,
          deaths: null,
          damage: null,
          healing: null,
          damageTaken: null,
          objectiveValue: null,
          isSelf: false,
          isStarPlayer: false,
        },
      ],
    })[0]!;

    writeMatchHistory([record]);
    const [loaded] = loadMatchHistory();
    expect(loaded!.allyStats[0]).toEqual({
      brawlerId: '101',
      kills: 0,
      deaths: 0,
      damage: 0,
      healing: 0,
      damageTaken: 0,
      objectiveValue: 0,
      isSelf: true,
      isStarPlayer: false,
    });
    expect(loaded!.allyStats[1]!.kills).toBe(7);
    expect(loaded!.allyStats[1]!.deaths).toBeNull();
    expect(loaded!.allyStats[1]!.healing).toBe(8000);
    expect(loaded!.allyStats[1]!.damageTaken).toBe(21000);
    expect(loaded!.allyStats[1]!.objectiveValue).toBe(2);
    expect(loaded!.allyStats[2]!.kills).toBeNull();
    expect(loaded!.allyStats[2]!.healing).toBeNull();
  });

  it('损坏的 JSON 读成空数组，不抛错', () => {
    const data = installFakeStorage();
    data.set(MATCH_HISTORY_STORAGE_KEY, '{not json');
    expect(() => loadMatchHistory()).not.toThrow();
    expect(loadMatchHistory()).toEqual([]);
  });

  it('结构不认识（不是数组 / 没有 records）也读成空数组', () => {
    const data = installFakeStorage();
    data.set(MATCH_HISTORY_STORAGE_KEY, JSON.stringify({ hello: 'world' }));
    expect(loadMatchHistory()).toEqual([]);
    data.set(MATCH_HISTORY_STORAGE_KEY, JSON.stringify(42));
    expect(loadMatchHistory()).toEqual([]);
  });

  it('单条记录损坏时只跳过这一条，其余照常读出', () => {
    const good = baseRecord();
    const data = installFakeStorage();
    data.set(
      MATCH_HISTORY_STORAGE_KEY,
      JSON.stringify({
        schemaVersion: MATCH_HISTORY_SCHEMA_VERSION,
        records: [good, null, 'oops', { id: 'x' }, { ...good, id: 'kept-2', createdAt: BASE_TS + 10 }],
      }),
    );
    const loaded = loadMatchHistory();
    expect(loaded.map((r) => r.id)).toEqual(['kept-2', good.id]);
  });

  it('旧记录缺少 enemyStats：读取时补齐 3 条空数据，记录不丢', () => {
    const legacy = { ...baseRecord() } as Record<string, unknown>;
    delete legacy.enemyStats;

    const data = installFakeStorage();
    data.set(
      MATCH_HISTORY_STORAGE_KEY,
      JSON.stringify({ schemaVersion: MATCH_HISTORY_SCHEMA_VERSION, records: [legacy] }),
    );

    const loaded = loadMatchHistory();
    expect(loaded).toHaveLength(1);
    const record = loaded[0]!;
    expect(record.id).toBe(legacy.id);
    expect(record.allyStats).toHaveLength(3);
    expect(record.enemyStats).toHaveLength(3);
    expect(record.enemyStats.map((s) => s.brawlerId)).toEqual(
      record.enemyPicks.map((p) => p.brawlerId),
    );
    for (const stat of record.enemyStats) {
      expect(stat.kills).toBeNull();
      expect(stat.deaths).toBeNull();
      expect(stat.damage).toBeNull();
      expect(stat.isStarPlayer).toBe(false);
    }
  });

  it('写入时同样保证 6 人「最佳」互斥（脏数据落盘即被清洗）', () => {
    const record = baseRecord();
    const dirty: MatchRecord = {
      ...record,
      allyStats: record.allyStats.map((s) => ({ ...s, isStarPlayer: true })),
      enemyStats: record.enemyStats.map((s) => ({ ...s, isStarPlayer: true })),
    };
    writeMatchHistory([dirty]);
    const [loaded] = loadMatchHistory();
    const stars = [...loaded!.allyStats, ...loaded!.enemyStats].filter((s) => s.isStarPlayer);
    expect(stars).toHaveLength(1);
  });

  it('没有 localStorage 时读写都安全降级', () => {
    vi.unstubAllGlobals();
    vi.stubGlobal('localStorage', undefined);
    expect(loadMatchHistory()).toEqual([]);
    expect(writeMatchHistory([baseRecord()])).toBe(false);
  });
});

/* ------------------------------------------------------------------ *
 * 3. 增 / 改 / 删
 * ------------------------------------------------------------------ */

describe('增删改', () => {
  it('新记录排在最前，重复 id 只保留一条', () => {
    const a = baseRecord(BASE_TS);
    const b = baseRecord(BASE_TS + 1000);
    const list = addMatch(addMatch([], a), b);
    expect(list.map((r) => r.id)).toEqual([b.id, a.id]);
    expect(addMatch(list, b)).toHaveLength(2);
  });

  it('更新会刷新 updatedAt 并重新做自洽校验', () => {    const record = baseRecord();
    const [updated] = updateMatch([record], record.id, {
      result: 'win',
      score: '2:0',
      allyStats: record.allyStats.map((s) => ({ ...s, kills: 3 })),
    }, BASE_TS + 5000);

    expect(updated!.result).toBe('win');
    expect(updated!.score).toBe('2:0');
    expect(updated!.updatedAt).toBe(BASE_TS + 5000);
    expect(updated!.createdAt).toBe(BASE_TS);
    expect(updated!.allyStats.map((s) => s.kills)).toEqual([3, 3, 3]);
  });

  it('胜 + 负比分这种不自洽组合退回待补录', () => {
    const record = baseRecord();
    const [updated] = updateMatch([record], record.id, { result: 'win', score: '1:2' });
    expect(updated!.result).toBe('pending');
    expect(updated!.score).toBeNull();
  });

  it('只给 result 不给 score 也算未完成', () => {
    const record = baseRecord();
    const [updated] = updateMatch([record], record.id, { result: 'loss' });
    expect(updated!.result).toBe('pending');
    expect(updated!.score).toBeNull();
  });

  it('可以单独更新敌方战绩，且不影响我方', () => {
    const record = baseRecord();
    const [updated] = updateMatch([record], record.id, {
      result: 'loss',
      score: '1:2',
      enemyStats: record.enemyPicks.map((pick, i) => ({
        brawlerId: pick.brawlerId,
        kills: 6 + i,
        deaths: 2,
        damage: 20000,
        healing: 4000,
        damageTaken: 18000,
        objectiveValue: 3,
        isStarPlayer: i === 1,
      })),
    });
    expect(updated!.result).toBe('loss');
    expect(updated!.enemyStats.map((s) => s.kills)).toEqual([6, 7, 8]);
    expect(updated!.enemyStats[0]!.healing).toBe(4000);
    expect(updated!.enemyStats[0]!.objectiveValue).toBe(3);
    expect(updated!.enemyStats[1]!.isStarPlayer).toBe(true);
    expect(updated!.allyStats.every((s) => s.kills === null)).toBe(true);
  });

  it('删除只影响目标记录', () => {
    const a = baseRecord(BASE_TS);
    const b = baseRecord(BASE_TS + 1000);
    const list = addMatch(addMatch([], a), b);
    expect(deleteMatch(list, a.id).map((r) => r.id)).toEqual([b.id]);
    expect(deleteMatch(list, 'nope')).toHaveLength(2);
  });
});

/* ------------------------------------------------------------------ *
 * 4. 上限裁剪
 * ------------------------------------------------------------------ */

describe('上限裁剪', () => {
  it(`超过 ${MATCH_HISTORY_LIMIT} 场只保留最新的一批`, () => {
    let list: MatchRecord[] = [];
    for (let i = 0; i < MATCH_HISTORY_LIMIT + 25; i += 1) {
      list = addMatch(list, createMatchRecord({
        mapId: 'Shooting Star',
        mode: 'bounty',
        firstPick: 'ally',
        bans: [],
        allyPicks: [],
        enemyPicks: [],
        now: BASE_TS + i * 1000,
      }));
    }
    expect(list).toHaveLength(MATCH_HISTORY_LIMIT);
    // 最新的在最前，最旧的 25 条被裁掉
    expect(list[0]!.createdAt).toBe(BASE_TS + (MATCH_HISTORY_LIMIT + 24) * 1000);
    expect(list[MATCH_HISTORY_LIMIT - 1]!.createdAt).toBe(BASE_TS + 25 * 1000);
  });

  it('落盘时同样按上限裁剪（防止旧数据撑爆配额）', () => {
    const records = Array.from({ length: MATCH_HISTORY_LIMIT + 10 }, (_, i) =>
      createMatchRecord({
        mapId: 'Hideout',
        mode: 'gemGrab',
        firstPick: 'ally',
        bans: [],
        allyPicks: [],
        enemyPicks: [],
        now: BASE_TS + i * 1000,
      }),
    );
    writeMatchHistory(records);
    expect(loadMatchHistory()).toHaveLength(MATCH_HISTORY_LIMIT);
  });
});

/* ------------------------------------------------------------------ *
 * 5. 归一化细节
 * ------------------------------------------------------------------ */

describe('归一化', () => {
  it('「我」「最佳」各最多保留 1 人', () => {
    const record = baseRecord();
    const normalized = normalizeMatchRecord({
      ...record,
      allyStats: record.allyPicks.map((p) => ({
        brawlerId: p.brawlerId,
        kills: 1,
        deaths: 1,
        damage: 1,
        isSelf: true,
        isStarPlayer: true,
      })),
    });
    expect(normalized!.allyStats.filter((s) => s.isSelf)).toHaveLength(1);
    expect(normalized!.allyStats.filter((s) => s.isStarPlayer)).toHaveLength(1);
  });

  it('缺 id / mapId 的记录视为无效', () => {
    expect(normalizeMatchRecord({ mapId: 'Hideout' })).toBeNull();
    expect(normalizeMatchRecord({ id: 'a' })).toBeNull();
    expect(normalizeMatchRecord(null)).toBeNull();
  });

  it('战绩长度始终对齐 allyPicks（多出的截断，缺的补 null）', () => {
    const record = baseRecord();
    const normalized = normalizeMatchRecord({
      ...record,
      allyStats: [{ brawlerId: '101', kills: 5, deaths: 2, damage: 900, isSelf: true }],
    })!;
    expect(normalized.allyStats).toHaveLength(3);
    expect(normalized.allyStats[0]!.kills).toBe(5);
    expect(normalized.allyStats[1]!.kills).toBeNull();
    expect(normalized.allyStats[1]!.isSelf).toBe(false);
  });

  it('敌方战绩按 enemyPicks 对齐（长度与 brawlerId 都以选人为准）', () => {
    const record = baseRecord();
    const normalized = normalizeMatchRecord({
      ...record,
      enemyStats: [{ brawlerId: '999999', kills: 4, deaths: 1, damage: 8000, isStarPlayer: false }],
    })!;
    expect(normalized.enemyStats).toHaveLength(3);
    expect(normalized.enemyStats.map((s) => s.brawlerId)).toEqual(
      record.enemyPicks.map((p) => p.brawlerId),
    );
    expect(normalized.enemyStats[0]!.kills).toBe(4);
    expect(normalized.enemyStats[1]!.kills).toBeNull();
  });

  it('「最佳」跨双方互斥：我方已占用时，敌方的标记被清除', () => {
    const record = baseRecord();
    const normalized = normalizeMatchRecord({
      ...record,
      allyStats: record.allyStats.map((s, i) => ({ ...s, isStarPlayer: i === 0 })),
      enemyStats: record.enemyStats.map((s, i) => ({ ...s, isStarPlayer: i === 1 })),
    })!;

    const stars = [...normalized.allyStats, ...normalized.enemyStats].filter(
      (s) => s.isStarPlayer,
    );
    expect(stars).toHaveLength(1);
    expect(stars[0]!.brawlerId).toBe(normalized.allyStats[0]!.brawlerId);
  });

  it('只有敌方标了「最佳」时正常保留', () => {
    const record = baseRecord();
    const normalized = normalizeMatchRecord({
      ...record,
      allyStats: record.allyStats.map((s) => ({ ...s, isStarPlayer: false })),
      enemyStats: record.enemyStats.map((s, i) => ({ ...s, isStarPlayer: i === 2 })),
    })!;

    const stars = [...normalized.allyStats, ...normalized.enemyStats].filter(
      (s) => s.isStarPlayer,
    );
    expect(stars).toHaveLength(1);
    expect(stars[0]!.brawlerId).toBe(normalized.enemyStats[2]!.brawlerId);
  });
});

/* ------------------------------------------------------------------ *
 * 6. 概览统计
 * ------------------------------------------------------------------ */

describe('战绩概览', () => {
  it('胜率只算已完赛，pending 不进分母', () => {
    const list = [
      { ...baseRecord(BASE_TS + 3), result: 'win' as const, score: '2:0' as const },
      { ...baseRecord(BASE_TS + 2), result: 'win' as const, score: '2:1' as const },
      { ...baseRecord(BASE_TS + 1), result: 'loss' as const, score: '1:2' as const },
      baseRecord(BASE_TS),
    ];
    const summary = summarizeHistory(list);
    expect(summary.total).toBe(4);
    expect(summary.completed).toBe(3);
    expect(summary.pending).toBe(1);
    expect(summary.winRate).toBeCloseTo(2 / 3, 6);
  });

  it('全是待补录时胜率为 null（界面显示占位符，不显示 0%）', () => {
    const summary = summarizeHistory([baseRecord()]);
    expect(summary.winRate).toBeNull();
    expect(summary.pending).toBe(1);
  });

  it('空列表返回全零', () => {
    expect(summarizeHistory([])).toEqual({
      total: 0,
      completed: 0,
      wins: 0,
      losses: 0,
      pending: 0,
      winRate: null,
    });
  });
});

/* ------------------------------------------------------------------ *
 * 7. 输入框解析
 * ------------------------------------------------------------------ */

describe('战绩输入解析', () => {
  it('空串是「没填」（null），"0" 是真的 0', () => {
    expect(parseStatInput('')).toBeNull();
    expect(parseStatInput('   ')).toBeNull();
    expect(parseStatInput('0')).toBe(0);
    expect(parseStatInput('0')).not.toBeNull();
  });

  it('负数 / 小数 / 非法字符一律视为没填', () => {
    expect(parseStatInput('-1')).toBeNull();
    expect(parseStatInput('1.5')).toBeNull();
    expect(parseStatInput('12a')).toBeNull();
    expect(parseStatInput('abc')).toBeNull();
  });

  it('正常整数原样返回', () => {
    expect(parseStatInput('12')).toBe(12);
    expect(parseStatInput(' 9000 ')).toBe(9000);
  });
});

/* ------------------------------------------------------------------ *
 * 8. 「万」单位换算
 * ------------------------------------------------------------------ */

describe('万单位换算', () => {
  it('原始整数 → 输入框文本：最多 2 位小数，去掉尾零', () => {
    expect(formatWanInput(80200)).toBe('8.02');
    expect(formatWanInput(80000)).toBe('8');
    expect(formatWanInput(82000)).toBe('8.2');
    expect(formatWanInput(0)).toBe('0');
    expect(formatWanInput(9999)).toBe('1'); // 0.9999 万 → 1（四舍五入到 2 位）
    expect(formatWanInput(null)).toBe('');
  });

  it('输入框文本 → 原始整数：空串 / 非法 / 负数都是 null', () => {
    expect(parseWanInput('8.02')).toBe(80200);
    expect(parseWanInput('8')).toBe(80000);
    expect(parseWanInput('8.')).toBe(80000);
    expect(parseWanInput('0')).toBe(0);
    expect(parseWanInput('')).toBeNull();
    expect(parseWanInput('   ')).toBeNull();
    expect(parseWanInput('.')).toBeNull();
    expect(parseWanInput('-1')).toBeNull();
    expect(parseWanInput('8.02万')).toBeNull();
  });

  it('换算精度：两位小数足够，浮点误差被 Math.round 吃掉', () => {
    expect(parseWanInput('8.02')).toBe(80200);
    expect(parseWanInput('1.23')).toBe(12300);
    expect(parseWanInput('0.01')).toBe(100);
    // 1.15 * 10000 在浮点里是 11499.999...，必须四舍五入回 11500
    expect(parseWanInput('1.15')).toBe(11500);
  });

  it('输入过程清洗：只留数字与一个小数点，小数最多 2 位', () => {
    expect(sanitizeWanTyping('8.0234')).toBe('8.02');
    expect(sanitizeWanTyping('8..2')).toBe('8.2');
    expect(sanitizeWanTyping('a8b')).toBe('8');
    expect(sanitizeWanTyping('8.')).toBe('8.');
    expect(sanitizeWanTyping('')).toBe('');
  });
});

/* ------------------------------------------------------------------ *
 * 9. 模式专属指标映射
 * ------------------------------------------------------------------ */

describe('模式专属指标', () => {
  it('六种模式各对应一项；淘汰赛没有第 5 项', () => {
    expect(objectiveKindOf('brawlBall')).toBe('goals');
    expect(objectiveKindOf('hotZone')).toBe('zoneSeconds');
    expect(objectiveKindOf('bounty')).toBe('stars');
    expect(objectiveKindOf('heist')).toBe('safeDamage');
    expect(objectiveKindOf('gemGrab')).toBe('gems');
    expect(objectiveKindOf('knockout')).toBeNull();
    expect(objectiveKindOf('unknownMode')).toBeNull();
  });

  it('只有金库伤害按「万」录入', () => {
    expect(objectiveIsWan('safeDamage')).toBe(true);
    expect(objectiveIsWan('goals')).toBe(false);
    expect(objectiveIsWan('zoneSeconds')).toBe(false);
    expect(objectiveIsWan('stars')).toBe(false);
    expect(objectiveIsWan('gems')).toBe(false);
    expect(objectiveIsWan(null)).toBe(false);
  });
});

/* ------------------------------------------------------------------ *
 * 10. V1 字段的旧数据迁移
 * ------------------------------------------------------------------ */

describe('V1 指标迁移', () => {
  it('旧记录缺 healing / damageTaken / objectiveValue 时补 null，记录不丢', () => {
    const legacy = JSON.parse(JSON.stringify(baseRecord())) as Record<string, unknown>;
    const allyStats = (legacy.allyStats as Array<Record<string, unknown>>).map((stat) => {
      const copy = { ...stat };
      delete copy.healing;
      delete copy.damageTaken;
      delete copy.objectiveValue;
      return copy;
    });
    const enemyStats = (legacy.enemyStats as Array<Record<string, unknown>>).map((stat) => {
      const copy = { ...stat };
      delete copy.healing;
      delete copy.damageTaken;
      delete copy.objectiveValue;
      return copy;
    });

    const data = installFakeStorage();
    data.set(
      MATCH_HISTORY_STORAGE_KEY,
      JSON.stringify({
        schemaVersion: MATCH_HISTORY_SCHEMA_VERSION,
        records: [{ ...legacy, allyStats, enemyStats }],
      }),
    );

    const loaded = loadMatchHistory();
    expect(loaded).toHaveLength(1);
    const record = loaded[0]!;
    expect(record.allyStats).toHaveLength(3);
    expect(record.enemyStats).toHaveLength(3);
    for (const stat of [...record.allyStats, ...record.enemyStats]) {
      expect(stat.healing).toBeNull();
      expect(stat.damageTaken).toBeNull();
      expect(stat.objectiveValue).toBeNull();
    }
  });
});
