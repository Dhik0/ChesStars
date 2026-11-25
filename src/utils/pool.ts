import type { Candidate } from './draftEngine';
import { RARITY_META, RARITY_ORDER, rarityOf, type RarityKey } from '../data/rarity';

/**
 * 英雄池分区：顶部「高优先推荐」+ 下方按官方稀有度分栏的全英雄池。
 *
 * 两块**各自独立、互不去重**：顶部推荐只是同一批英雄的高亮视图，
 * 下方全池必须完整——用户可能按稀有度或习惯位置找英雄，
 * 少了 Top N 会变成「这个英雄怎么找不到了」。
 *
 * 抽成纯函数是为了能被单测覆盖——分区顺序、总数、漏人这些一旦错位，
 * 界面上表现就是「某个英雄凭空消失」，很难肉眼发现。
 */

/** 顶部高优先推荐区取前多少名（需求给了 10~15，取 12 = 5 列 × 2 行 + 2） */
export const TOP_PICK_COUNT = 12;

export interface PoolSection {
  key: RarityKey;
  /** 官方主题色，用于区块标题与描边 */
  color: string;
  items: Candidate[];
}

/** common 并进 rare 一栏 */
function sectionKeyOf(id: number): RarityKey {
  const k = rarityOf(id);
  return k === 'common' ? 'rare' : k;
}

export interface BrawlerPool {
  /** 推荐分前 N 名（顶部推荐区，是下方全池的高亮子集） */
  top: Candidate[];
  /** 全英雄池，按稀有度从低到高；**包含** top 里的英雄 */
  sections: PoolSection[];
}

/**
 * 把候选列表切成「Top 推荐 + 稀有度分区」。
 *
 * 约定：入参必须是已按推荐分降序排好的列表（`recommend()` 的输出），
 * 这样 top 是真正的前 N 名，且各分区内部也保持推荐分顺序。
 *
 * 注意 sections 吃的是**完整**候选列表，不再 `slice(take)` 剔掉 Top N——
 * 上下两处渲染同一英雄是预期行为（React key 分属不同父节点，不会冲突）。
 */
export function buildBrawlerPool(
  candidates: Candidate[],
  topCount: number = TOP_PICK_COUNT,
): BrawlerPool {
  const take = Math.max(0, Math.min(topCount, candidates.length));
  const top = candidates.slice(0, take);

  const buckets = new Map<RarityKey, Candidate[]>();
  for (const c of candidates) {
    const key = sectionKeyOf(c.id);
    const arr = buckets.get(key);
    if (arr) arr.push(c);
    else buckets.set(key, [c]);
  }

  const sections: PoolSection[] = [];
  for (const key of RARITY_ORDER) {
    // common 已并进 rare，跳过避免重复
    if (key === 'common') continue;
    const items = buckets.get(key);
    if (!items || items.length === 0) continue;
    sections.push({ key, color: RARITY_META[key].color, items });
  }

  return { top, sections };
}

/** 推荐分排名表：id → 名次（1 起），给卡片角标用 */
export function rankMap(candidates: Candidate[]): Map<number, number> {
  const m = new Map<number, number>();
  candidates.forEach((c, i) => m.set(c.id, i + 1));
  return m;
}
