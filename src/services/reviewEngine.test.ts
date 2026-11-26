import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { validateMeta, type BrawlMeta } from '../types/meta';
import { buildIndex, getClass } from '../data/metaIndex';
import { counterDetail } from '../utils/draftEngine';
import { objectiveKindOf, type MatchRecord } from './matchHistoryStore';
import {
  BP_EDGE_CAP_PP,
  bpContextOf,
  bpEdgeOf,
  evaluatePlayer,
  flipResult,
  flipScore,
  gamesOfScore,
  gradeOf,
  kdOf,
  reviewMatch,
  type PlayerEvalInput,
} from './reviewEngine';

/**
 * 复盘引擎的守卫测试。
 *
 * 这里盯的是「评级会不会给出荒谬结论」，而不是某个具体分数：
 *   1. 逆风赢 = `!!`，优势输 = `??`（两条情境规则不能被分数阈值吃掉）；
 *   2. 局数归一化真的生效（同样总数据，2:0 与 2:1 不该同分）；
 *   3. 没录数据 ≠ 打得烂（不能给 0 分，也不能拉低团队均分）；
 *   4. 0 死亡不除零、模式 / 职业权重差异确实改变结果。
 */

const META = validateMeta(
  JSON.parse(readFileSync(resolve(process.cwd(), 'public/data/brawl_meta.json'), 'utf-8')),
) as BrawlMeta;
const IDX = buildIndex(META);

/** 一份中性基准输入：均势对位、常规职业、gemGrab、赢 2:0 */
function baseInput(over: Partial<PlayerEvalInput> = {}): PlayerEvalInput {
  return {
    brawlerId: '1',
    isSelf: false,
    isStarPlayer: false,
    stat: { kills: 10, deaths: 4, damage: 30000 },
    shares: null,
    result: 'win',
    score: '2:0',
    mode: 'gemGrab',
    brawlerClass: 'DAMAGE',
    mapWinRate: 0.5,
    matchupDelta: 0,
    ...over,
  };
}

/* ------------------------------------------------------------------ *
 * 1. 情境规则
 * ------------------------------------------------------------------ */

describe('BP 难度与情境规则', () => {
  it('逆风对位打赢，拿 !!', () => {
    const player = evaluatePlayer(
      baseInput({
        stat: { kills: 14, deaths: 3, damage: 36000 },
        mapWinRate: 0.42, // -8pp
        matchupDelta: -4, // 合计 -12pp
      }),
    );
    expect(player.bpContext).toBe('disadvantaged');
    expect(player.grade).toBe('brilliant');
    expect(player.score).toBeGreaterThanOrEqual(70);
  });

  it('优势对位打崩并落败，拿 ??（不是靠「全场断层」那条兜底）', () => {
    const player = evaluatePlayer(
      baseInput({
        stat: { kills: 6, deaths: 5, damage: 18000 },
        result: 'loss',
        score: '0:2',
        mapWinRate: 0.58,
        matchupDelta: 5,
      }),
    );
    expect(player.bpContext).toBe('advantaged');
    expect(player.score).toBeGreaterThan(30);
    expect(player.score).toBeLessThanOrEqual(40);
    expect(player.grade).toBe('blunder');
  });

  it('对位强度钳制在 ±25pp，分档阈值 3pp', () => {
    expect(bpEdgeOf(0.5, 0)).toBe(0);
    expect(bpEdgeOf(0.5, 60)).toBe(BP_EDGE_CAP_PP);
    expect(bpEdgeOf(0.5, -60)).toBe(-BP_EDGE_CAP_PP);
    expect(bpContextOf(-3)).toBe('disadvantaged');
    expect(bpContextOf(3)).toBe('advantaged');
    expect(bpContextOf(2.9)).toBe('neutral');
    expect(bpContextOf(-2.9)).toBe('neutral');
  });

  it('优势对位打得好也不额外加分（顺风打出来是本分）', () => {
    const neutral = evaluatePlayer(baseInput({ stat: { kills: 10, deaths: 3, damage: 32000 } }));
    const advantaged = evaluatePlayer(
      baseInput({ stat: { kills: 10, deaths: 3, damage: 32000 }, mapWinRate: 0.58, matchupDelta: 6 }),
    );
    expect(advantaged.score).toBe(neutral.score);
  });
});

