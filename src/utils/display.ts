import type { CSSProperties } from 'react';
import type { CounterDetail, CounterLight, DraftState, MatchupCellView } from '../utils/draftEngine';
import { counterLight } from '../utils/draftEngine';
import type { PickOrder } from '../types/meta';
import type { Translator } from '../i18n/translate';

/**
 * 展示层共用的小映射：克制色条配色、顺位标签、基础分配色。
 *
 * 底部槽位、候选卡片、对位弹窗都吃这一份，避免同一档颜色在三处各写一遍后跑偏。
 * 带文案的函数一律接收 `t`——它们只做「把结构化数据翻成一句话」，
 * 不自己持有语言状态。
 */

/**
 * 克制色条（三态灯）：
 *   绿 = 优势（delta ≥ +1.5pp）
 *   红 = 劣势（delta ≤ -1.5pp）
 *   黄 = 均势（有五五开数据，|delta| < 1.5pp）
 *   深灰 = 空白（三层查表都没命中，真的没有数据）
 *
 * 「黄」和「深灰」必须能一眼区分：v5 取消了均势剪枝，命中里大量是 ±1pp 的
 * 五五开条目，把它们渲染成空白等于谎报数据缺失。
 */
export const COUNTER_LIGHT_CLASS: Record<CounterLight, string> = {
  good: 'bg-green-500',
  bad: 'bg-red-500',
  even: 'bg-amber-400',
  none: 'bg-slate-700',
};

/** 色条档位 → 词条 key（优势 / 劣势 / 均势 / 无对位） */
export const COUNTER_LIGHT_KEY: Record<CounterLight, string> = {
  good: 'counter.good',
  bad: 'counter.bad',
  even: 'counter.even',
  none: 'counter.none',
};

export function counterLightText(light: CounterLight, t: Translator): string {
  return t(COUNTER_LIGHT_KEY[light]);
}

/**
 * 色条的悬浮提示：残差（百分点）+ 档位 + 本图预期胜率 + 有效样本量。
 *
 * `samples` 只是如实展示，不参与任何判定——后端已按有效样本过滤。
 */
export function counterTip(
  d: CounterDetail | undefined,
  name: string,
  t: Translator,
): string {
  if (!d || !d.hasSample) return t('tip.noRecord', { name });
  const pp = `${d.delta > 0 ? '+' : ''}${d.delta.toFixed(1)}`;
  const light = counterLightText(counterLight(d), t);
  if (d.predictedWr !== null) {
    return t('tip.counterPred', {
      name,
      pp,
      light,
      pred: Math.round(d.predictedWr * 100),
      n: d.samples,
    });
  }
  return t('tip.counter', { name, pp, light, n: d.samples });
}

/** 3×3 对位格的悬浮提示（数据直接来自 v5 查表，没有列表兜底） */
export function matchupCellTip(
  cell: MatchupCellView,
  name: string,
  t: Translator,
): string {
  if (cell.deltaPp === null) return t('tip.noRecord', { name });
  const pp = `${cell.deltaPp > 0 ? '+' : ''}${cell.deltaPp.toFixed(2)}`;
  const light = counterLightText(cell.light, t);
  if (cell.nEff !== null) {
    return t('tip.cell', { name, pp, light, n: Math.round(cell.nEff) });
  }
  return t('tip.cellNoN', { name, pp, light });
}

/** 顺位标签的展示样式（只有先手 / 后手两档） */
export interface OrderTagStyle {
  /** 词条 key，由界面 `t()` 取值 */
  key: 'order.first' | 'order.last';
  cls: string;
}

/**
 * 顺位标签：只保留「先手 / 后手」两档。
 *
 * 中位（MIDDLE）在实战里没有区分意义——绝大多数英雄都是中位，
 * 显示出来只是噪音，所以直接返回 null，让调用方不渲染。
 * 后手统一叫「后手」，不再用「C位」这种黑话。
 */
