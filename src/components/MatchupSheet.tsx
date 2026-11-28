import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronRight, Swords, ShieldAlert, X } from 'lucide-react';
import type { MetaIndex } from '../data/metaIndex';
import { getMapStat } from '../data/metaIndex';
import { brawlerMatchups, type MatchupRow } from '../utils/draftEngine';
import { orderTag } from '../utils/display';
import type { PickOrder } from '../types/meta';
import { useTranslation } from '../i18n';
import Avatar from './Avatar';

/** 与 index.css 的 m3-sheet-out 一致：退场播完再通知外层卸载 */
const SHEET_EXIT_MS = 180;

interface MatchupSheetProps {
  idx: MetaIndex;
  mapName: string;
  mode: string;
  brawlerId: number;
  onClose: () => void;
  /** 顺带入口：打开该英雄的算分拆解 */
  onOpenBreakdown?: () => void;
}

/** 顺位标签：只显示先手 / 后手，中位不渲染 */
function OrderTag({ order }: { order: PickOrder }) {
  const { t } = useTranslation();
  const tag = orderTag(order);
  if (!tag) return null;
  return (
    <span
      className={`shrink-0 rounded px-1 py-px text-[9px] font-semibold leading-[13px] ${tag.cls}`}
    >
      {t(tag.key)}
    </span>
  );
}

/** 一行对位：对手是谁、他在这张图什么水平、交手过多少场、克制差值多少 */
function MatchupItem({ row, positive }: { row: MatchupRow; positive: boolean }) {
  const { t, brawler } = useTranslation();
  return (
    <li className="flex items-center gap-2 px-2.5 py-1.5">
      <Avatar id={row.opponentId} name={row.opponentName} size={26} rounded="rounded" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1">
          <span className="truncate text-[12.5px] font-medium leading-tight text-body">
            {brawler(row.opponentName)}
          </span>
          {row.opponentPickOrder && <OrderTag order={row.opponentPickOrder} />}
        </div>
        <div className="mt-0.5 flex items-center gap-1 text-[10px] leading-tight text-subtle">
          <span className="tabular-nums">
            {row.opponentScore !== null
              ? t('matchup.score', { n: row.opponentScore.toFixed(0) })
              : t('matchup.noMapData')}
          </span>
          <span className="text-faint">·</span>
          <span className="tabular-nums">{t('common.samples', { n: row.samples })}</span>
        </div>
      </div>
      <span
        className={`shrink-0 text-[13px] font-bold tabular-nums ${
          positive ? 'text-strong' : 'text-danger'
        }`}
      >
        {row.delta > 0 ? '+' : ''}
        {row.delta.toFixed(2)}
      </span>
    </li>
  );
}

/**
 * 长按英雄弹出的「本图详细对位」。
 *
 * 只做一件事：把后端 Log5 残差（delta，百分点）按强弱摊开。
 * 正数 = 我方占优（克谁），负数 = 我方吃亏（怕谁），排序按 |delta| 从高到低。
 */
