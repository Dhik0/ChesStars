import type { CounterDetail, CounterLight, MatchupCellView } from '../utils/draftEngine';
import { counterLight } from '../utils/draftEngine';
import type { PickOrder } from '../types/meta';

/**
 * 展示层共用的小映射：克制色条配色、顺位标签、基础分配色。
 *
 * 底部槽位、候选卡片、对位弹窗都吃这一份，避免同一档颜色在三处各写一遍后跑偏。
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

export const COUNTER_LIGHT_TEXT: Record<CounterLight, string> = {
  good: '优势',
  bad: '劣势',
  even: '均势',
  none: '无对位',
};

/**
 * 色条的悬浮提示：残差（百分点）+ 档位 + 本图预期胜率 + 有效样本量。
 *
 * `samples` 只是如实展示，不参与任何判定——后端已按有效样本过滤。
 */
export function counterTip(d: CounterDetail | undefined, name: string): string {
  if (!d) return `对 ${name} 无对位记录`;
  if (!d.hasSample) return `对 ${name} 无对位记录`;
  const sign = d.delta > 0 ? '+' : '';
  const pred =
    d.predictedWr !== null ? ` · 本图预期 ${Math.round(d.predictedWr * 100)}%` : '';
  return `对 ${name} ${sign}${d.delta.toFixed(1)}pp（${COUNTER_LIGHT_TEXT[counterLight(d)]}${pred} · ${d.samples}场）`;
}

/** 3×3 对位格的悬浮提示（数据直接来自 v5 查表，没有列表兜底） */
export function matchupCellTip(cell: MatchupCellView, name: string): string {
  if (cell.deltaPp === null) return `对 ${name} 无对位记录`;
  const sign = cell.deltaPp > 0 ? '+' : '';
  const n = cell.nEff !== null ? ` · ${Math.round(cell.nEff)}场` : '';
  return `对 ${name} ${sign}${cell.deltaPp.toFixed(2)}pp（${COUNTER_LIGHT_TEXT[cell.light]}${n}）`;
}

/** 顺位标签的展示样式（只有先手 / 后手两档） */
export interface OrderTagStyle {
  label: string;
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
  if (order === 'FIRST') return { label: '先手', cls: 'bg-sky-500/20 text-sky-300' };
  if (order === 'LAST') return { label: '后手', cls: 'bg-violet-500/20 text-violet-300' };
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