/* ------------------------------------------------------------------ *
 * 2. 局数归一化
 * ------------------------------------------------------------------ */

describe('场均归一化', () => {
  it('2:0 按 2 局、2:1 按 3 局折算', () => {
    expect(gamesOfScore('2:0')).toBe(2);
    expect(gamesOfScore('0:2')).toBe(2);
    expect(gamesOfScore('2:1')).toBe(3);
    expect(gamesOfScore('1:2')).toBe(3);
  });

  it('同样的总数据，2:0 的场均高于 2:1，得分也更高', () => {
    const stat = { kills: 9, deaths: 3, damage: 27000 };
    const sweep = evaluatePlayer(baseInput({ stat, score: '2:0', result: 'win' }));
    const close = evaluatePlayer(baseInput({ stat, score: '2:1', result: 'win' }));

    expect(sweep.metrics!.games).toBe(2);
    expect(close.metrics!.games).toBe(3);
    expect(sweep.metrics!.killsPerGame).toBe(4.5);
    expect(close.metrics!.killsPerGame).toBe(3);
    expect(sweep.metrics!.damagePerGame).toBe(13500);
    expect(close.metrics!.damagePerGame).toBe(9000);
    // K/D 是比率，与局数无关
    expect(sweep.metrics!.kd).toBe(close.metrics!.kd);
    expect(sweep.score!).toBeGreaterThan(close.score!);
  });
});

/* ------------------------------------------------------------------ *
 * 3. 👑 最佳玩家
 * ------------------------------------------------------------------ */

describe('最佳玩家加权', () => {
  it('同样的数据，勾了 👑 恰好 +8 分', () => {
    const stat = { kills: 6, deaths: 4, damage: 20000 };
    const plain = evaluatePlayer(baseInput({ stat }));
    const star = evaluatePlayer(baseInput({ stat, isStarPlayer: true }));
    expect(star.score! - plain.score!).toBe(8);
    expect(star.isStarPlayer).toBe(true);
  });
});

/* ------------------------------------------------------------------ *
 * 4. 未录入 / 0 死亡
 * ------------------------------------------------------------------ */

describe('边界数据', () => {
  it('三项全 null = 未录入：不评级、不给分、不产出指标', () => {
    const player = evaluatePlayer(
      baseInput({ stat: { kills: null, deaths: null, damage: null } }),
    );
    expect(player.hasData).toBe(false);
    expect(player.grade).toBeNull();
    expect(player.score).toBeNull();
    expect(player.metrics).toBeNull();
    expect(player.comment.key).toBe('review.comment.noData');
  });

  it('只录了一项也参与评级：缺失项为 null 且不参与计分', () => {
    const player = evaluatePlayer(
      baseInput({ stat: { kills: 7, deaths: null, damage: null } }),
    );
    expect(player.hasData).toBe(true);
    expect(player.grade).not.toBeNull();
    expect(player.metrics!.killsPerGame).toBe(3.5);
    expect(player.metrics!.deathsPerGame).toBeNull();
    expect(player.metrics!.damagePerGame).toBeNull();
    expect(player.metrics!.kd).toBeNull();
  });

  it('缺失项不会按 0 拉低分数（权重按已录入项归一化）', () => {
    const base = { kills: 8, deaths: 3, damage: 30000 };
    const partial = evaluatePlayer(baseInput({ stat: base }));
    const boosted = evaluatePlayer(baseInput({ stat: { ...base, healing: 20000 } }));

    // 只填核心三项也能拿到合理分数，不会被「治疗 0 / 承伤 0」拖成低分
    expect(partial.score!).toBeGreaterThan(40);
    expect(partial.metrics!.healingPerGame).toBeNull();
    // 补上真正亮眼的治疗才会加分（而不是「补了字段就掉分」）
    expect(boosted.score!).toBeGreaterThan(partial.score!);
  });

  it('0 死亡不除零，K/D 用 (kills + 0.5) / (deaths + 1)', () => {
    expect(kdOf(8, 0)).toBe(8.5);
    const player = evaluatePlayer(baseInput({ stat: { kills: 8, deaths: 0, damage: 30000 } }));
    expect(Number.isFinite(player.metrics!.kd)).toBe(true);
    expect(player.metrics!.kd).toBe(8.5);
    expect(Number.isNaN(player.score!)).toBe(false);
  });
});

