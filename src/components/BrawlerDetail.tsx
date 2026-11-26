import { X } from 'lucide-react';
import type { Candidate } from '../utils/draftEngine';
import { CLASS_COLOR } from '../data/brawlerProfile';
import { orderTag, baseScoreColor, formatPickRate } from '../utils/display';
import { useTranslation } from '../i18n';
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
  const { t, brawler } = useTranslation();
  const b = candidate.breakdown;
  const isBan = candidate.phase === 'ban';
  const isEnemyView = candidate.phase === 'enemyPick';
  const tag = orderTag(candidate.pickOrder);

  // 权重归一化：敌方亮牌不足时克制权重会缩小，这里把三项折算成合计 100%
  const totalWeight = b.baseWeight + b.counterWeight + b.compWeight;
  const norm = (w: number): number => (totalWeight > 0 ? w / totalWeight : 0);

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/60 animate-fade-in" onClick={onClose}>
      <div
        className="max-h-dvh-86 w-full max-w-[440px] mx-auto overflow-y-auto overscroll-contain rounded-t-2xl border-t border-slate-700 bg-slate-900 pb-3 animate-slide-up safe-bottom"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 头部 */}
        <div className="sticky top-0 z-10 flex items-center gap-2.5 border-b border-slate-800 bg-slate-900/95 px-3 py-2.5 backdrop-blur">
          <Avatar id={candidate.id} name={candidate.name} size={44} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <h2 className="truncate text-[15px] font-bold text-white">
                {brawler(candidate.name)}
              </h2>
              {/* 一级：职业 */}
              <span
                className="shrink-0 rounded px-1 py-px text-[9px] font-semibold"
                style={{
                  backgroundColor: `${CLASS_COLOR[candidate.cls]}26`,
                  color: CLASS_COLOR[candidate.cls],
                }}
              >
                {t(`class.${candidate.cls}`)}
              </span>
              {tag && (
                <span className="shrink-0 rounded bg-slate-800 px-1 py-px text-[9px] font-medium text-slate-400">
                  {t(tag.key)}
                </span>
              )}
            </div>
            <p className="truncate text-[10px] text-slate-500">
              {candidate.hasData
                ? t('detail.winRateLine', {
                    wr: Math.round(candidate.baseWR * 100),
                    use: formatPickRate(candidate.useRate),
                  })
                : t('detail.noSample')}
            </p>
          </div>
          <div className="shrink-0 text-right">
            {/* 总分与卡片/槽位共用同一套分档配色，避免同一档分数在两处颜色不一致 */}
            <div
              className={`text-[22px] font-bold leading-none tabular-nums ${baseScoreColor(candidate.score)}`}
            >
              {candidate.score.toFixed(1)}
            </div>
            <div className="text-[9px] text-slate-500">
              {isBan ? t('detail.scoreBan') : t('detail.scoreDynamic')}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-500 active:bg-slate-800"
            aria-label={t('common.close')}
          >
            <X size={16} />
          </button>
        </div>

        <div className="px-3 pt-3">
          {isBan ? (
            <>
              <BreakdownRow
                label={t('detail.breakdownBase')}
                value={b.base}
                weight={norm(b.baseWeight)}
                contribution={b.baseContribution}
                hint={t('detail.breakdownBaseHint')}
              />
              <BreakdownRow
                label={t('detail.breakdownUse')}
                value={b.counter}
                weight={norm(b.counterWeight)}
                contribution={b.counterContribution}
                hint={t('detail.breakdownUseHint', { p: formatPickRate(candidate.useRate) })}
              />
              <BreakdownRow
                label={t('detail.breakdownFirst')}
                value={b.comp}
                weight={norm(b.compWeight)}
                contribution={b.compContribution}
                hint={t('detail.breakdownFirstHint')}
              />
            </>
          ) : (
            <>
              <BreakdownRow
                label={t('detail.breakdownCounter')}
                value={b.counter}
                weight={norm(b.counterWeight)}
                contribution={b.counterContribution}
                hint={
                  b.counterWeight === 0 ? t('detail.breakdownCounterOff') : undefined
                }
              />
              <BreakdownRow
                label={t('detail.breakdownWr')}
                value={b.wr ?? 50}
                weight={norm(b.wrWeight ?? 0)}
                contribution={b.wrContribution ?? 0}
                hint={t('detail.breakdownWrHint')}
              />
              <BreakdownRow
                label={t('detail.breakdownBase')}
                value={b.base}
                weight={norm(b.baseWeight)}
                contribution={b.baseContribution}
                hint={t('detail.breakdownBaseHint')}
              />
              <BreakdownRow
                label={t('detail.breakdownComp')}
                value={b.comp}
                weight={norm(b.compWeight)}
                contribution={b.compContribution}
              />
              <div className="mb-2.5 flex items-baseline justify-between text-[11px]">
                <span className="text-slate-400">{t('detail.orderAdj')}</span>
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
          <h3 className="mb-1.5 mt-3 text-[11px] font-semibold text-slate-300">
            {t('detail.reasonsTitle')}
          </h3>
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
                {t(isEnemyView ? 'detail.vsAlly' : 'detail.vsEnemy')}
              </h3>
              <div className="mb-2 divide-y divide-slate-800 rounded-lg border border-slate-800 bg-slate-950/50">
                {candidate.counterDetails.map((d) => {
                  const good = d.delta > 0;
                  return (
                    <div key={d.opponentId} className="flex items-center gap-2 px-2 py-1.5">
                      <Avatar id={d.opponentId} name={d.opponentName} size={22} />
                      <span className="flex-1 truncate text-[12px] text-slate-300">
                        {brawler(d.opponentName)}
                      </span>
                      {!d.hasSample && (
                        <span className="shrink-0 rounded bg-slate-800 px-1 text-[9px] text-slate-500">
                          {t('detail.noMatchup')}
                        </span>
                      )}
                      {d.hasSample && d.predictedWr !== null && (
                        <span className="shrink-0 text-[9px] tabular-nums text-slate-500">
                          {t('detail.expected', { p: Math.round(d.predictedWr * 100) })}
                        </span>
                      )}
                      <span className="shrink-0 text-[9px] tabular-nums text-slate-600">
                        {d.hasSample ? t('common.samples', { n: d.samples }) : ''}
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
        </div>
      </div>
    </div>
  );
}
