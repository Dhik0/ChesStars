import type { Candidate } from './draftEngine';
import { RARITY_META, RARITY_ORDER, rarityOf, type RarityKey } from '../data/rarity';

/**
 * 英雄池分区：顶部「高优先推荐」+ 其余按官方稀有度分栏。
 *
 * 抽成纯函数是为了能被单测覆盖——分区去重、顺序、总数这些一旦错位，
 * 界面上表现就是「某个英雄凭空消失」或「出现两次」，很难肉眼发现。
 */

/** 顶部高优先推荐区取前多少名（需求给了 10~15，取 12 = 5 列 × 2 行 + 2） */
export const TOP_PICK_COUNT = 12;

export interface PoolSection {
  key: RarityKey;
  label: string;
  /** 官方主题色，用于区块标题与描边 */
  color: string;
  items: Candidate[];
}

/**
 * 分区标题。
 * common（初始）只有 1 个英雄，单独开一栏太碎，和 Rare 合并成「初始 / 稀有」。
 */
const SECTION_LABEL: Record<RarityKey, string> = {
  common: '初始 / 稀有',
  rare: '初始 / 稀有',
  superRare: '超稀有',
  epic: '史诗',
  mythic: '神话',
  legendary: '传奇',
  ultraLegendary: '超传奇',
};

/** common 并进 rare 一栏 */
function sectionKeyOf(id: number): RarityKey {
  const k = rarityOf(id);
  return k === 'common' ? 'rare' : k;
}

export interface BrawlerPool {
  /** 推荐分前 N 名 */
  top: Candidate[];
  /** 其余英雄，按稀有度从低到高 */
  sections: PoolSection[];
}

/**
 * 把候选列表切成「Top 推荐 + 稀有度分区」。
 *
 * 约定：入参必须是已按推荐分降序排好的列表（`recommend()` 的输出），
 * 这样 top 是真正的前 N 名，且各分区内部也保持推荐分顺序。
 */
export function buildBrawlerPool(
  candidates: Candidate[],
  topCount: number = TOP_PICK_COUNT,
): BrawlerPool {
  const take = Math.max(0, Math.min(topCount, candidates.length));
  const top = candidates.slice(0, take);
  const rest = candidates.slice(take);

  const buckets = new Map<RarityKey, Candidate[]>();
  for (const c of rest) {
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
    sections.push({ key, label: SECTION_LABEL[key], color: RARITY_META[key].color, items });
  }

  return { top, sections };
}

/** 推荐分排名表：id → 名次（1 起），给卡片角标用 */
export function rankMap(candidates: Candidate[]): Map<number, number> {
  const m = new Map<number, number>();
  candidates.forEach((c, i) => m.set(c.id, i + 1));
  return m;
}