/* ------------------------------------------------------------------ *
 * 5. 模式 / 职业权重
 * ------------------------------------------------------------------ */

describe('模式与职业微调', () => {
  it('赏金 / 淘汰赛的死亡惩罚更重', () => {
    const stat = { kills: 6, deaths: 5, damage: 20000 };
    const gem = evaluatePlayer(baseInput({ stat, mode: 'gemGrab' }));
    const bounty = evaluatePlayer(baseInput({ stat, mode: 'bounty' }));
    const knockout = evaluatePlayer(baseInput({ stat, mode: 'knockout' }));
    expect(bounty.score!).toBeLessThan(gem.score!);
    expect(knockout.score!).toBeLessThan(gem.score!);
  });

  it('辅助职业压低伤害权重、抬高不死权重：低伤害零阵亡的辅助分数更高', () => {
    const stat = { kills: 3, deaths: 0, damage: 8000 };
    const support = evaluatePlayer(baseInput({ stat, brawlerClass: 'SUPPORT' }));
    const damage = evaluatePlayer(baseInput({ stat, brawlerClass: 'DAMAGE' }));
    expect(support.score!).toBeGreaterThan(damage.score!);
  });

  it('辅助的死亡权重更高：同样的阵亡增量，辅助掉分更多', () => {
    const lowDeaths = { kills: 6, deaths: 1, damage: 25000 };
    const highDeaths = { kills: 6, deaths: 8, damage: 25000 };
    const supportDrop =
      evaluatePlayer(baseInput({ stat: lowDeaths, brawlerClass: 'SUPPORT' })).score! -
      evaluatePlayer(baseInput({ stat: highDeaths, brawlerClass: 'SUPPORT' })).score!;
    const damageDrop =
      evaluatePlayer(baseInput({ stat: lowDeaths, brawlerClass: 'DAMAGE' })).score! -
      evaluatePlayer(baseInput({ stat: highDeaths, brawlerClass: 'DAMAGE' })).score!;

    expect(supportDrop).toBeGreaterThan(damageDrop);
  });
});

/* ------------------------------------------------------------------ *
 * 6. 队内占比
 * ------------------------------------------------------------------ */

describe('队内占比', () => {
  it('占比高时加分，占比低时减分', () => {
    const stat = { kills: 6, deaths: 4, damage: 20000 };
    const noShare = evaluatePlayer(baseInput({ stat }));
    const high = evaluatePlayer(baseInput({ stat, shares: { damage: 0.5, kills: 0.5 } }));
    const low = evaluatePlayer(baseInput({ stat, shares: { damage: 0.15, kills: 0.15 } }));

    expect(high.score!).toBeGreaterThan(noShare.score!);
    expect(low.score!).toBeLessThan(noShare.score!);
    expect(high.metrics!.damageShare).toBe(0.5);
  });
});

/* ------------------------------------------------------------------ *
 * 7. 整局复盘（真实 meta 接线）
 * ------------------------------------------------------------------ */

