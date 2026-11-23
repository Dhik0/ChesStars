import { X } from 'lucide-react';
import type { Candidate } from '../utils/draftEngine';
import { brawlerCN } from '../data/localization';
import { CLASS_COLOR, CLASS_LABEL } from '../data/brawlerProfile';
import { orderTag } from '../utils/display';
import Avatar from './Avatar';

interface BrawlerDetailProps {
  candidate: Candidate;
  onClose: () => void;
}

function barColor(v: number): string {
  if (v >= 75) return '#22C55E';
  if (v >= 55) return '#38BDF8';
  if (v >= 45) return '#94A3B8';
  return '#EF4444';
}

function BreakdownRow({
  label,
  value,
  weight,
  contribution,
  hint,
}: {
  label: string;
  value: number;
  weight: number;
  contribution: number;
  hint?: string;
}) {
  return (
    <div className="mb-2.5">
      <div className="flex items-baseline justify-between gap-2 text-[11px]">
        <span className="shrink-0 text-slate-400">
          {label}
          <span className="ml-1 text-[10px] text-slate-600">×{(weight * 100).toFixed(0)}%</span>
        </span>
        <span className="shrink-0 tabular-nums text-slate-300">
          {value.toFixed(0)}
          <span className="ml-1.5 text-slate-500">→ {contribution.toFixed(1)}</span>
        </span>
      </div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-800">
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${Math.max(2, Math.min(100, value))}%`, backgroundColor: barColor(value) }}
        />
      </div>
      {hint && <p className="mt-0.5 text-[10px] leading-tight text-slate-600">{hint}</p>}
    </div>
  );
}

/** 加减分拆解弹窗：拒绝黑盒，每一分都能追到来源 */
export default function BrawlerDetail({ candidate, onClose }: BrawlerDetailProps) {
  const b = candidate.breakdown;
  const isBan = candidate.phase === 'ban';
  const isEnemyView = candidate.phase === 'enemyPick';

  // 权重归一化：敌方亮牌不足时克制权重会缩小，这里把三项折算成合计 100%
  const totalWeight = b.baseWeight + b.counterWeight + b.compWeight;
  const norm = (w: number): number => (totalWeight > 0 ? w / totalWeight : 0);

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/60 animate-fade-in" onClick={onClose}>
      <div
        className="max-h-dvh-86 w-full overflow-y-auto overscroll-contain rounded-t-2xl border-t border-slate-700 bg-slate-900 pb-3 animate-slide-up safe-bottom"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 头部 */}
        <div className="sticky top-0 z-10 flex items-center gap-2.5 border-b border-slate-800 bg-slate-900/95 px-3 py-2.5 backdrop-blur">
          <Avatar id={candidate.id} name={candidate.name} size={44} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <h2 className="truncate text-[15px] font-bold text-white">{candidate.cn}</h2>
              {/* 一级：职业 */}
              <span
                className="shrink-0 rounded px-1 py-px text-[9px] font-semibold"
                style={{
                  backgroundColor: `${CLASS_COLOR[candidate.cls]}26`,
                  color: CLASS_COLOR[candidate.cls],
                }}
              >
                {CLASS_LABEL[candidate.cls]}
              </span>
              {orderTag(candidate.pickOrder) && (
                <span className="shrink-0 rounded bg-slate-800 px-1 py-px text-[9px] font-medium text-slate-400">
                  {orderTag(candidate.pickOrder)!.label}
                </span>
              )}
            </div>
            <p className="truncate text-[10px] text-slate-500">
              {candidate.hasData
                ? `胜率 ${Math.round(candidate.baseWR * 100)}% · 出场率 ${Math.round(candidate.useRate * 100)}%`
                : '该图暂无对局样本'}
            </p>
          </div>
          <div className="shrink-0 text-right">
            <div className="text-[22px] font-bold leading-none tabular-nums" style={{ color: barColor(candidate.score) }}>
              {candidate.score.toFixed(1)}
            </div>
            <div className="text-[9px] text-slate-500">{isBan ? 'Ban 分' : '动态分'}</div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-500 active:bg-slate-800"
            aria-label="关闭"
          >
            <X size={16} />
          </button>
        </div>

        <div className="px-3 pt-3">
          {isBan ? (
            <>
              <BreakdownRow
                label="地图强度"
                value={b.base}
                weight={norm(b.baseWeight)}
                contribution={b.baseContribution}
                hint="该图强度排名，第一名记 100 分"
              />
              <BreakdownRow
                label="出场率"
                value={b.counter}
                weight={norm(b.counterWeight)}
                contribution={b.counterContribution}
                hint={`本图出场率 ${Math.round(candidate.useRate * 100)}%，已按该图最高出场率折算`}
              />
              <BreakdownRow
                label="先手优先级"
                value={b.comp}
                weight={norm(b.compWeight)}
                contribution={b.compContribution}
                hint="适合先手直接拿，放出来容易被对面抢走"
              />
            </>
          ) : (
            <>
              <BreakdownRow
                label="对位克制"
                value={b.counter}
                weight={norm(b.counterWeight)}
                contribution={b.counterContribution}
                hint={
                  b.counterWeight === 0
                    ? '暂无对手亮牌，该项不生效'
                    : '以 50 分为中性，对位 delta（百分点）越大修正越明显'
                }
              />
              <BreakdownRow
                label="本图胜率"
                value={b.wr ?? 50}
                weight={norm(b.wrWeight ?? 0)}
                contribution={b.wrContribution ?? 0}
                hint="该英雄在这张图的实际胜率，50% 为中性"
              />
              <BreakdownRow
                label="地图强度"
                value={b.base}
                weight={norm(b.baseWeight)}
                contribution={b.baseContribution}
                hint="该图强度排名，第一名记 100 分"
              />
              <BreakdownRow
                label="阵容结构"
                value={b.comp}
                weight={norm(b.compWeight)}
                contribution={b.compContribution}
                hint="补前排 / 补射程 / 补刺客 / 避免定位重复"
              />
              <div className="mb-2.5 flex items-baseline justify-between text-[11px]">
                <span className="text-slate-400">顺位修正</span>
                <span
                  className={
                    b.orderAdj > 0 ? 'text-strong' : b.orderAdj < 0 ? 'text-red-400' : 'text-slate-500'
                  }
                >
                  {b.orderAdj > 0 ? '+' : ''}
                  {b.orderAdj.toFixed(1)}
                </span>
              </div>
            </>
          )}

          {/* 理由明细 */}
          <h3 className="mb-1.5 mt-3 text-[11px] font-semibold text-slate-300">加减分明细</h3>
          <ul className="mb-3 space-y-1">
            {b.reasons.map((r, i) => (
              <li key={i} className="flex items-start gap-1.5 text-[11px] leading-snug">
                <span
                  className={`mt-1 h-1.5 w-1.5 shrink-0 rounded-full ${
                    r.tone === 'good'
                      ? 'bg-strong'
                      : r.tone === 'bad'
                        ? 'bg-red-500'
                        : 'bg-slate-600'
                  }`}
                />
                <span className="flex-1 text-slate-400">{r.text}</span>
                {r.delta !== undefined && (
                  <span
                    className={`shrink-0 tabular-nums ${
                      r.delta > 0 ? 'text-strong' : r.delta < 0 ? 'text-red-400' : 'text-slate-500'
                    }`}
                  >
                    {r.delta > 0 ? '+' : ''}
                    {r.delta.toFixed(1)}
                  </span>
                )}
              </li>
            ))}
          </ul>

          {/* 对位明细 */}
          {candidate.counterDetails.length > 0 && (
            <>
              <h3 className="mb-1.5 text-[11px] font-semibold text-slate-300">
                {isEnemyView ? '对我方已选英雄' : '对敌方已选英雄'}
              </h3>
              <div className="mb-2 divide-y divide-slate-800 rounded-lg border border-slate-800 bg-slate-950/50">
                {candidate.counterDetails.map((d) => {
                  const good = d.delta > 0;
                  const pred =
                    d.predictedWr !== null ? `预期 ${Math.round(d.predictedWr * 100)}%` : null;
                  return (
                    <div key={d.opponentId} className="flex items-center gap-2 px-2 py-1.5">
                      <Avatar id={d.opponentId} name={d.opponentName} size={22} />
                      <span className="flex-1 truncate text-[12px] text-slate-300">
                        {brawlerCN(d.opponentName)}
                      </span>
                      {!d.hasSample && (
                        <span className="shrink-0 rounded bg-slate-800 px-1 text-[9px] text-slate-500">
                          无对位
                        </span>
                      )}
                      {d.hasSample && pred && (
                        <span className="shrink-0 text-[9px] tabular-nums text-slate-500">
                          {pred}
                        </span>
                      )}
                      <span className="shrink-0 text-[9px] tabular-nums text-slate-600">
                        {d.hasSample ? `${d.samples}场` : ''}
                      </span>
                      <span
                        className={`shrink-0 text-[12px] font-semibold tabular-nums ${
                          !d.hasSample ? 'text-slate-600' : good ? 'text-strong' : 'text-red-400'
                        }`}
                      >
                        {d.hasSample ? `${d.delta > 0 ? '+' : ''}${d.delta.toFixed(1)}` : '—'}
                      </span>
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {candidate.counterDetails.length > 0 && (
            <p className="mt-2 text-[10px] leading-relaxed text-slate-600">
              对位差值取自后端 Log5 残差（百分点），已按有效样本分层平滑；
              预期胜率 = Log5(双方本图基准胜率) + 残差。场次为原始交手数，仅供参考。
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