export function orderTag(order: PickOrder): OrderTagStyle | null {
  if (order === 'FIRST') return { key: 'order.first', cls: 'bg-sky-500/20 text-sky-300' };
  if (order === 'LAST') return { key: 'order.last', cls: 'bg-violet-500/20 text-violet-300' };
  return null;
}

/**
 * 综合分的配色分档。
 *
 * v5 起后端废除了逐图 Min–Max，`score` 是**跨图统一标尺**：
 *   头部主力 65~90 / 常规主力 55~65 / 冷门与劣势英雄大多 < 50（中位数约 27）。
 *
 * 所以分档线必须跟着这套标尺走：
 *   ≥ 65 头部主力 → 亮绿；
 *   55~65 常规主力 → 天蓝（这是「能用的主力」，绝不能掉进警告色）；
 *   40~55 可用但有短板 → 常规浅灰；
 *   < 40 冷门/劣势 → 暗灰（弱化但不报警，中位数附近本来就该是暗的）。
 */
export function baseScoreColor(score: number): string {
  if (score >= 65) return 'text-strong';
  if (score >= 55) return 'text-sky-400';
  if (score >= 40) return 'text-slate-200';
  return 'text-slate-500';
}

/**
 * 候选列表顶部区块的标题与主题。
 *
 * 视角只由「当前激活槽位」决定：激活槽位是 `nextSlot()` 按 `firstPick` 换算出的
 * 蛇形序列推进的，所以它本身就是「现在该谁选」；用户手点某个空槽时，
 * 标题也必须跟着他眼前要填的那个槽走。
 *
 *   - 敌方选角 → 「敌方可能会选」+ 红色系（与底部红方激活槽位呼应）
 *   - 我方选角 / Ban 阶段 → 「高优先推荐」+ 蓝色系
 */
export interface RecommendHead {
  /** 词条 key，由界面 `t()` 取值 */
  key: 'pool.head.ally' | 'pool.head.enemy';
  /** true = 预判敌方选角（红色主题） */
  enemy: boolean;
}

export function recommendHeadOf(state: DraftState): RecommendHead {
  const enemy = state.active.kind === 'enemy';
  return { key: enemy ? 'pool.head.enemy' : 'pool.head.ally', enemy };
}

/**
 * 出场率展示：入参是 **0~1 的比例**（数据里的 `use_rate`），输出带百分号的字符串。
 *
 * 分档只解决一件事——别把「有人用但很少」说成「没人用」：
 *   - 无样本（≤ 0 / 非有限数）→ `0%`，这是真的没出场；
 *   - 0 < 出场率 < 0.1% → `<0.1%`，原来四舍五入成 `0%` 等于谎报数据缺失；
 *   - 0.1% ≤ 出场率 < 1% → 保留一位小数（`0.4%`），否则同样会被抹成 `0%`；
 *   - ≥ 1% → 取整，与原来的显示口径一致。
 *
 * 所有展示出场率的地方都必须走这里，不要各自 `Math.round(rate * 100)`。
 */
export function formatPickRate(rate: number): string {
  if (!Number.isFinite(rate) || rate <= 0) return '0%';
  const pct = rate * 100;
  if (pct < 0.1) return '<0.1%';
  if (pct < 1) return `${pct.toFixed(1)}%`;
  return `${Math.round(pct)}%`;
}

/**
 * 稀有度分区卡片的配色。
 *
 * 只做一件事：把档位色压成一层**平涂**底色 + 一圈同色描边。
 * 原来的 10% 底色 + 20% 描边在 slate-950 上几乎分不出档位，这里各加一档到
 * 14% / 30%，不叠渐变、不叠高光——保持全局的扁平卡片语言。
 */
export function raritySectionStyle(color: string): CSSProperties {
  return {
    backgroundColor: `${color}24`,
    borderColor: `${color}4D`,
  };
}