function realRecord(over: Partial<MatchRecord> = {}): MatchRecord {
  const map = META.maps[0]!;
  const [a, b, c, d, e, f] = META.brawlers;
  return {
    id: 'review-1',
    createdAt: 1,
    updatedAt: 1,
    mapId: map.map_name,
    mode: map.mode,
    firstPick: 'ally',
    bans: [],
    allyPicks: [a!, b!, c!].map((brawler, i) => ({
      brawlerId: String(brawler.id),
      pickOrder: [1, 4, 5][i]!,
    })),
    enemyPicks: [d!, e!, f!].map((brawler, i) => ({
      brawlerId: String(brawler.id),
      pickOrder: [2, 3, 6][i]!,
    })),
    result: 'win',
    score: '2:1',
    allyStats: [
      {
        brawlerId: String(a!.id),
        kills: 8,
        deaths: 3,
        damage: 28000,
        healing: 0,
        damageTaken: 24000,
        objectiveValue: 1,
        isSelf: true,
        isStarPlayer: false,
      },
      {
        brawlerId: String(b!.id),
        kills: 5,
        deaths: 4,
        damage: 21000,
        healing: 12000,
        damageTaken: 9000,
        objectiveValue: 2,
        isSelf: false,
        isStarPlayer: true,
      },
      {
        brawlerId: String(c!.id),
        kills: 2,
        deaths: 5,
        damage: 12000,
        healing: 0,
        damageTaken: 30000,
        objectiveValue: 0,
        isSelf: false,
        isStarPlayer: false,
      },
    ],
    enemyStats: [
      {
        brawlerId: String(d!.id),
        kills: 6,
        deaths: 5,
        damage: 24000,
        healing: 3000,
        damageTaken: 26000,
        objectiveValue: 1,
        isStarPlayer: false,
      },
      {
        brawlerId: String(e!.id),
        kills: 4,
        deaths: 6,
        damage: 18000,
        healing: 0,
        damageTaken: 28000,
        objectiveValue: 1,
        isStarPlayer: false,
      },
      {
        brawlerId: String(f!.id),
        kills: 3,
        deaths: 7,
        damage: 15000,
        healing: 0,
        damageTaken: 31000,
        objectiveValue: 0,
        isStarPlayer: false,
      },
    ],
    ...over,
  };
}

describe('整局复盘', () => {
  it('完赛对局：双方各 3 人都评级，双方均分都在 0~100', () => {
    const review = reviewMatch(IDX, realRecord());
    expect(review.eligible).toBe(true);
    expect(review.result).toBe('win');
    expect(review.allyReviews).toHaveLength(3);
    expect(review.enemyReviews).toHaveLength(3);

    for (const player of [...review.allyReviews, ...review.enemyReviews]) {
      expect(player.hasData).toBe(true);
      expect(player.grade).not.toBeNull();
      expect(player.score!).toBeGreaterThanOrEqual(0);
      expect(player.score!).toBeLessThanOrEqual(100);
      expect(player.comment.key.startsWith('review.comment.')).toBe(true);
    }
    expect(review.allyReviews.every((p) => p.side === 'ally')).toBe(true);
    expect(review.enemyReviews.every((p) => p.side === 'enemy')).toBe(true);
    // 敌方没有「我」
    expect(review.enemyReviews.every((p) => p.isSelf === false)).toBe(true);

    expect(review.allyAvgScore).not.toBeNull();
    expect(review.enemyAvgScore).not.toBeNull();
  });

  it('双方占比各自在本方 3 人池内计算，各自求和为 1', () => {
    const review = reviewMatch(IDX, realRecord());
    for (const side of [review.allyReviews, review.enemyReviews]) {
      const damage = side.map((p) => p.metrics!.damageShare!);
      const kills = side.map((p) => p.metrics!.killShare!);
      expect(damage.every((s) => s !== null)).toBe(true);
      expect(damage.reduce((sum, s) => sum + s, 0)).toBeCloseTo(1, 2);
      expect(kills.reduce((sum, s) => sum + s, 0)).toBeCloseTo(1, 2);
    }
  });

  it('待补录对局不参与评级', () => {
    const review = reviewMatch(IDX, realRecord({ result: 'pending', score: null }));
    expect(review.eligible).toBe(false);
    expect(review.allyReviews).toHaveLength(0);
    expect(review.enemyReviews).toHaveLength(0);
    expect(review.allyAvgScore).toBeNull();
    expect(review.enemyAvgScore).toBeNull();
  });

  it('我方一人未录入：他不评级，也不拉低我方均分', () => {
    const base = realRecord();
    const stats = base.allyStats.map((stat, i) =>
      i === 2
        ? {
            ...stat,
            kills: null,
            deaths: null,
            damage: null,
            healing: null,
            damageTaken: null,
            objectiveValue: null,
          }
        : stat,
    );
    const review = reviewMatch(IDX, { ...base, allyStats: stats });

    expect(review.allyReviews[2]!.hasData).toBe(false);
    expect(review.allyReviews[2]!.score).toBeNull();
    // 占比要求三人齐全，缺一个就整队关闭
    expect(review.allyReviews[0]!.metrics!.damageShare).toBeNull();
    expect(review.tags).toContain('incomplete');

    const rated = review.allyReviews.filter((p) => p.score !== null);
    const avg = Math.round(rated.reduce((sum, p) => sum + (p.score ?? 0), 0) / rated.length);
    expect(review.allyAvgScore).toBe(avg);
  });

  it('我方全部未录入时我方均分为 null，敌方照常评级', () => {
    const base = realRecord();
    const review = reviewMatch(IDX, {
      ...base,
      allyStats: base.allyStats.map((stat) => ({
        ...stat,
        kills: null,
        deaths: null,
        damage: null,
        healing: null,
        damageTaken: null,
        objectiveValue: null,
      })),
    });
    expect(review.allyAvgScore).toBeNull();
    expect(review.tags).toContain('incomplete');
    expect(review.enemyAvgScore).not.toBeNull();
  });

  it('旧记录没有敌方战绩：敌方 3 人全为「未录入」，我方不受影响', () => {
    const base = realRecord();
    const review = reviewMatch(IDX, { ...base, enemyStats: [] });
    expect(review.enemyReviews).toHaveLength(3);
    expect(review.enemyReviews.every((p) => p.hasData === false)).toBe(true);
    expect(review.enemyReviews.every((p) => p.score === null)).toBe(true);
    expect(review.enemyAvgScore).toBeNull();
    expect(review.allyAvgScore).not.toBeNull();
  });
});

