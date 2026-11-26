import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { validateMeta, type BrawlMeta } from '../types/meta';
import { applyPick, createDraft, nextSlot, type DraftState, type Side } from './draftEngine';
import { recommendHeadOf, formatPickRate } from './display';
import { translate } from '../i18n/translate';

/** 标题文案由词库提供，这里按默认语言（简体中文）断言 */
const titleOf = (state: DraftState): string => translate('zh-CN', recommendHeadOf(state).key);

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
    titles.push(translate('zh-CN', head.key));
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
      expect(translate('zh-CN', head.key)).toBe(ALLY_TITLE);
      expect(head.enemy).toBe(false);
    }
  });

  it('手点敌方空槽（提前预判）时标题立刻切到「敌方可能会选」', () => {
    const state = readyState('ally');
    expect(recommendHeadOf(state).enemy).toBe(false);
    const peek: DraftState = { ...state, active: { kind: 'enemy', index: 1 } };
    expect(titleOf(peek)).toBe(ENEMY_TITLE);
    expect(recommendHeadOf(peek).enemy).toBe(true);
  });
});

describe('出场率格式化', () => {
  it('真没出场才显示 0%', () => {
    expect(formatPickRate(0)).toBe('0%');
    expect(formatPickRate(-0.2)).toBe('0%');
    expect(formatPickRate(Number.NaN)).toBe('0%');
  });

  it('低于 0.1% 一律显示 <0.1%，不再被抹成 0%', () => {
    expect(formatPickRate(0.0001)).toBe('<0.1%');
    expect(formatPickRate(0.0009)).toBe('<0.1%');
    // 0.0999% 仍然在阈值下
    expect(formatPickRate(0.000999)).toBe('<0.1%');
  });

  it('0.1%~1% 保留一位小数，避免四舍五入成 0%', () => {
    expect(formatPickRate(0.001)).toBe('0.1%');
    expect(formatPickRate(0.0043)).toBe('0.4%');
    expect(formatPickRate(0.0099)).toBe('1.0%');
  });

  it('1% 以上取整，与原来的显示口径一致', () => {
    expect(formatPickRate(0.01)).toBe('1%');
    expect(formatPickRate(0.124)).toBe('12%');
    expect(formatPickRate(0.296)).toBe('30%');
    expect(formatPickRate(1)).toBe('100%');
  });
});
