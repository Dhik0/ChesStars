import { validateMeta, type BrawlMeta } from '../../types/meta';

/**
 * 测试用的最小合法 meta（v5）。
 *
 * 只保留 `validateMeta` 必填的字段，尺寸小、断言直观；
 * 需要不同版本/时间戳时用 `over` 覆盖。
 */

const A = 10000001;
const B = 10000002;
const C = 10000003;

const NAME: Record<number, string> = {
  [A]: 'ALPHA',
  [B]: 'BRAVO',
  [C]: 'CHARLIE',
};

function stat(id: number) {
  return {
    id,
    name: NAME[id]!,
    games: 100,
    wins: 52,
    win_rate: 0.52,
    smoothed_wr: 0.52,
    use_rate: 0.1,
    score: 50,
    pick_order: 'MIDDLE' as const,
    matchups: [],
  };
}

export function makeTestMeta(over: Partial<BrawlMeta> = {}): BrawlMeta {
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
    brawlers: [A, B, C].map((id) => ({ id, name: NAME[id]! })),
    maps: [
      {
        map_name: 'Test Map',
        mode: 'gemGrab',
        total_games: 500,
        brawlers: [A, B, C].map((id) => stat(id)),
        matchup_table: [[A, B, 4.44, 120]],
      },
    ],
    modes: [
      {
        mode: 'gemGrab',
        total_games: 1000,
        brawlers: [A, B, C].map((id) => stat(id)),
        matchup_table: [],
      },
    ],
    global_matchups: [],
    roles: { version: 1, roles: [] },
    ...over,
  };
  return validateMeta(raw);
}
