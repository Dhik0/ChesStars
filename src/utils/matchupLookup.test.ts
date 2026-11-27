import { describe, expect, it } from 'vitest';
import { buildIndex, hasMatchupTables, lookupMatchup } from '../data/metaIndex';
import { baseScoreColor } from './display';
import { MATCHUP_LIGHT_PP, matchupCell, type CounterLight } from './draftEngine';
import { validateMeta, type BrawlMeta, type MatchupTuple } from '../types/meta';

/**
 * v5 无序对位查表 —— 对称性、三层回退、均势 vs 无数据。
 *
 * 这里用**手工构造的小数据集**，不依赖仓库里那份真实 meta：
 * 每个断言都能指着某一条 `[min_id, max_id, delta_pp, n_eff]` 说清预期，
 * 数据换代不会让测试跟着漂。
 */

const A = 10000001;
const B = 10000002;
const C = 10000003;
const D = 10000004;
const E = 10000005;
const F = 10000006;

const NAME: Record<number, string> = {
  [A]: 'ALPHA',
  [B]: 'BRAVO',
  [C]: 'CHARLIE',
  [D]: 'DELTA',
  [E]: 'ECHO',
  [F]: 'FOXTROT',
};

function stat(id: number, score = 50) {
  return {
    id,
    name: NAME[id]!,
    games: 100,
    wins: 52,
    win_rate: 0.52,
    smoothed_wr: 0.52,
    use_rate: 0.1,
    score,
    pick_order: 'MIDDLE' as const,
    matchups: [],
  };
}

/** 地图层：A-B 强优势 / A-C 精确五五开 / B-C 轻微 / A-D、B-D 卡在阈值上 */
const MAP_TABLE: MatchupTuple[] = [
  [A, B, 4.44, 120],
  [A, C, 0, 30],
  [B, C, -1.2, 50],
  [A, D, 1.5, 40],
  [B, D, -1.5, 40],
];

/** 模式层：只放地图层没有的两对，用来验证「地图 → 模式」回退 */
const MODE_TABLE: MatchupTuple[] = [
  [C, D, 6, 80],
  [E, F, -3, 20],
];

/** 全局层：只放前两层都没有的一对，用来验证最后一层兜底 */
const GLOBAL_TABLE: MatchupTuple[] = [[A, E, -7.5, 90]];

function makeMeta(over: Partial<BrawlMeta> = {}): BrawlMeta {
  const raw = {
    schema_version: 5,
    updated_at: '2026-11-23T00:00:00Z',
    season_start: '2026-07-20',
    total_battles: 1000,
    min_tier: 16,
    params: {
      bayes_prior_weight: 50,
      matchup_min_samples: 10,
      decay_half_life_days: 30,
    },
    brawlers: [A, B, C, D, E, F].map((id) => ({ id, name: NAME[id]! })),
    maps: [
      {
        map_name: 'Test Map',
        mode: 'gemGrab',
        total_games: 500,
        brawlers: [A, B, C, D, E, F].map((id) => stat(id)),
        matchup_table: MAP_TABLE,
      },
      {
        map_name: 'Other Map',
        mode: 'gemGrab',
        total_games: 500,
        brawlers: [A, B, C, D, E, F].map((id) => stat(id)),
        matchup_table: [],
      },
    ],
    modes: [
      {
        mode: 'gemGrab',
        total_games: 1000,
        brawlers: [A, B, C, D, E, F].map((id) => stat(id)),
        matchup_table: MODE_TABLE,
      },
    ],
    global_matchups: GLOBAL_TABLE,
    roles: { version: 1, roles: [] },
  };
  return validateMeta({ ...raw, ...over });
}

const META = makeMeta();
const IDX = buildIndex(META);

/* ------------------------------------------------------------------ *
 * 1. 解析：v5 查表字段 + 旧版本兼容
 * ------------------------------------------------------------------ */