/* ------------------------------------------------------------------ *
 * 8. 对称性：敌方镜像胜负 / 比分 / 对位对象
 * ------------------------------------------------------------------ */

describe('敌方对称评级', () => {
  it('胜负与比分镜像：win 2:1 → loss 1:2', () => {
    expect(flipResult('win')).toBe('loss');
    expect(flipResult('loss')).toBe('win');
    expect(flipScore('2:0')).toBe('0:2');
    expect(flipScore('0:2')).toBe('2:0');
    expect(flipScore('2:1')).toBe('1:2');
    expect(flipScore('1:2')).toBe('2:1');
  });

  it('敌方评分用的是镜像后的胜负与比分（而不是我方视角）', () => {
    const record = realRecord();
    const review = reviewMatch(IDX, record);
    const enemy = review.enemyReviews[0]!;
    const stat = record.enemyStats[0]!;

    const common = {
      brawlerId: enemy.brawlerId,
      side: 'enemy' as const,
      isSelf: false,
      isStarPlayer: stat.isStarPlayer,
      stat: {
        kills: stat.kills,
        deaths: stat.deaths,
        damage: stat.damage,
        healing: stat.healing,
        damageTaken: stat.damageTaken,
        objectiveValue: stat.objectiveValue,
      },
      objectiveKind: review.objectiveKind,
      leaders: enemy.highlights,
      shares: {
        damage: enemy.metrics!.damageShare!,
        kills: enemy.metrics!.killShare!,
      },
      mode: record.mode,
      brawlerClass: getClass(IDX, Number(enemy.brawlerId)),
      mapWinRate: enemy.mapWinRate,
      matchupDelta: enemy.matchupDelta,
    };

    // 我方 win 2:1 → 敌方 loss 1:2
    expect(evaluatePlayer({ ...common, result: 'loss', score: '1:2' }).score).toBe(enemy.score);
  });

  it('敌方 BP 难度按我方 3 人计算（而不是按敌方队友）', () => {
    const record = realRecord();
    const review = reviewMatch(IDX, record);
    const enemy = review.enemyReviews[0]!;
    const allyIds = record.allyPicks.map((p) => Number(p.brawlerId));
    const expected = counterDetail(
      IDX,
      record.mapId,
      record.mode,
      Number(enemy.brawlerId),
      allyIds,
    );

    if (expected.trustedCount > 0) {
      expect(enemy.matchupDelta).not.toBeNull();
      expect(enemy.matchupDelta!).toBeCloseTo(expected.avgDelta, 0);
    } else {
      expect(enemy.matchupDelta).toBeNull();
    }
  });
});