export default function MatchupSheet({
  idx,
  mapName,
  mode,
  brawlerId,
  onClose,
  onOpenBreakdown,
}: MatchupSheetProps) {
  const { t, brawler, map: mapLabel, mode: modeLabel } = useTranslation();
  const [tab, setTab] = useState<'weak' | 'strong'>('weak');
  const [closing, setClosing] = useState(false);
  const finished = useRef(false);
  const closeTimer = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (closeTimer.current !== null) window.clearTimeout(closeTimer.current);
    },
    [],
  );

  /** 所有关闭入口共用：先切 closing 播退场，再让外层卸载；finished 防连点 */
  const beginClose = (action: () => void) => {
    if (finished.current) return;
    finished.current = true;
    setClosing(true);
    closeTimer.current = window.setTimeout(() => {
      action();
      closeTimer.current = null;
    }, SHEET_EXIT_MS);
  };

  const ref = idx.brawlerById.get(brawlerId);
  const stat = getMapStat(idx, mapName, brawlerId);
  const breakdown = useMemo(
    () => brawlerMatchups(idx, mapName, mode, brawlerId),
    [idx, mapName, mode, brawlerId],
  );

  if (!ref) return null;

  const score = stat ? stat.score : null;
  const pickOrder = stat ? stat.pick_order : null;
  const rows = tab === 'weak' ? breakdown.weak : breakdown.strong;
  const weakCount = breakdown.weak.length;
  const strongCount = breakdown.strong.length;

  return (
    <div
      className={`fixed inset-0 z-50 flex items-end scrim ${
        closing ? 'm3-scrim-out' : 'm3-scrim-in'
      }`}
      onClick={() => beginClose(onClose)}
    >
      <div
        className={`mx-auto flex max-h-dvh-86 w-full max-w-[440px] flex-col overflow-hidden rounded-t-2xl border-t border-line-strong bg-surface shadow-card safe-bottom ${
          closing ? 'm3-sheet-out' : 'm3-sheet-in'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* 顶部：英雄 + 本图评分 + 顺位 */}
        <div className="shrink-0 border-b border-line bg-surface/95 px-3 py-2.5 backdrop-blur">
          <div className="flex items-center gap-2.5">
            <Avatar id={brawlerId} name={ref.name} size={44} />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <h2 className="truncate text-[15px] font-bold text-fg">
                  {brawler(ref.name)}
                </h2>
                {pickOrder && <OrderTag order={pickOrder} />}
              </div>
              <p className="mt-0.5 truncate text-[10px] text-subtle">
                {mapLabel(mapName)} · {modeLabel(mode)}
              </p>
            </div>
            <div className="shrink-0 text-right">
              <div className="text-[22px] font-bold leading-none tabular-nums text-accent">
                {score !== null ? score.toFixed(0) : '—'}
              </div>
              <div className="text-[9px] text-subtle">{t('matchup.mapScore')}</div>
            </div>
            <button
              type="button"
              onClick={() => beginClose(onClose)}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-subtle active:bg-press"
              aria-label={t('common.close')}
            >
              <X size={16} />
            </button>
          </div>

          {/* Tab 切换 */}
          <div className="mt-2 flex gap-1 rounded-lg bg-app p-0.5">
            <button
              type="button"
              onClick={() => setTab('weak')}
              className={`flex h-8 flex-1 items-center justify-center gap-1 rounded-md text-[11.5px] font-semibold transition-colors ${
                tab === 'weak' ? 'bg-red-500/15 text-danger' : 'text-muted active:bg-press'
              }`}
            >
              <ShieldAlert size={13} />
              {t('matchup.weak')}
              <span className="tabular-nums opacity-70">{weakCount}</span>
            </button>
            <button
              type="button"
              onClick={() => setTab('strong')}
              className={`flex h-8 flex-1 items-center justify-center gap-1 rounded-md text-[11.5px] font-semibold transition-colors ${
                tab === 'strong'
                  ? 'bg-green-500/15 text-strong'
                  : 'text-muted active:bg-press'
              }`}
            >
              <Swords size={13} />
              {t('matchup.strong')}
              <span className="tabular-nums opacity-70">{strongCount}</span>
            </button>
          </div>
        </div>

        {/* 列表 */}
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          {rows.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-1 px-6 py-10 text-center">
              <p className="text-[12px] text-muted">
                {t(tab === 'weak' ? 'matchup.weakEmpty' : 'matchup.strongEmpty')}
              </p>
              <p className="text-[10px] text-faint">
                {t(breakdown.source === 'none' ? 'matchup.noRecords' : 'matchup.allEven')}
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-line/70">
              {rows.map((row) => (
                <MatchupItem key={row.opponentId} row={row} positive={tab === 'strong'} />
              ))}
            </ul>
          )}
        </div>

        {/* 底部：数据来源提示（模式级兜底时才出现）+ 算分明细入口 */}
        <div className="shrink-0 border-t border-line px-3 py-2">
          {breakdown.source === 'mode' && (
            <p className="mb-1.5 text-[10px] leading-relaxed text-faint">
              {t('matchup.modeNote')}
            </p>
          )}
          {onOpenBreakdown && (
            <button
              type="button"
              onClick={() => onOpenBreakdown && beginClose(onOpenBreakdown)}
              className="mt-1.5 flex w-full items-center justify-center gap-1 rounded-lg bg-raised/80 py-2 text-[11.5px] font-medium text-body active:bg-press"
            >
              {t('matchup.openBreakdown')}
              <ChevronRight size={13} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
