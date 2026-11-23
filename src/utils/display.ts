import type { CounterDetail, CounterLight } from '../utils/draftEngine';
import { counterLight } from '../utils/draftEngine';
import type { PickOrder } from '../types/meta';

/**
 * 展示层共用的小映射：克制色条配色、顺位标签、基础分配色。
 *
 * 底部槽位、候选卡片、对位弹窗都吃这一份，避免同一档颜色在三处各写一遍后跑偏。
 */

/**
 * 克制色条：绿=我方占优 / 红=被压制 / 中性灰 / 深灰=无对位。
 *
 * v1.1.2 起只有「绿 / 红 / 灰」三种语义色：残差不够 2.5pp、或预期胜率不过半，
 * 一律按中性灰渲染，不再用黄色「均势」——黄色在深色底上太抢眼，
 * 会让一堆五五开的对位看起来像有结论。
 */
export const COUNTER_LIGHT_CLASS: Record<CounterLight, string> = {
  good: 'bg-green-500',
  bad: 'bg-red-500',
  even: 'bg-slate-500',
  none: 'bg-slate-700',
};

export const COUNTER_LIGHT_TEXT: Record<CounterLight, string> = {
  good: '优势',
  bad: '劣势',
  even: '中性',
  none: '无对位',
};

/**
 * 色条的悬浮提示：残差（百分点）+ 档位 + 本图预期胜率 + 原始场次。
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
 * 本图静态基础分的配色。
 * 后端 score 是该图归一化强度分（第一名 100），分布偏陡：
 * 中位数只有 26 分左右，所以阈值不能按「及格线」来设。
 */
export function baseScoreColor(score: number): string {
  if (score >= 80) return 'text-strong';
  if (score >= 55) return 'text-sky-400';
  if (score >= 30) return 'text-slate-200';
  return 'text-slate-400';
}