/* ------------------------------------------------------------------ *
 * 8. 评级映射
 * ------------------------------------------------------------------ */

describe('评级映射', () => {
  it('按分数落档，情境规则优先', () => {
    expect(gradeOf(95, 'neutral', 'win')).toBe('brilliant');
    expect(gradeOf(80, 'neutral', 'win')).toBe('best');
    expect(gradeOf(60, 'neutral', 'win')).toBe('good');
    expect(gradeOf(50, 'neutral', 'loss')).toBe('inaccuracy');
    expect(gradeOf(35, 'neutral', 'loss')).toBe('mistake');
    expect(gradeOf(20, 'neutral', 'loss')).toBe('blunder');
    // 逆风赢：70 分就能拿 !!
    expect(gradeOf(70, 'disadvantaged', 'win')).toBe('brilliant');
    expect(gradeOf(69, 'disadvantaged', 'win')).toBe('good');
    // 优势输：≤40 直接 ??
    expect(gradeOf(40, 'advantaged', 'loss')).toBe('blunder');
    expect(gradeOf(41, 'advantaged', 'loss')).toBe('mistake');
  });
});

/* ------------------------------------------------------------------ *
 * 9. V1 指标：模式权重 / 承伤规则 / 领跑加分
 * ------------------------------------------------------------------ */

describe('模式专属指标（V1）', () => {
  const stat = { kills: 8, deaths: 3, damage: 30000, healing: 2000, damageTaken: 20000, objectiveValue: 6 };

  it('五种机制模式都有第 5 项，淘汰赛没有', () => {
    const modes = ['brawlBall', 'hotZone', 'bounty', 'heist', 'gemGrab', 'knockout'];
    for (const mode of modes) {
      const player = evaluatePlayer(
        baseInput({ stat, mode, objectiveKind: objectiveKindOf(mode) }),
      );
      if (mode === 'knockout') {
        expect(player.objectiveKind).toBeNull();
        expect(player.metrics!.objectivePerGame).toBeNull();
        expect(player.highlights).not.toContain('objective');
      } else {
        expect(player.objectiveKind).not.toBeNull();
        expect(player.metrics!.objectivePerGame).toBe(3); // 6 / 2 局
      }
    }
  });

  it('机制指标确实参与计分：同模式内，抢星多的人分更高', () => {
    const high = evaluatePlayer(
      baseInput({ stat: { ...stat, objectiveValue: 20 }, mode: 'bounty', objectiveKind: 'stars' }),
    );
    const low = evaluatePlayer(
      baseInput({ stat: { ...stat, objectiveValue: 0 }, mode: 'bounty', objectiveKind: 'stars' }),
    );
    expect(high.score!).toBeGreaterThan(low.score!);
  });

  it('淘汰赛忽略第 5 项：objectiveValue 填什么都不影响分数', () => {
    const high = evaluatePlayer(
      baseInput({ stat: { ...stat, objectiveValue: 20 }, mode: 'knockout', objectiveKind: null }),
    );
    const low = evaluatePlayer(
      baseInput({ stat: { ...stat, objectiveValue: 0 }, mode: 'knockout', objectiveKind: null }),
    );
    expect(high.score).toBe(low.score);
    expect(high.metrics!.objectivePerGame).toBeNull();
  });

  it('金库按伤害量级评估：场均 2 万金库伤害拿满分线', () => {
    const strong = evaluatePlayer(
      baseInput({
        stat: { ...stat, objectiveValue: 40000 },
        mode: 'heist',
        objectiveKind: 'safeDamage',
      }),
    );
    const weak = evaluatePlayer(
      baseInput({
        stat: { ...stat, objectiveValue: 2000 },
        mode: 'heist',
        objectiveKind: 'safeDamage',
      }),
    );
    expect(strong.score!).toBeGreaterThan(weak.score!);
  });
});

