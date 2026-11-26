import { useState } from 'react';
import { Crown, History as HistoryIcon, Pencil, Swords, Trash2 } from 'lucide-react';
import { useTranslation } from '../i18n';
import { summarizeHistory, type MatchRecord } from '../services/matchHistoryStore';
import type { Lang } from '../i18n';
import Avatar from './Avatar';
import ModeIcon from './ModeIcon';

interface HistoryViewProps {
  /** 已按 createdAt 倒序 */
  records: MatchRecord[];
  /** 英雄英文原名（译名按当前语言解析） */
  getBrawler: (id: number) => { name: string } | undefined;
  onEdit: (record: MatchRecord) => void;
  onDelete: (id: string) => void;
  /** 空状态引导：切回 BP 助手 */
  onGoDraft: () => void;
}

/** 时间只到分钟：战绩列表不需要秒，长串反而挤掉地图名 */
function formatTime(ts: number, lang: Lang): string {
  if (!Number.isFinite(ts) || ts <= 0) return '';
  const date = new Date(ts);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString(lang, {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

/** 概览条的一格 */
function OverviewCell({
  label,
  value,
  accent = 'text-slate-100',
}: {
  label: string;
  value: string;
  accent?: string;
}) {
  return (
    <div className="flex min-w-0 flex-col items-center gap-0.5">
      <span className="truncate text-[9px] text-slate-500">{label}</span>
      <span className={`text-[15px] font-bold leading-none tabular-nums ${accent}`}>{value}</span>
    </div>
  );
}

/**
 * 单场对局卡片。
 *
 * 只摊开「这一局是什么、谁上场、结果如何」；详细拆解留给下一阶段的复盘页，
 * 这里放太多数字会让列表失去扫读性。
 */
function MatchCard({
  record,
  getBrawler,
  onEdit,
  onDelete,
}: {
  record: MatchRecord;
  getBrawler: HistoryViewProps['getBrawler'];
  onEdit: (record: MatchRecord) => void;
  onDelete: (id: string) => void;
}) {
  const { t, lang, map: mapLabel, mode: modeLabel, brawler } = useTranslation();
  const [confirming, setConfirming] = useState(false);

  const win = record.result === 'win';
  const loss = record.result === 'loss';
  const resultLabel = win ? t('result.win') : loss ? t('result.loss') : t('result.pending');
  const resultCls = win
    ? 'bg-strong/15 text-strong ring-1 ring-strong/30'
    : loss
      ? 'bg-red-500/15 text-red-400 ring-1 ring-red-500/30'
      : 'bg-slate-700/40 text-slate-400 ring-1 ring-slate-600/40';

  /** 英雄 ID 字符串 → 头像 / 译名所需信息（数据里查不到时用 #id 兜底） */
  const heroOf = (brawlerId: string) => {
    const num = Number(brawlerId);
    const info = Number.isFinite(num) ? getBrawler(num) : undefined;
    return {
      avatarId: Number.isFinite(num) ? num : 0,
      name: info?.name ?? `#${brawlerId}`,
      label: info ? brawler(info.name) : `#${brawlerId}`,
    };
  };

  /** 摘要优先「我」，其次「最佳」；两者都没标就不显示摘要行 */
  const marked = record.allyStats.find((s) => s.isSelf) ?? record.allyStats.find((s) => s.isStarPlayer);
  const markedHasData =
    marked !== undefined &&
    (marked.kills !== null || marked.deaths !== null || marked.damage !== null);
  const markedHero = marked ? heroOf(marked.brawlerId) : null;

  return (
    <article className="rounded-lg border border-slate-800 bg-slate-900/50 p-2">
      {/* 地图 + 模式 + 时间 */}
      <div className="flex items-center gap-1.5">
        <ModeIcon mode={record.mode} size={14} />
        <h3 className="min-w-0 flex-1 truncate text-[12.5px] font-semibold text-slate-100">
          {mapLabel(record.mapId)}
        </h3>
        <span className="shrink-0 text-[9.5px] tabular-nums text-slate-600">
          {formatTime(record.createdAt, lang)}
        </span>
      </div>

      {/* 结果胶囊 + 比分 + 模式名 */}
      <div className="mt-1 flex items-center gap-1.5">
        <span
          className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold leading-none ${resultCls}`}
        >
          {resultLabel}
          {record.score ? ` ${record.score}` : ''}
        </span>
        <span className="min-w-0 truncate text-[9.5px] text-slate-500">{modeLabel(record.mode)}</span>
      </div>

      {/* 我方 3 头像 vs 敌方 3 头像 */}
      <div className="mt-2 flex items-center gap-1">
        <div className="flex items-center gap-0.5">
          {record.allyPicks.map((pick, i) => {
            const hero = heroOf(pick.brawlerId);
            return (
              <Avatar
                key={`ally-${pick.brawlerId}-${i}`}
                id={hero.avatarId}
                name={hero.name}
                size={24}
                rounded="rounded"
              />
            );
          })}
        </div>
        <span className="shrink-0 px-0.5 text-[9px] font-bold text-slate-600">VS</span>
        <div className="flex items-center gap-0.5">
          {record.enemyPicks.map((pick, i) => {
            const hero = heroOf(pick.brawlerId);
            return (
              <Avatar
                key={`enemy-${pick.brawlerId}-${i}`}
                id={hero.avatarId}
                name={hero.name}
                size={24}
                rounded="rounded"
              />
            );
          })}
        </div>
      </div>

      {/* 已录入数据时，给标记为「我」或「最佳」的那个人一行 K/D/伤害摘要 */}
      {markedHasData && marked && markedHero && (
        <div className="mt-1.5 flex items-center gap-1 text-[10px] leading-none">
          {marked.isSelf ? (
            <span className="shrink-0 rounded bg-sky-500/15 px-1 py-0.5 text-[9px] font-semibold text-sky-300">
              {t('history.selfTag')}
            </span>
          ) : (
            <Crown size={10} className="shrink-0 text-amber-400" />
          )}
          <span className="min-w-0 truncate font-medium text-slate-300">{markedHero.label}</span>
          <span className="shrink-0 tabular-nums text-slate-500">
            {t('history.statLine', {
              k: marked.kills ?? t('history.unknown'),
              d: marked.deaths ?? t('history.unknown'),
              dmg: marked.damage ?? t('history.unknown'),
            })}
          </span>
        </div>
      )}

      {/* 操作：补录 / 编辑 + 删除（删除要二次确认） */}
      {confirming ? (
        <div className="mt-2 flex items-center gap-1.5 rounded-lg bg-red-500/10 px-2 py-1.5">
          <span className="min-w-0 flex-1 leading-tight">
            <span className="block text-[11px] font-semibold text-red-300">
              {t('history.deleteTitle')}
            </span>
            <span className="block text-[9.5px] text-red-400/70">{t('history.deleteHint')}</span>
          </span>
          <button
            type="button"
            onClick={() => onDelete(record.id)}
            className="h-7 shrink-0 rounded-md bg-red-600 px-2 text-[11px] font-semibold text-white active:bg-red-700"
          >
            {t('history.deleteConfirm')}
          </button>
          <button
            type="button"
            onClick={() => setConfirming(false)}
            className="h-7 shrink-0 rounded-md px-2 text-[11px] text-slate-400 active:bg-slate-800"
          >
            {t('history.deleteCancel')}
          </button>
        </div>
      ) : (
        <div className="mt-2 grid grid-cols-2 gap-1.5">
          <button
            type="button"
            onClick={() => onEdit(record)}
            className="flex h-8 items-center justify-center gap-1 rounded-lg border border-slate-800 text-[11.5px] font-medium text-slate-300 transition-colors active:bg-slate-800"
          >
            <Pencil size={11} />
            {record.result === 'pending' ? t('history.record') : t('history.edit')}
          </button>
          <button
            type="button"
            onClick={() => setConfirming(true)}
            className="flex h-8 items-center justify-center gap-1 rounded-lg border border-slate-800 text-[11.5px] font-medium text-slate-500 transition-colors active:bg-slate-800"
          >
            <Trash2 size={11} />
            {t('history.delete')}
          </button>
        </div>
      )}
    </article>
  );
}

/**
 * 「战绩」一级页面。
 *
 * 顶部概览只回答三件事：打了多少场、已完赛胜率多少、还有几场待补录。
 * 胜率的分母严格排除 pending——把待补录算成负场会让刚存完阵容的用户看到 0%。
 */
export default function HistoryView({
  records,
  getBrawler,
  onEdit,
  onDelete,
  onGoDraft,
}: HistoryViewProps) {
  const { t } = useTranslation();
  const summary = summarizeHistory(records);

  return (
    <div className="flex h-full min-h-0 flex-col bg-slate-950 animate-fade-in">
      <header className="shrink-0 border-b border-slate-800 px-3 pb-2 pt-2 safe-top">
        {/* 横屏时内容区限宽居中，页头跟着一起收，避免标题贴在屏幕最左 */}
        <div className="mx-auto flex w-full max-w-[640px] items-baseline justify-between gap-2">
          <h1 className="flex items-center gap-1.5 text-[14px] font-semibold text-slate-100">
            <HistoryIcon size={15} className="text-sky-400" />
            {t('history.title')}
          </h1>
          <span className="shrink-0 text-[10px] tabular-nums text-slate-500">
            {t('history.count', { n: summary.total })}
          </span>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pb-5 pt-2.5">
        <div className="mx-auto flex w-full max-w-[640px] flex-col">
          {/* 概览条 */}
          <div className="grid grid-cols-3 gap-1.5 rounded-lg border border-slate-800 bg-slate-950/60 px-2 py-2">
            <OverviewCell label={t('history.statTotal')} value={String(summary.total)} />
            <OverviewCell
              label={t('history.statWinRate')}
              value={
                summary.winRate === null
                  ? t('history.unknown')
                  : `${Math.round(summary.winRate * 100)}%`
              }
            />
            <OverviewCell
              label={t('history.statPending')}
              value={String(summary.pending)}
              accent={summary.pending > 0 ? 'text-amber-300' : 'text-slate-100'}
            />
          </div>

          {summary.pending > 0 && (
            <p className="mt-1.5 text-[10px] leading-snug text-amber-400/80">
              {t('history.pendingHint', { n: summary.pending })}
            </p>
          )}

          {records.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 px-6 py-14 text-center">
              <HistoryIcon size={22} className="text-slate-700" />
              <p className="text-[13px] font-semibold text-slate-300">{t('history.emptyTitle')}</p>
              <p className="max-w-[300px] text-[11px] leading-relaxed text-slate-500">
                {t('history.emptyDesc')}
              </p>
              <button
                type="button"
                onClick={onGoDraft}
                className="mt-1 flex h-9 items-center gap-1.5 rounded-lg bg-sky-600 px-3 text-[12px] font-semibold text-white transition-colors active:bg-sky-700"
              >
                <Swords size={13} />
                {t('history.emptyAction')}
              </button>
            </div>
          ) : (
            <div className="mt-2 flex flex-col gap-1.5">
              {records.map((record) => (
                <MatchCard
                  key={record.id}
                  record={record}
                  getBrawler={getBrawler}
                  onEdit={onEdit}
                  onDelete={onDelete}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