describe('schema v5 解析', () => {
  it('解析出三张查表（地图 / 模式 / 全局）', () => {
    expect(META.schema_version).toBe(5);
    expect(META.maps[0]!.matchup_table).toHaveLength(MAP_TABLE.length);
    expect(META.modes[0]!.matchup_table).toHaveLength(MODE_TABLE.length);
    expect(META.global_matchups).toHaveLength(GLOBAL_TABLE.length);
    expect(hasMatchupTables(IDX)).toBe(true);
  });

  it('delta_pp 按百分点原样保留，不再乘 100', () => {
    const hit = lookupMatchup(IDX, 'Test Map', 'gemGrab', A, B)!;
    expect(hit.deltaPp).toBeCloseTo(4.44, 6);
    expect(hit.nEff).toBe(120);
  });

  it('两个 id 写反的行会被规整：键仍按小的在前，delta 方向跟着翻转', () => {
    const swapped = validateMeta({
      ...(META as unknown as Record<string, unknown>),
      maps: [
        {
          ...META.maps[0]!,
          // 故意写成 [B, A, -4.44, 120]：方向是 B 对 A
          matchup_table: [[B, A, -4.44, 120]],
        },
      ],
    });
    const [row] = swapped.maps[0]!.matchup_table;
    expect(row).toEqual([A, B, 4.44, 120]);
  });

  it('v4 旧缓存（没有 matchup_table / global_matchups）能正常解析，查表为空不崩', () => {
    const legacyRaw = {
      ...(META as unknown as Record<string, unknown>),
      schema_version: 4,
      global_matchups: undefined,
      maps: META.maps.map(({ matchup_table: _t, ...rest }) => rest),
      modes: META.modes.map(({ matchup_table: _t, ...rest }) => rest),
    };
    const legacy = validateMeta(legacyRaw);
    const legacyIdx = buildIndex(legacy);

    expect(legacy.schema_version).toBe(4);
    expect(legacy.maps[0]!.matchup_table).toEqual([]);
    expect(legacy.modes[0]!.matchup_table).toEqual([]);
    expect(legacy.global_matchups).toEqual([]);
    expect(hasMatchupTables(legacyIdx)).toBe(false);
    // 旧数据没有查表 → 3×3 只能留空，而不是拿 Top-K 列表顶替
    expect(lookupMatchup(legacyIdx, 'Test Map', 'gemGrab', A, B)).toBeNull();
    expect(matchupCell(legacyIdx, 'Test Map', 'gemGrab', A, B).light).toBe('none');
  });

  it('无法识别的版本仍然拒绝加载', () => {
    expect(() => makeMeta({ schema_version: 99 })).toThrow(/schema_version/);
  });

  it('脏行被跳过，不会让整份数据加载失败', () => {
    const messy = validateMeta({
      ...(META as unknown as Record<string, unknown>),
      maps: [
        {
          ...META.maps[0]!,
          matchup_table: [[A, B, 4.44, 120], [A], ['x', 1, 2, 3], [A, A, 5, 5], [C, D, 2.2, 8]],
        },
      ],
    });
    expect(messy.maps[0]!.matchup_table).toEqual([
      [A, B, 4.44, 120],
      [C, D, 2.2, 8],
    ]);
  });
});

/* ------------------------------------------------------------------ *
 * 2. 对称查询
 * ------------------------------------------------------------------ */

describe('lookupMatchup 严格对称', () => {
  it('正向直接取，反向取负，且共用同一条记录的 n_eff', () => {
    const fwd = lookupMatchup(IDX, 'Test Map', 'gemGrab', A, B)!;
    const rev = lookupMatchup(IDX, 'Test Map', 'gemGrab', B, A)!;

    expect(fwd.deltaPp).toBeCloseTo(4.44, 6);
    expect(rev.deltaPp).toBeCloseTo(-4.44, 6);
    expect(fwd.deltaPp + rev.deltaPp).toBeCloseTo(0, 10);
    expect(fwd.nEff).toBe(rev.nEff);
    expect(fwd.source).toBe('map');
    expect(rev.source).toBe('map');
  });

  it('查询顺序：地图 → 模式 → 全局', () => {
    const fromMap = lookupMatchup(IDX, 'Test Map', 'gemGrab', C, A)!;
    expect(fromMap.source).toBe('map');

    // C-D 只写在模式表里
    const fromMode = lookupMatchup(IDX, 'Test Map', 'gemGrab', C, D)!;
    expect(fromMode.source).toBe('mode');
    expect(fromMode.deltaPp).toBeCloseTo(6, 6);

    // A-E 只写在全局表里
    const fromGlobal = lookupMatchup(IDX, 'Test Map', 'gemGrab', A, E)!;
    expect(fromGlobal.source).toBe('global');
    expect(fromGlobal.deltaPp).toBeCloseTo(-7.5, 6);
  });

  it('地图没有查表时，自动落到模式层', () => {
    const hit = lookupMatchup(IDX, 'Other Map', 'gemGrab', C, D)!;
    expect(hit.source).toBe('mode');
    expect(hit.deltaPp).toBeCloseTo(6, 6);
  });

  it('三层都没命中才是 null；自己对自己也是 null', () => {
    expect(lookupMatchup(IDX, 'Test Map', 'gemGrab', B, F)).toBeNull();
    expect(lookupMatchup(IDX, 'Test Map', 'gemGrab', A, A)).toBeNull();
    expect(lookupMatchup(IDX, 'Test Map', 'gemGrab', Number.NaN, A)).toBeNull();
  });
});