describe('承受伤害的非对称评估', () => {
  const tankStat = { kills: 6, deaths: 2, damage: 25000 };

  it('高承伤 + 低死亡（坦克）= 有效抗伤，拿到正向加分与高光标签', () => {
    const tanking = evaluatePlayer(
      baseInput({
        stat: { ...tankStat, damageTaken: 40000 },
        brawlerClass: 'TANK',
      }),
    );
    const squishy = evaluatePlayer(
      baseInput({
        stat: { ...tankStat, damageTaken: 6000 },
        brawlerClass: 'TANK',
      }),
    );
    expect(tanking.score!).toBeGreaterThan(squishy.score!);
    expect(tanking.notes.some((n) => n.key === 'review.note.tanking')).toBe(true);
  });

  it('高承伤 + 高死亡不加分：承伤项被剔除，只剩死亡惩罚', () => {
    const withTaken = evaluatePlayer(
      baseInput({
        stat: { kills: 6, deaths: 14, damage: 25000, damageTaken: 40000 },
        brawlerClass: 'TANK',
      }),
    );
    const withoutTaken = evaluatePlayer(
      baseInput({ stat: { kills: 6, deaths: 14, damage: 25000 }, brawlerClass: 'TANK' }),
    );

    // 承伤完全没参与计分 → 与「没填承伤」同分
    expect(withTaken.score).toBe(withoutTaken.score);
    expect(withTaken.notes.some((n) => n.key === 'review.note.tanking')).toBe(false);
  });

  it('脆皮吃同样多的伤害，分数低于坦克（职业参考值不同）', () => {
    const stat = { kills: 5, deaths: 2, damage: 22000, damageTaken: 30000 };
    const tank = evaluatePlayer(baseInput({ stat, brawlerClass: 'TANK' }));
    const marksman = evaluatePlayer(baseInput({ stat, brawlerClass: 'MARKSMAN' }));
    expect(tank.score!).toBeGreaterThan(marksman.score!);
  });
});

describe('领跑加分与治疗权重', () => {
  const stat = { kills: 10, deaths: 4, damage: 30000, healing: 6000, objectiveValue: 3 };

  it('伤害 / 治疗 / 模式指标领跑各 +2，封顶 +5；承伤领跑不加分', () => {
    const plain = evaluatePlayer(baseInput({ stat, objectiveKind: 'goals' }));
    const damageLead = evaluatePlayer(
      baseInput({ stat, objectiveKind: 'goals', leaders: ['damage'] }),
    );
    const takenLead = evaluatePlayer(
      baseInput({ stat, objectiveKind: 'goals', leaders: ['damageTaken'] }),
    );
    const allLeads = evaluatePlayer(
      baseInput({ stat, objectiveKind: 'goals', leaders: ['damage', 'healing', 'objective'] }),
    );

    expect(damageLead.score! - plain.score!).toBe(2);
    expect(takenLead.score).toBe(plain.score);
    expect(allLeads.score! - plain.score!).toBe(5);
    expect(damageLead.notes.some((n) => n.key === 'review.note.topDamage')).toBe(true);
    expect(allLeads.notes.length).toBeLessThanOrEqual(2);
  });

  it('辅助职业的治疗权重更高：同样治疗量分数更高', () => {
    const stat = { kills: 3, deaths: 2, damage: 12000, healing: 15000 };
    const support = evaluatePlayer(baseInput({ stat, brawlerClass: 'SUPPORT' }));
    const damage = evaluatePlayer(baseInput({ stat, brawlerClass: 'DAMAGE' }));
    expect(support.score!).toBeGreaterThan(damage.score!);
  });

  it('高额治疗即使不是领跑也能拿到「续航」高光', () => {
    const player = evaluatePlayer(
      baseInput({ stat: { kills: 2, deaths: 2, damage: 8000, healing: 20000 } }),
    );
    expect(player.notes.some((n) => n.key === 'review.note.sustain')).toBe(true);
  });
});
