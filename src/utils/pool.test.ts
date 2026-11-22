import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { validateMeta, type BrawlMeta } from '../types/meta';
import { buildIndex } from '../data/metaIndex';
import { RARITY_BY_ID, RARITY_ORDER, rarityOf } from '../data/rarity';
import { createDraft, recommend, type Candidate } from './draftEngine';
import { TOP_PICK_COUNT, buildBrawlerPool, rankMap } from './pool';

const META = validateMeta(
  JSON.parse(readFileSync(resolve(process.cwd(), 'public/data/brawl_meta.json'), 'utf-8')),
) as BrawlMeta;
const IDX = buildIndex(META);

const MAP = META.maps[0]!;

/** 全新一局（未 Ban 未选）的完整候选列表，按推荐分降序 */
function freshCandidates(): Candidate[] {
  return recommend(IDX, createDraft(MAP.map_name, MAP.mode, 'ally'), 200);
}

const ids = (list: Candidate[]) => list.map((c) => c.id);

/* ------------------------------------------------------------------ *
 * 1. 稀有度映射完整性
 * ------------------------------------------------------------------ */

describe('稀有度映射', () => {
  it('覆盖英雄表的全部 108 名，且不多不少', () => {
    const metaIds = META.brawlers.map((b) => b.id).sort((a, b) => a - b);
    const mapIds = Object.keys(RARITY_BY_ID)
      .map(Number)
      .sort((a, b) => a - b);
    expect(mapIds).toEqual(metaIds);
  });

  it('每个取值都落在合法的稀有度枚举里', () => {
    for (const id of Object.keys(RARITY_BY_ID)) {
      expect(RARITY_ORDER).toContain(rarityOf(Number(id)));
    }
  });

  it('未收录的 id 走「神话」兜底（不会抛错）', () => {
    expect(rarityOf(-1)).toBe('mythic');
  });
});

/* ------------------------------------------------------------------ *
 * 2. Top 推荐 + 稀有度分区
 * ------------------------------------------------------------------ */

describe('英雄池分区', () => {
  it('顶部推荐区取前 12 名，且与候选列表顺序一致', () => {
    const cands = freshCandidates();
    const { top } = buildBrawlerPool(cands);
    expect(top).toHaveLength(TOP_PICK_COUNT);
    expect(ids(top)).toEqual(ids(cands.slice(0, TOP_PICK_COUNT)));
  });

  it('Top 区 + 各稀有度分区 = 全部候选，无重复、无遗漏', () => {
    const cands = freshCandidates();
    const { top, sections } = buildBrawlerPool(cands);
    const all = [...ids(top), ...sections.flatMap((s) => ids(s.items))];

    expect(all).toHaveLength(cands.length);
    expect(new Set(all).size).toBe(cands.length);
    expect(all.slice().sort((a, b) => a - b)).toEqual(
      ids(cands)
        .slice()
        .sort((a, b) => a - b),
    );
  });

  it('上榜英雄不会在稀有度分区里二次出现', () => {
    const cands = freshCandidates();
    const { top, sections } = buildBrawlerPool(cands);
    const topIds = new Set(ids(top));
    for (const sec of sections) {
      for (const c of sec.items) expect(topIds.has(c.id)).toBe(false);
    }
  });

  it('分区按稀有度从低到高排列，且跳过空分区', () => {
    const cands = freshCandidates();
    const { sections } = buildBrawlerPool(cands);
    const order = sections.map((s) => s.key);
    const expected = RARITY_ORDER.filter((k) => k !== 'common' && order.includes(k));
    expect(order).toEqual(expected);
    for (const sec of sections) expect(sec.items.length).toBeGreaterThan(0);
  });

  it('初始（common）并入「初始 / 稀有」一栏，不单独成区', () => {
    const cands = freshCandidates();
    const { sections } = buildBrawlerPool(cands);
    expect(sections.some((s) => s.key === 'common')).toBe(false);
    const rare = sections.find((s) => s.key === 'rare');
    expect(rare?.label).toBe('初始 / 稀有');
    const commonIds = META.brawlers.filter((b) => rarityOf(b.id) === 'common').map((b) => b.id);
    for (const id of commonIds) {
      // 初始英雄若没进 Top 12，就必须出现在「初始 / 稀有」栏里
      const inTop = ids(buildBrawlerPool(cands).top).includes(id);
      if (!inTop) expect(ids(rare!.items)).toContain(id);
    }
  });

  it('分区内部保持推荐分顺序（入参已排序）', () => {
    const cands = freshCandidates();
    const { sections } = buildBrawlerPool(cands);
    const rankOf = rankMap(cands);
    for (const sec of sections) {
      const ranks = sec.items.map((c) => rankOf.get(c.id)!);
      expect(ranks).toEqual(ranks.slice().sort((a, b) => a - b));
    }
  });

  it('候选不足 12 名时全部进 Top 区，分区为空', () => {
    const cands = freshCandidates().slice(0, 5);
    const { top, sections } = buildBrawlerPool(cands);
    expect(top).toHaveLength(5);
    expect(sections).toHaveLength(0);
  });

  it('Ban 满 6 人后总数减少，分区依然不重不漏', () => {
    const state = { ...createDraft(MAP.map_name, MAP.mode, 'ally') };
    state.bans = META.brawlers.slice(0, 6).map((b) => b.id);
    const cands = recommend(IDX, state, 200);
    const { top, sections } = buildBrawlerPool(cands);
    const all = [...ids(top), ...sections.flatMap((s) => ids(s.items))];
    expect(all).toHaveLength(cands.length);
    expect(new Set(all).size).toBe(cands.length);
    // 被 Ban 的英雄不应出现在任何区块
    for (const b of state.bans) expect(all).not.toContain(b);
  });

  it('rankMap 给出全局名次（1 起，连续）', () => {
    const cands = freshCandidates();
    const m = rankMap(cands);
    expect(m.get(cands[0]!.id)).toBe(1);
    expect(m.get(cands[11]!.id)).toBe(12);
    expect(m.size).toBe(cands.length);
  });
});
