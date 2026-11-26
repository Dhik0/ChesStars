import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { validateMeta, type BrawlMeta } from '../types/meta';
import { buildIndex, getClass } from '../data/metaIndex';
import { counterDetail } from '../utils/draftEngine';
import { objectiveKindOf, type MatchRecord } from './matchHistoryStore';
import {
  BP_EDGE_CAP_PP,
  GRADE_ORDER,
  GRADE_SYMBOL,
  archetypeOf,
  bpContextOf,
  bpEdgeOf,
  displayKdOf,
  evaluatePlayer,
  flipResult,
  flipScore,
  gamesOfScore,
  gradeOf,
  kdOf,
  netBpEdgeOf,
  reviewMatch,
  tagsOf,
  type BpContext,
  type GradeContext,
  type PlayerEvalInput,
  type PlayerReview,
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
    // 阈值是「场均」治疗：2 局比赛要 48000 总治疗才够 24000/场
    const boosted = evaluatePlayer(baseInput({ stat: { ...base, healing: 48000 } }));

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

  it('奶妈画像压低伤害权重、抬高不死权重：低伤害零阵亡的奶妈分数更高', () => {
    const stat = { kills: 3, deaths: 0, damage: 8000 };
    const healer = evaluatePlayer(baseInput({ stat, archetype: 'healer' }));
    const damage = evaluatePlayer(baseInput({ stat, archetype: 'damage_controller' }));
    expect(healer.score!).toBeGreaterThan(damage.score!);
  });

  it('奶妈的死亡权重更高：同样的阵亡增量，奶妈掉分更多', () => {
    const lowDeaths = { kills: 6, deaths: 1, damage: 25000 };
    const highDeaths = { kills: 6, deaths: 8, damage: 25000 };
    const healerDrop =
      evaluatePlayer(baseInput({ stat: lowDeaths, archetype: 'healer' })).score! -
      evaluatePlayer(baseInput({ stat: highDeaths, archetype: 'healer' })).score!;
    const damageDrop =
      evaluatePlayer(baseInput({ stat: lowDeaths, archetype: 'damage_controller' })).score! -
      evaluatePlayer(baseInput({ stat: highDeaths, archetype: 'damage_controller' })).score!;

    expect(healerDrop).toBeGreaterThan(damageDrop);
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
 * 8. 评级映射（9 档）
 * ------------------------------------------------------------------ */

describe('评级映射', () => {
  const g = (
    score: number,
    context: BpContext,
    result: 'win' | 'loss',
    extra: Partial<GradeContext> = {},
  ) => gradeOf({ score, context, result, ...extra });

  it('常规档位按分数落档', () => {
    expect(g(70, 'neutral', 'win')).toBe('good');
    expect(g(50, 'neutral', 'loss')).toBe('inaccuracy');
    expect(g(35, 'neutral', 'loss')).toBe('mistake');
    expect(g(20, 'neutral', 'loss')).toBe('blunder');
  });

  it('妙手：逆风赢 70 分即可，或断层统治（≥92 且 👑 / ≥95）', () => {
    expect(g(70, 'disadvantaged', 'win')).toBe('brilliant');
    expect(g(69, 'disadvantaged', 'win')).toBe('good');
    expect(g(92, 'neutral', 'win')).toBe('great');
    expect(g(92, 'neutral', 'win', { isStarPlayer: true })).toBe('brilliant');
    expect(g(95, 'neutral', 'win')).toBe('brilliant');
  });

  it('好棋：👑 良好 / 非顺风局 ≥80 / 机制最高带队取胜', () => {
    expect(g(78, 'neutral', 'win', { isStarPlayer: true })).toBe('great');
    expect(g(85, 'neutral', 'win')).toBe('great');
    expect(g(75, 'neutral', 'win', { objectiveLeader: true, kdRatio: 1.2 })).toBe('great');
    // 顺风局不吃「非顺风 ≥80」这条
    expect(g(85, 'advantaged', 'win')).not.toBe('great');
  });

  it('好棋的机制分支有底分与躺赢保护', () => {
    // 0/6 捡漏进 1 球：机制最高 + 赢，但面板太差，不能拿 !
    expect(g(60, 'neutral', 'win', { objectiveLeader: true, kdRatio: 0 })).toBe('good');
    // 底分保护：低于 65 一律不进 !
    expect(g(64, 'neutral', 'win', { objectiveLeader: true, kdRatio: 2 })).toBe('good');
    expect(g(65, 'neutral', 'win', { objectiveLeader: true, kdRatio: 2 })).toBe('great');
  });

  it('错失良机：优势对位输了但没崩', () => {
    expect(g(60, 'advantaged', 'loss')).toBe('miss');
    expect(g(41, 'advantaged', 'loss')).toBe('miss');
    expect(g(40, 'advantaged', 'loss')).toBe('blunder');
  });

  it('错失良机的「机制拖后腿」只发给面板尚可的人', () => {
    const panelOk = { objectiveWeak: true, kdRatio: 1.2, damageShare: 0.32 };
    expect(g(60, 'neutral', 'loss', panelOk)).toBe('miss');
    // 非败局不触发
    expect(g(60, 'neutral', 'win', panelOk)).toBe('good');
    // K/D 0.6（6/10）或 0.8（4/5）的低效输局，直接落常规档
    expect(g(60, 'neutral', 'loss', { ...panelOk, kdRatio: 0.6 })).toBe('good');
    expect(g(60, 'neutral', 'loss', { ...panelOk, kdRatio: 0.8 })).toBe('good');
    // 伤害占比垫底（< 25%）同样不触发
    expect(g(60, 'neutral', 'loss', { ...panelOk, damageShare: 0.2 })).toBe('good');
  });

  it('谱着：优势对位 + 稳稳赢下（无 carry、无机制最高）', () => {
    expect(g(65, 'advantaged', 'win')).toBe('book');
    expect(g(55, 'advantaged', 'win')).toBe('book');
    // 拿了 👑 或机制最高就不算「按剧本」
    expect(g(65, 'advantaged', 'win', { isStarPlayer: true })).toBe('good');
    expect(g(65, 'advantaged', 'win', { objectiveLeader: true })).toBe('good');
    // 分数太低 / 太高都不进谱着
    expect(g(50, 'advantaged', 'win')).not.toBe('book');
    expect(g(78, 'advantaged', 'win')).toBe('best');
  });

  it('错失良机：优势对位输了但没崩', () => {
    expect(g(60, 'advantaged', 'loss')).toBe('miss');
    expect(g(41, 'advantaged', 'loss')).toBe('miss');
    expect(g(40, 'advantaged', 'loss')).toBe('blunder');
  });

  it('九档符号齐全', () => {
    expect(Object.keys(GRADE_SYMBOL)).toHaveLength(9);
    expect(GRADE_ORDER).toHaveLength(9);
    expect(GRADE_SYMBOL.book).toBe('📖');
    expect(GRADE_SYMBOL.miss).toBe('×');
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

  it('阵地坦高承伤 + 低死亡 = 有效抗伤，拿到正向加分与高光标签', () => {
    const tanking = evaluatePlayer(
      baseInput({
        stat: { ...tankStat, damageTaken: 60000 },
        archetype: 'frontline_tank',
      }),
    );
    const light = evaluatePlayer(
      baseInput({
        stat: { ...tankStat, damageTaken: 6000 },
        archetype: 'frontline_tank',
      }),
    );
    expect(tanking.score!).toBeGreaterThan(light.score!);
    expect(tanking.notes.some((n) => n.key === 'review.note.tanking')).toBe(true);
  });

  it('高承伤 + 高死亡不加分：承伤项被剔除，只剩死亡惩罚', () => {
    const withTaken = evaluatePlayer(
      baseInput({
        stat: { kills: 6, deaths: 14, damage: 25000, damageTaken: 40000 },
        archetype: 'frontline_tank',
      }),
    );
    const withoutTaken = evaluatePlayer(
      baseInput({ stat: { kills: 6, deaths: 14, damage: 25000 }, archetype: 'frontline_tank' }),
    );

    // 承伤完全没参与计分 → 与「没填承伤」同分
    expect(withTaken.score).toBe(withoutTaken.score);
    expect(withTaken.notes.some((n) => n.key === 'review.note.tanking')).toBe(false);
  });

  it('射手吃同样多的伤害完全不计分（承伤项不参与）', () => {
    const stat = { kills: 5, deaths: 2, damage: 22000 };
    const withTaken = evaluatePlayer(
      baseInput({ stat: { ...stat, damageTaken: 30000 }, archetype: 'marksman_artillery' }),
    );
    const withoutTaken = evaluatePlayer(
      baseInput({ stat, archetype: 'marksman_artillery' }),
    );
    expect(withTaken.score).toBe(withoutTaken.score);
    expect(withTaken.notes.some((n) => n.key === 'review.note.tanking')).toBe(false);
  });

  it('刺客承伤门槛更高（1.3 万），同样单命承伤得分低于阵地坦', () => {
    const stat = { kills: 5, deaths: 2, damage: 22000, damageTaken: 30000 };
    const tank = evaluatePlayer(baseInput({ stat, archetype: 'frontline_tank' }));
    const assassin = evaluatePlayer(baseInput({ stat, archetype: 'assassin' }));
    expect(tank.metrics!.damageTakenPerLife).toBe(assassin.metrics!.damageTakenPerLife);
    expect(tank.score!).toBeGreaterThan(assassin.score!);
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

  it('奶妈画像的治疗权重更高：同样治疗量分数更高', () => {
    const stat = { kills: 3, deaths: 2, damage: 12000, healing: 15000 };
    const healer = evaluatePlayer(baseInput({ stat, archetype: 'healer' }));
    const damage = evaluatePlayer(baseInput({ stat, archetype: 'damage_controller' }));
    expect(healer.score!).toBeGreaterThan(damage.score!);
  });

  it('非奶妈：治疗低于 22000/场不计分、不挂续航标签（脱战回血不算功劳）', () => {
    const stat = { kills: 6, deaths: 3, damage: 26000 };
    const plain = evaluatePlayer(baseInput({ stat }));
    // 20000 总治疗 = 10000/场，低于阈值
    const naturalRegen = evaluatePlayer(baseInput({ stat: { ...stat, healing: 20000 } }));

    expect(naturalRegen.score).toBe(plain.score);
    expect(naturalRegen.notes.some((n) => n.key === 'review.note.sustain')).toBe(false);
  });

  it('非奶妈：治疗 ≥ 22000/场才给轻度加分与续航标签', () => {
    const stat = { kills: 6, deaths: 3, damage: 26000 };
    const plain = evaluatePlayer(baseInput({ stat }));
    // 48000 总治疗 = 24000/场，超过阈值
    const realHeal = evaluatePlayer(baseInput({ stat: { ...stat, healing: 48000 } }));

    expect(realHeal.score!).toBeGreaterThan(plain.score!);
    expect(realHeal.notes.some((n) => n.key === 'review.note.sustain')).toBe(true);
  });

  it('奶妈：治疗 18000/场就够挂续航标签', () => {
    const healer = evaluatePlayer(
      baseInput({
        stat: { kills: 2, deaths: 2, damage: 8000, healing: 36000 },
        archetype: 'healer',
      }),
    );
    expect(healer.notes.some((n) => n.key === 'review.note.sustain')).toBe(true);
  });
});

/* ------------------------------------------------------------------ *
 * 10. V2：真实 K/D、总局原值、画像差异、评语单位
 * ------------------------------------------------------------------ */

describe('真实 K/D 展示', () => {
  it('2/2 → 1.00，5/0 → ∞，0/0 → 0.00，未填 → null', () => {
    expect(displayKdOf(2, 2)).toBe('1.00');
    expect(displayKdOf(5, 0)).toBe('∞');
    expect(displayKdOf(0, 0)).toBe('0.00');
    expect(displayKdOf(3, 4)).toBe('0.75');
    expect(displayKdOf(null, 3)).toBeNull();
    expect(displayKdOf(3, null)).toBeNull();
  });

  it('算分仍用平滑公式，展示走真实比值', () => {
    const player = evaluatePlayer(baseInput({ stat: { kills: 2, deaths: 2, damage: 20000 } }));
    expect(player.metrics!.kd).toBe(0.83); // (2 + 0.5) / (2 + 1)
    expect(player.metrics!.displayKd).toBe('1.00');
  });
});

describe('总局原值输出', () => {
  it('totals 与录入的原始整数完全一致（不归一化）', () => {
    const stat = {
      kills: 8,
      deaths: 4,
      damage: 60200,
      healing: 12000,
      damageTaken: 30000,
      objectiveValue: 3,
    };
    const player = evaluatePlayer(baseInput({ stat, objectiveKind: 'goals' }));
    expect(player.metrics!.totals).toEqual(stat);
    // 场均仍然按局数算（2:0 = 2 局）
    expect(player.metrics!.damagePerGame).toBe(30100);
    expect(player.metrics!.killsPerGame).toBe(4);
  });
});

describe('画像差异', () => {
  const stat = { kills: 3, deaths: 2, damage: 10000 };
  const healStat = { ...stat, healing: 30000 };

  it('奶妈的治疗权重远高于功能辅助', () => {
    const healer = evaluatePlayer(baseInput({ stat: healStat, archetype: 'healer' }));
    const healerNoHeal = evaluatePlayer(baseInput({ stat, archetype: 'healer' }));
    const utility = evaluatePlayer(baseInput({ stat: healStat, archetype: 'utility_support' }));
    const utilityNoHeal = evaluatePlayer(baseInput({ stat, archetype: 'utility_support' }));

    expect(healer.score!).toBeGreaterThan(utility.score!);
    const healerGain = healer.score! - healerNoHeal.score!;
    const utilityGain = utility.score! - utilityNoHeal.score!;
    expect(healerGain).toBeGreaterThan(utilityGain * 2);
  });

  it('刺客不因总伤害低于射手被误判：同数据下刺客分不低于射手', () => {
    const stat = { kills: 9, deaths: 3, damage: 16000 };
    const assassin = evaluatePlayer(baseInput({ stat, archetype: 'assassin' }));
    const marksman = evaluatePlayer(baseInput({ stat, archetype: 'marksman_artillery' }));
    expect(assassin.score!).toBeGreaterThanOrEqual(marksman.score! - 2);
  });
});

describe('评语单位格式化', () => {
  it('评语里的伤害用总局原值 + 注入的格式化函数，不输出裸整数', () => {
    const player = evaluatePlayer(
      baseInput({
        stat: { kills: 8, deaths: 4, damage: 60000 },
        formatBig: (v) => `${(v / 10000).toFixed(1)}万`,
      }),
    );
    // 总局 60000（不是场均 30000），与卡片 1:1
    expect(String(player.comment.params.dmg)).toBe('6.0万');
    expect(player.comment.params.deaths).toBe(4);
    expect(player.comment.params.kd).toBe('2.00');
  });
});

describe('画像映射（真实数据）', () => {
  const idOf = (name: string) => META.brawlers.find((b) => b.name === name)?.id ?? -1;

  it('覆盖表命中：奶妈 / 功能辅助 / 阵地坦 / 刺客', () => {
    expect(archetypeOf(IDX, idOf('POCO'))).toBe('healer');
    expect(archetypeOf(IDX, idOf('MAX'))).toBe('utility_support');
    expect(archetypeOf(IDX, idOf('FRANK'))).toBe('frontline_tank');
    expect(archetypeOf(IDX, idOf('MORTIS'))).toBe('assassin');
  });

  it('未覆盖的英雄按官方职业兜底', () => {
    expect(archetypeOf(IDX, idOf('BROCK'))).toBe('marksman_artillery');
    expect(archetypeOf(IDX, idOf('BARLEY'))).toBe('marksman_artillery');
    expect(archetypeOf(IDX, idOf('COLT'))).toBe('damage_controller');
    expect(archetypeOf(IDX, idOf('TARA'))).toBe('damage_controller');
  });
});

/* ------------------------------------------------------------------ *
 * 11. V2.1：金库拆箱流 / 整局净 BP 判定
 * ------------------------------------------------------------------ */

describe('金库拆箱流保护', () => {
  const heistStat = (objectiveValue: number) => ({
    kills: 0,
    deaths: 6,
    damage: 12000,
    objectiveValue,
  });

  it('高金库贡献（场均 ≥ 2.5 万）拿机制保底，不再判欠佳', () => {
    const carry = evaluatePlayer(
      baseInput({
        stat: heistStat(60000), // 2 局 → 30000/场
        mode: 'heist',
        objectiveKind: 'safeDamage',
        archetype: 'assassin',
      }),
    );
    const plain = evaluatePlayer(
      baseInput({
        stat: heistStat(2000),
        mode: 'heist',
        objectiveKind: 'safeDamage',
        archetype: 'assassin',
      }),
    );

    expect(carry.score!).toBeGreaterThanOrEqual(58);
    expect(carry.score!).toBeGreaterThan(plain.score!);
    expect(['good', 'best', 'great', 'brilliant', 'book']).toContain(carry.grade);
  });

  it('占本队金库总伤 ≥ 30% 也算贡献（即使场均没到 2.5 万）', () => {
    const shareCarry = evaluatePlayer(
      baseInput({
        stat: heistStat(6000), // 3000/场
        mode: 'heist',
        objectiveKind: 'safeDamage',
        archetype: 'assassin',
        objectiveShare: 0.4,
      }),
    );
    expect(shareCarry.score!).toBeGreaterThanOrEqual(58);
  });

  it('拆箱流的死亡惩罚打折：同样阵亡，贡献高的人扣得少', () => {
    const carry = evaluatePlayer(
      baseInput({
        stat: heistStat(60000),
        mode: 'heist',
        objectiveKind: 'safeDamage',
        archetype: 'assassin',
      }),
    );
    const noCarry = evaluatePlayer(
      baseInput({
        stat: heistStat(2000),
        mode: 'heist',
        objectiveKind: 'safeDamage',
        archetype: 'assassin',
      }),
    );
    // 两者的击杀 / 死亡完全相同，差异来自机制贡献与死亡减免
    expect(carry.score! - noCarry.score!).toBeGreaterThan(5);
  });

  it('金库：拆箱贡献压过纯击杀面板', () => {
    const boxer = evaluatePlayer(
      baseInput({
        stat: { kills: 1, deaths: 4, damage: 9000, objectiveValue: 60000 },
        mode: 'heist',
        objectiveKind: 'safeDamage',
        archetype: 'assassin',
      }),
    );
    const killer = evaluatePlayer(
      baseInput({
        stat: { kills: 12, deaths: 4, damage: 30000, objectiveValue: 1000 },
        mode: 'heist',
        objectiveKind: 'safeDamage',
        archetype: 'assassin',
      }),
    );
    expect(boxer.score!).toBeGreaterThan(killer.score!);
  });
});

describe('整局净 BP 判定', () => {
  const fakePlayer = (over: Partial<PlayerReview>): PlayerReview => ({
    brawlerId: '1',
    side: 'ally',
    archetype: 'damage_controller',
    isSelf: false,
    isStarPlayer: false,
    hasData: true,
    grade: 'good',
    score: 60,
    bpContext: 'neutral',
    edgePp: 0,
    mapWinRate: null,
    matchupDelta: null,
    objectiveKind: null,
    metrics: null,
    highlights: [],
    comment: { key: '', params: {} },
    notes: [],
    ...over,
  });

  it('净 BP 差不足 3pp 时不记「顺风翻车」', () => {
    const players = [fakePlayer({ bpContext: 'advantaged', grade: 'miss' })];
    expect(tagsOf(players, 'loss', -1)).not.toContain('throw');
    expect(tagsOf(players, 'loss', 2.9)).not.toContain('throw');
    expect(tagsOf(players, 'loss', 3)).toContain('throw');
  });

  it('净 BP 差不足 3pp 时不记「逆风翻盘」', () => {
    const players = [fakePlayer({ bpContext: 'disadvantaged', grade: 'brilliant' })];
    expect(tagsOf(players, 'win', 1)).not.toContain('comeback');
    expect(tagsOf(players, 'win', -2.9)).not.toContain('comeback');
    expect(tagsOf(players, 'win', -3)).toContain('comeback');
  });

  it('netBpEdgeOf = 我方平均 edge − 敌方平均 edge', () => {
    const ally = [fakePlayer({ edgePp: 6 }), fakePlayer({ edgePp: 3 })];
    const enemy = [fakePlayer({ edgePp: -3 }), fakePlayer({ edgePp: 0 })];
    // 4.5 - (-1.5) = 6
    expect(netBpEdgeOf(ally, enemy)).toBeCloseTo(6, 5);
  });
});
