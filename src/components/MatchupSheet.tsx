import { useMemo, useState } from 'react';
import { ChevronRight, Swords, ShieldAlert, X } from 'lucide-react';
import type { MetaIndex } from '../data/metaIndex';
import { getMapStat } from '../data/metaIndex';
import { brawlerCN, mapCN, modeCN } from '../data/localization';
import { brawlerMatchups, type MatchupRow } from '../utils/draftEngine';
import { orderTag } from '../utils/display';
import type { PickOrder } from '../types/meta';
import Avatar from './Avatar';

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
  const tag = orderTag(order);
  if (!tag) return null;
  return (
    <span
      className={`shrink-0 rounded px-1 py-px text-[9px] font-semibold leading-[13px] ${tag.cls}`}
    >
      {tag.label}
    </span>
  );
}

/** 一行对位：对手是谁、他在这张图什么水平、交手过多少场、克制差值多少 */
function MatchupItem({ row, positive }: { row: MatchupRow; positive: boolean }) {
  return (
    <li className="flex items-center gap-2 px-2.5 py-1.5">
      <Avatar id={row.opponentId} name={row.opponentName} size={26} rounded="rounded" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1">
          <span className="truncate text-[12.5px] font-medium leading-tight text-slate-200">
            {row.opponentCn}
          </span>
          {row.opponentPickOrder && <OrderTag order={row.opponentPickOrder} />}
        </div>
        <div className="mt-0.5 flex items-center gap-1 text-[10px] leading-tight text-slate-500">
          <span className="tabular-nums">
            {row.opponentScore !== null ? `本图 ${row.opponentScore.toFixed(0)} 分` : '本图无数据'}
          </span>
          <span className="text-slate-700">·</span>
          <span className="tabular-nums">{row.samples}场</span>
        </div>
      </div>
      <span
        className={`shrink-0 text-[13px] font-bold tabular-nums ${
          positive ? 'text-strong' : 'text-red-400'
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
  const [tab, setTab] = useState<'weak' | 'strong'>('weak');

  const ref = idx.brawlerById.get(brawlerId);
  const stat = getMapStat(idx, mapName, brawlerId);
  const breakdown = useMemo(
    () => brawlerMatchups(idx, mapName, mode, brawlerId),
    [idx, mapName, mode, brawlerId],
  );

  if (!ref) return null;

  const cn = brawlerCN(ref.name);
  const score = stat ? stat.score : null;
  const pickOrder = stat ? stat.pick_order : null;
  const rows = tab === 'weak' ? breakdown.weak : breakdown.strong;
  const weakCount = breakdown.weak.length;
  const strongCount = breakdown.strong.length;

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/60 animate-fade-in" onClick={onClose}>
      <div
        className="flex max-h-dvh-86 w-full flex-col overflow-hidden rounded-t-2xl border-t border-slate-700 bg-slate-900 animate-slide-up safe-bottom"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 顶部：英雄 + 本图评分 + 顺位 */}
        <div className="shrink-0 border-b border-slate-800 bg-slate-900/95 px-3 py-2.5 backdrop-blur">
          <div className="flex items-center gap-2.5">
            <Avatar id={brawlerId} name={ref.name} size={44} />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <h2 className="truncate text-[15px] font-bold text-white">{cn}</h2>
                {pickOrder && <OrderTag order={pickOrder} />}
              </div>
              <p className="mt-0.5 truncate text-[10px] text-slate-500">
                {mapCN(mapName)} · {modeCN(mode)}
              </p>
            </div>
            <div className="shrink-0 text-right">
              <div className="text-[22px] font-bold leading-none tabular-nums text-sky-400">
                {score !== null ? score.toFixed(0) : '—'}
              </div>
              <div className="text-[9px] text-slate-500">本图评分</div>
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

          {/* Tab 切换 */}
          <div className="mt-2 flex gap-1 rounded-lg bg-slate-950/60 p-0.5">
            <button
              type="button"
              onClick={() => setTab('weak')}
              className={`flex h-8 flex-1 items-center justify-center gap-1 rounded-md text-[11.5px] font-semibold transition-colors ${
                tab === 'weak' ? 'bg-red-500/15 text-red-300' : 'text-slate-400 active:bg-slate-800'
              }`}
            >
              <ShieldAlert size={13} />
              劣势对位（怕谁）
              <span className="tabular-nums opacity-70">{weakCount}</span>
            </button>
            <button
              type="button"
              onClick={() => setTab('strong')}
              className={`flex h-8 flex-1 items-center justify-center gap-1 rounded-md text-[11.5px] font-semibold transition-colors ${
                tab === 'strong'
                  ? 'bg-green-500/15 text-green-300'
                  : 'text-slate-400 active:bg-slate-800'
              }`}
            >
              <Swords size={13} />
              优势对位（克谁）
              <span className="tabular-nums opacity-70">{strongCount}</span>
            </button>
          </div>
        </div>

        {/* 列表 */}
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          {rows.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-1 px-6 py-10 text-center">
              <p className="text-[12px] text-slate-400">
                {tab === 'weak' ? '没有明显被克制的对位' : '没有明显占优的对位'}
              </p>
              <p className="text-[10px] text-slate-600">
                {breakdown.source === 'none'
                  ? '该英雄在这张图还没有对位记录'
                  : '|delta| 都在 0 附近，基本是五五开'}
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-slate-800/70">
              {rows.map((row) => (
                <MatchupItem key={row.opponentId} row={row} positive={tab === 'strong'} />
              ))}
            </ul>
          )}
        </div>

        {/* 底部说明 */}
        <div className="shrink-0 border-t border-slate-800 px-3 py-2">
          <p className="text-[10px] leading-relaxed text-slate-600">
            差值 = Log5 预期胜率残差（百分点），
            <span className="text-strong">正数代表我方占优</span>、
            <span className="text-red-400">负数代表被压制</span>。样本量越小越不可靠。
            {breakdown.source === 'mode' && ' 当前展示的是模式级对位（该图样本不足）。'}
          </p>
          {onOpenBreakdown && (
            <button
              type="button"
              onClick={onOpenBreakdown}
              className="mt-1.5 flex w-full items-center justify-center gap-1 rounded-lg bg-slate-800/80 py-2 text-[11.5px] font-medium text-slate-300 active:bg-slate-700"
            >
              查看算分明细
              <ChevronRight size={13} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
