import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { validateMeta, type BrawlMeta } from '../types/meta';
import { applyPick, createDraft, nextSlot, type DraftState, type Side } from './draftEngine';
import { recommendHeadOf } from './display';

const META = validateMeta(
  JSON.parse(readFileSync(resolve(process.cwd(), 'public/data/brawl_meta.json'), 'utf-8')),
) as BrawlMeta;

const MAP = META.maps[0]!;
/** 前 6 名拿来 Ban，后 6 名拿来轮流选 */
const BAN_IDS = META.brawlers.slice(0, 6).map((b) => b.id);
const PICK_IDS = META.brawlers.slice(6, 12).map((b) => b.id);

/** Ban 已填满、刚进入第 1 手选人的状态（激活槽位由 nextSlot 按先手方算出） */
function readyState(firstPick: Side): DraftState {
  const base: DraftState = {
    ...createDraft(MAP.map_name, MAP.mode, firstPick),
    bans: [...BAN_IDS],
  };
  return { ...base, active: nextSlot(base)! };
}

/** 连续走完 6 手，逐手记录推荐区标题 */
function headsThroughPicks(firstPick: Side): { titles: string[]; kinds: string[] } {
  let state = readyState(firstPick);
  const titles: string[] = [];
  const kinds: string[] = [];
  for (const id of PICK_IDS) {
    const head = recommendHeadOf(state);
    titles.push(head.title);
    kinds.push(state.active.kind);
    expect(head.enemy).toBe(state.active.kind === 'enemy');
    state = applyPick(state, id);
  }
  return { titles, kinds };
}

const ENEMY_TITLE = '敌方可能会选';
const ALLY_TITLE = '高优先推荐';

describe('推荐区标题（我方选角 / 敌方选角）', () => {
  it('蓝先（己方先选）：蛇形 我-敌-敌-我-我-敌，标题随之切换', () => {
    const { titles, kinds } = headsThroughPicks('ally');
    expect(kinds).toEqual(['ally', 'enemy', 'enemy', 'ally', 'ally', 'enemy']);
    expect(titles).toEqual([
      ALLY_TITLE,
      ENEMY_TITLE,
      ENEMY_TITLE,
      ALLY_TITLE,
      ALLY_TITLE,
      ENEMY_TITLE,
    ]);
  });

  it('红先（敌方先选）：蛇形 敌-我-我-敌-敌-我，标题随之切换', () => {
    const { titles, kinds } = headsThroughPicks('enemy');
    expect(kinds).toEqual(['enemy', 'ally', 'ally', 'enemy', 'enemy', 'ally']);
    expect(titles).toEqual([
      ENEMY_TITLE,
      ALLY_TITLE,
      ALLY_TITLE,
      ENEMY_TITLE,
      ENEMY_TITLE,
      ALLY_TITLE,
    ]);
  });

  it('Ban 阶段保持「高优先推荐」，不进敌方主题', () => {
    for (const firstPick of ['ally', 'enemy'] as const) {
      const state = createDraft(MAP.map_name, MAP.mode, firstPick);
      const head = recommendHeadOf(state);
      expect(head.title).toBe(ALLY_TITLE);
      expect(head.enemy).toBe(false);
    }
  });

  it('手点敌方空槽（提前预判）时标题立刻切到「敌方可能会选」', () => {
    const state = readyState('ally');
    expect(recommendHeadOf(state).enemy).toBe(false);
    const peek: DraftState = { ...state, active: { kind: 'enemy', index: 1 } };
    expect(recommendHeadOf(peek).title).toBe(ENEMY_TITLE);
    expect(recommendHeadOf(peek).enemy).toBe(true);
  });
});