/* ------------------------------------------------------------------ *
 * 3. 三态灯：均势 ≠ 无数据
 * ------------------------------------------------------------------ */

describe('三态灯判定', () => {
  const lightOf = (a: number, b: number): CounterLight =>
    matchupCell(IDX, 'Test Map', 'gemGrab', a, b).light;

  it('|delta| >= 1.5 才亮绿/红', () => {
    expect(MATCHUP_LIGHT_PP).toBe(1.5);
    expect(lightOf(A, B)).toBe('good'); // +4.44
    expect(lightOf(B, A)).toBe('bad'); // -4.44
    expect(lightOf(A, D)).toBe('good'); // 恰好 +1.5
    expect(lightOf(B, D)).toBe('bad'); // 恰好 -1.5
  });

  it('|delta| < 1.5 是「均势」黄灯，不是空白', () => {
    expect(lightOf(B, C)).toBe('even'); // -1.2
    expect(lightOf(C, B)).toBe('even'); // +1.2
  });

  it('delta_pp === 0 属于有效数据（均势），绝不能被当成 falsy 判空', () => {
    const cell = matchupCell(IDX, 'Test Map', 'gemGrab', A, C);
    expect(cell.deltaPp).toBe(0);
    expect(cell.deltaPp).not.toBeNull();
    expect(cell.light).toBe('even');
    expect(cell.source).toBe('map');
    expect(matchupCell(IDX, 'Test Map', 'gemGrab', C, A).light).toBe('even');
  });

  it('只有三层查表都没命中才留空白', () => {
    const cell = matchupCell(IDX, 'Test Map', 'gemGrab', B, F);
    expect(cell.light).toBe('none');
    expect(cell.deltaPp).toBeNull();
    expect(cell.source).toBe('none');
  });
});

/* ------------------------------------------------------------------ *
 * 4. 3×3 对位格：换边镜像
 * ------------------------------------------------------------------ */

describe('3×3 对位格换边镜像', () => {
  const BLUE = [A, B, C];
  const RED = [D, E, F];

  it('18 个格子逐对镜像：绿↔红、黄↔黄、空白↔空白', () => {
    for (const blue of BLUE) {
      for (const red of RED) {
        const fwd = matchupCell(IDX, 'Test Map', 'gemGrab', blue, red);
        const rev = matchupCell(IDX, 'Test Map', 'gemGrab', red, blue);

        // 数值互为相反数（同为 null 时也视为镜像）
        if (fwd.deltaPp === null) {
          expect(rev.deltaPp).toBeNull();
        } else {
          expect(rev.deltaPp).not.toBeNull();
          expect(fwd.deltaPp! + rev.deltaPp!).toBeCloseTo(0, 10);
        }

        // 颜色互为镜像
        const mirror: Record<CounterLight, CounterLight> = {
          good: 'bad',
          bad: 'good',
          even: 'even',
          none: 'none',
        };
        expect(rev.light).toBe(mirror[fwd.light]);
      }
    }
  });

  it('同一对英雄在蓝红两侧取到的是同一条记录（来源层也一致）', () => {
    const fwd = matchupCell(IDX, 'Test Map', 'gemGrab', A, E);
    const rev = matchupCell(IDX, 'Test Map', 'gemGrab', E, A);
    expect(fwd.source).toBe('global');
    expect(rev.source).toBe('global');
    expect(fwd.nEff).toBe(rev.nEff);
  });
});

/* ------------------------------------------------------------------ *
 * 5. 综合分配色分档（v5 跨图统一标尺）
 * ------------------------------------------------------------------ */

describe('综合分配色分档', () => {
  it('头部主力 / 常规主力 / 冷门三档颜色互不相同', () => {
    const head = baseScoreColor(72); // 头部主力 65~90
    const main = baseScoreColor(60); // 常规主力 55~65
    const cold = baseScoreColor(27); // 中位数附近

    expect(head).not.toBe(main);
    expect(main).not.toBe(cold);
    expect(head).toBe('text-strong');
  });

  it('常规主力（55~65）不落进低分暗色，65 是头部主力的分界', () => {
    expect(baseScoreColor(55)).toBe('text-brand');
    expect(baseScoreColor(64.9)).toBe('text-brand');
    expect(baseScoreColor(65)).toBe('text-strong');
    expect(baseScoreColor(90)).toBe('text-strong');
  });

  it('50 分以下不报警（中位数本来就在 27 附近），只是弱化', () => {
    expect(baseScoreColor(49)).toBe('text-body');
    expect(baseScoreColor(27)).toBe('text-subtle');
    expect(baseScoreColor(0)).toBe('text-subtle');
  });
});
