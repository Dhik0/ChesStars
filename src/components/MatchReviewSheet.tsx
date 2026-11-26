import { useEffect, useMemo, useState } from 'react';
import { Crown, Pencil, Volume2, VolumeX, X } from 'lucide-react';
import type { MetaIndex } from '../data/metaIndex';
import { useTranslation } from '../i18n';
import type { MatchRecord } from '../services/matchHistoryStore';
import {
  GRADE_SYMBOL,
  reviewMatch,
  type BpContext,
  type MetricKey,
  type PlayerReview,
  type ReviewGrade,
  type ReviewSide,
} from '../services/reviewEngine';
import { playReviewSfx, useSfxMuted } from '../services/reviewSfx';
import { formatBigNumber } from '../utils/display';
import Avatar from './Avatar';
import ModeIcon from './ModeIcon';

interface MatchReviewSheetProps {
  idx: MetaIndex;
  record: MatchRecord;
  /** 英雄英文原名（译名按当前语言解析） */
  getBrawler: (id: number) => { name: string } | undefined;
  /** 底部「编辑战绩」：关掉复盘、打开保存抽屉 */
  onEdit: () => void;
  onClose: () => void;
}

/** 揭晓间隔：3 人以内 350ms 稳住节奏；超过 3 人（双方都录了）收紧到 260ms */
const REVEAL_STEP_MS = 350;
const REVEAL_STEP_FAST_MS = 260;

/** 评级配色（国象记谱习惯）：!! 青蓝 / ⭐ 亮绿 / 👍 淡绿 / ?! 黄 / ? 橙 / ?? 红 */
const GRADE_TONE: Record<ReviewGrade, string> = {
  brilliant: 'border-cyan-400/70 bg-cyan-400/15 text-cyan-300',
  best: 'border-green-500/70 bg-green-500/15 text-green-400',
  good: 'border-green-300/60 bg-green-300/10 text-green-200',
  inaccuracy: 'border-yellow-400/70 bg-yellow-400/15 text-yellow-300',
  mistake: 'border-orange-400/70 bg-orange-400/15 text-orange-300',
  blunder: 'border-red-500/70 bg-red-500/15 text-red-400',
};

/** BP 难度标签配色：逆风偏暖、优势偏冷，均势保持中性 */
const CONTEXT_TONE: Record<BpContext, string> = {
  disadvantaged: 'bg-red-500/10 text-red-300 ring-1 ring-red-500/25',
  neutral: 'bg-slate-700/40 text-slate-400 ring-1 ring-slate-600/40',
  advantaged: 'bg-sky-500/10 text-sky-300 ring-1 ring-sky-500/25',
};

/** 整局标签配色 */
const TAG_TONE: Record<string, string> = {
  comeback: 'bg-cyan-400/10 text-cyan-300 ring-1 ring-cyan-400/30',
  throw: 'bg-red-500/10 text-red-300 ring-1 ring-red-500/30',
  allOnline: 'bg-green-500/10 text-green-300 ring-1 ring-green-500/30',
  carry: 'bg-amber-400/10 text-amber-300 ring-1 ring-amber-400/30',
  shaky: 'bg-orange-400/10 text-orange-300 ring-1 ring-orange-400/30',
  incomplete: 'bg-slate-700/40 text-slate-400 ring-1 ring-slate-600/40',
};

/** 一个指标格：上小字标签、下数值；`gold` = 全场最高（金标） */
function StatCell({
  label,
  value,
  gold = false,
}: {
  label: string;
  value: string;
  gold?: boolean;
}) {
  return (
    <div
      className={`flex min-w-0 flex-col items-center gap-0.5 rounded-md border px-1 py-1 ${
        gold ? 'border-amber-400/60 bg-amber-400/[0.07]' : 'border-transparent bg-slate-900/60'
      }`}
    >
      <span className={`truncate text-[8.5px] ${gold ? 'text-amber-300' : 'text-slate-500'}`}>
        {label}
      </span>
      <span
        className={`text-[12px] font-semibold leading-none tabular-nums ${
          gold ? 'text-amber-200' : 'text-slate-200'
        }`}
      >
        {value}
      </span>
    </div>
  );
}

/** 分区标题：阵营色点 + 名称 + 人数 */
function TeamHeader({ side, count }: { side: ReviewSide; count: number }) {
  const { t } = useTranslation();
  const ally = side === 'ally';
  return (
    <div className="mb-1.5 flex items-center gap-1.5">
      <span
        className={`h-1.5 w-1.5 shrink-0 rounded-full ${ally ? 'bg-ally' : 'bg-enemy'}`}
        aria-hidden
      />
      <h3 className={`text-[11px] font-bold tracking-wide ${ally ? 'text-ally' : 'text-enemy'}`}>
        {t(ally ? 'review.allyTeam' : 'review.enemyTeam')}
      </h3>
      <span className="text-[9px] tabular-nums text-slate-600">{count}</span>
      <span className="h-px flex-1 bg-slate-800" />
    </div>
  );
}

/**
 * 评级角标。
 *
 * 只有 `!!` 是可点的（点一下重播妙手音效）——参照 Chess.com：
 * 其余档位只有视觉弹出，不做成按钮，也就不会给出「能点」的错误暗示。
 */
function GradeBadge({ grade, revealed }: { grade: ReviewGrade; revealed: boolean }) {
  const { t } = useTranslation();
  const playable = grade === 'brilliant';
  const cls = `flex h-11 w-11 shrink-0 flex-col items-center justify-center gap-0.5 rounded-lg border ${
    GRADE_TONE[grade]
  } ${revealed ? 'animate-grade-pop' : 'opacity-0'}`;
  const body = (
    <>
      <span className="text-[15px] font-black leading-none">{GRADE_SYMBOL[grade]}</span>
      <span className="text-[8px] font-semibold leading-none">{t(`review.grade.${grade}`)}</span>
    </>
  );

  if (!playable) return <span className={cls}>{body}</span>;

  return (
    <button
      type="button"
      onClick={() => playReviewSfx(grade)}
      aria-label={`${t(`review.grade.${grade}`)} · ${GRADE_SYMBOL[grade]}`}
      title={t(`review.grade.${grade}`)}
      className={`${cls} transition-transform active:scale-95`}
    >
      {body}
    </button>
  );
}

/** 单名英雄的复盘卡片 */
function ReviewCard({
  player,
  revealed,
  getBrawler,
}: {
  player: PlayerReview;
  revealed: boolean;
  getBrawler: (id: number) => { name: string } | undefined;
}) {
  const { t, lang, brawler } = useTranslation();
  const id = Number(player.brawlerId);
  const info = Number.isFinite(id) ? getBrawler(id) : undefined;
  const displayName = info ? brawler(info.name) : `#${player.brawlerId}`;
  const grade = player.grade;
  const ally = player.side === 'ally';

  /**
   * 第二排指标：治疗 / 承伤 / 模式专属。
   * 只渲染录入了的项——空值占一格会让卡片变长又没信息。
   */
  const extraCells: Array<{ key: MetricKey; label: string; value: string }> = [];
  if (player.metrics) {
    const m = player.metrics;
    if (m.healingPerGame !== null) {
      extraCells.push({
        key: 'healing',
        label: t('review.healing'),
        value: formatBigNumber(m.healingPerGame, lang),
      });
    }
    if (m.damageTakenPerGame !== null) {
      extraCells.push({
        key: 'damageTaken',
        label: t('review.damageTaken'),
        value: formatBigNumber(m.damageTakenPerGame, lang),
      });
    }
    if (m.objectivePerGame !== null && player.objectiveKind) {
      extraCells.push({
        key: 'objective',
        label: t(`objective.${player.objectiveKind}`),
        value:
          player.objectiveKind === 'safeDamage'
            ? formatBigNumber(m.objectivePerGame, lang)
            : String(m.objectivePerGame),
      });
    }
  }

  return (
    <article
      className={`rounded-lg border border-slate-800 border-l-2 bg-slate-950/60 p-2 ${
        ally ? 'border-l-ally/70' : 'border-l-enemy/70'
      }`}
    >
      <div className="flex items-center gap-2">
        <Avatar
          id={Number.isFinite(id) ? id : 0}
          name={info?.name ?? `#${player.brawlerId}`}
          size={38}
        />

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1">
            <span className="truncate text-[13px] font-semibold text-slate-100">
              {displayName}
            </span>
            {player.isSelf && (
              <span className="shrink-0 rounded-full bg-sky-500/15 px-1.5 py-0.5 text-[9px] font-semibold leading-none text-sky-300">
                {t('history.selfTag')}
              </span>
            )}
            {player.isStarPlayer && (
              <span className="flex shrink-0 items-center gap-0.5 rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[9px] font-semibold leading-none text-amber-300">
                <Crown size={8} />
                {t('history.starTag')}
              </span>
            )}
          </div>
          <div className="mt-1 flex items-center gap-1">
            <span
              className={`shrink-0 rounded px-1 py-0.5 text-[9px] font-semibold leading-none ${
                CONTEXT_TONE[player.bpContext]
              }`}
            >
              {t(`review.context.${player.bpContext}`)}
            </span>
            {player.score !== null && (
              <span className="shrink-0 text-[9.5px] tabular-nums text-slate-500">
                {t('review.scoreLabel')} {player.score}
              </span>
            )}
          </div>
        </div>

        {grade ? (
          <GradeBadge grade={grade} revealed={revealed} />
        ) : (
          <span className="shrink-0 rounded-lg border border-dashed border-slate-700 px-2 py-1.5 text-[9.5px] leading-tight text-slate-500">
            {t('review.noData')}
          </span>
        )}
      </div>

      {player.metrics ? (
        <>
          <div className="mt-2 grid grid-cols-4 gap-1">
            <StatCell
              label={t('review.kd')}
              value={player.metrics.kd === null ? '—' : player.metrics.kd.toFixed(2)}
            />
            <StatCell
              label={t('review.kpg')}
              value={
                player.metrics.killsPerGame === null ? '—' : String(player.metrics.killsPerGame)
              }
              gold={player.highlights.includes('kills')}
            />
            <StatCell
              label={t('review.dpg')}
              value={
                player.metrics.deathsPerGame === null ? '—' : String(player.metrics.deathsPerGame)
              }
            />
            <StatCell
              label={t('review.dmgpg')}
              value={formatBigNumber(player.metrics.damagePerGame, lang)}
              gold={player.highlights.includes('damage')}
            />
          </div>

          {/* 第二排只渲染有值的项：治疗 / 承伤 / 模式专属 */}
          {extraCells.length > 0 && (
            <div
              className="mt-1 grid gap-1"
              style={{ gridTemplateColumns: `repeat(${extraCells.length}, minmax(0, 1fr))` }}
            >
              {extraCells.map((cell) => (
                <StatCell
                  key={cell.key}
                  label={cell.label}
                  value={cell.value}
                  gold={player.highlights.includes(cell.key)}
                />
              ))}
            </div>
          )}

          {player.metrics.damageShare !== null && player.metrics.killShare !== null && (
            <div className="mt-1 flex items-center gap-2 text-[9.5px] tabular-nums text-slate-500">
              <span>
                {t('review.dmgShare')} {Math.round(player.metrics.damageShare * 100)}%
              </span>
              <span className="text-slate-700">·</span>
              <span>
                {t('review.killShare')} {Math.round(player.metrics.killShare * 100)}%
              </span>
            </div>
          )}

          <p className="mt-1.5 text-[10.5px] leading-relaxed text-slate-400">
            {t(player.comment.key, player.comment.params)}
          </p>

          {player.notes.length > 0 && (
            <div className="mt-1 flex flex-wrap items-center gap-1">
              {player.notes.map((note) => (
                <span
                  key={note.key}
                  className="rounded bg-amber-400/10 px-1.5 py-0.5 text-[9px] font-semibold text-amber-300"
                >
                  {t(note.key, note.params)}
                </span>
              ))}
            </div>
          )}
        </>
      ) : (
        <p className="mt-1.5 text-[10.5px] leading-relaxed text-slate-600">
          {t('review.noDataHint')}
        </p>
      )}
    </article>
  );
}

/**
 * 局后技术复盘浮层（我方 + 敌方 6 人）。
 *
 * 进来先算分（纯本地），再按「我方 → 敌方」的固定顺序揭晓评级角标；
 * 只揭晓真正有评级的英雄——没录数据的人没有角标，不该占节奏。
 * 3 人以内用 350ms，超过 3 人收紧到 260ms，避免 6 个人揭晓拖成两秒以上。
 *
 * 声音只在 `!!` 出现时响（参照 Chess.com），其余档位纯视觉，避免连续噪音。
 * 音效上下文在打开复盘的点击里就已经解锁（见 HistoryView / MatchSaveSheet），
 * 所以这一声不会被浏览器拦截。
 */
export default function MatchReviewSheet({
  idx,
  record,
  getBrawler,
  onEdit,
  onClose,
}: MatchReviewSheetProps) {
  const { t, map: mapLabel, mode: modeLabel } = useTranslation();
  const { muted, toggle } = useSfxMuted();
  const review = useMemo(() => reviewMatch(idx, record), [idx, record]);

  /** 有评级的英雄，按我方 → 敌方排列 */
  const rated = useMemo(
    () => [...review.allyReviews, ...review.enemyReviews].filter((p) => p.grade !== null),
    [review],
  );
  const stepMs = rated.length > 3 ? REVEAL_STEP_FAST_MS : REVEAL_STEP_MS;
  const revealIndexOf = useMemo(() => {
    const map = new Map<PlayerReview, number>();
    rated.forEach((player, i) => map.set(player, i));
    return map;
  }, [rated]);

  const [revealed, setRevealed] = useState(0);

  // 逐个揭晓：到点弹角标；只有 !! 出声（其余档位纯视觉）
  useEffect(() => {
    setRevealed(0);
    const timers = rated.map((player, index) =>
      window.setTimeout(() => {
        setRevealed(index + 1);
        if (player.grade === 'brilliant') playReviewSfx(player.grade);
      }, stepMs * (index + 1)),
    );
    return () => {
      for (const timer of timers) window.clearTimeout(timer);
    };
  }, [rated, stepMs]);

  if (!review.eligible) return null;

  const win = record.result === 'win';
  const enemyHasData = review.enemyReviews.some((p) => p.hasData);

  const cardOf = (player: PlayerReview) => {
    const index = revealIndexOf.get(player);
    return (
      <ReviewCard
        key={`${player.side}-${player.brawlerId}`}
        player={player}
        revealed={index !== undefined && revealed > index}
        getBrawler={getBrawler}
      />
    );
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end bg-black/60 animate-fade-in"
      onClick={onClose}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t('review.title')}
        className="mx-auto flex max-h-dvh-88 w-full max-w-[440px] flex-col overflow-hidden rounded-t-2xl border-t border-slate-700 bg-slate-900 animate-slide-up landscape:max-w-[760px] safe-bottom"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 顶部：地图 / 模式 / 比分 / 双方均分 / 音效开关 */}
        <div className="shrink-0 border-b border-slate-800 px-3 py-2.5">
          <div className="flex items-center gap-2">
            <ModeIcon mode={record.mode} size={16} />
            <div className="min-w-0 flex-1">
              <h2 className="truncate text-[14px] font-semibold text-slate-100">
                {mapLabel(record.mapId)}
              </h2>
              <p className="mt-0.5 truncate text-[10px] text-slate-500">
                {modeLabel(record.mode)} · {t('review.title')}
              </p>
            </div>

            {record.score && (
              <span
                className={`shrink-0 rounded-full px-2 py-1 text-[11px] font-bold leading-none tabular-nums ring-1 ${
                  win
                    ? 'bg-strong/15 text-strong ring-strong/30'
                    : 'bg-red-500/15 text-red-400 ring-red-500/30'
                }`}
              >
                {record.score}
              </span>
            )}

            <button
              type="button"
              onClick={toggle}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-400 active:bg-slate-800"
              aria-label={muted ? t('review.soundOff') : t('review.soundOn')}
              aria-pressed={!muted}
            >
              {muted ? <VolumeX size={15} /> : <Volume2 size={15} />}
            </button>

            <button
              type="button"
              onClick={onClose}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-500 active:bg-slate-800"
              aria-label={t('common.close')}
            >
              <X size={16} />
            </button>
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {review.enemyAvgScore !== null ? (
              // 双方都有数据时才做对比：单边数据下的「对比」只是自说自话
              <span className="flex items-center gap-1 rounded-full bg-slate-950/70 px-2 py-0.5 text-[10px] font-semibold tabular-nums ring-1 ring-slate-700/70">
                <span className="text-ally">
                  {t('review.allyTeam')} {review.allyAvgScore ?? '—'}
                </span>
                <span className="text-slate-600">{t('review.vs')}</span>
                <span className="text-enemy">
                  {t('review.enemyTeam')} {review.enemyAvgScore}
                </span>
              </span>
            ) : (
              <span className="rounded-full bg-sky-500/10 px-2 py-0.5 text-[10px] font-semibold tabular-nums text-sky-300 ring-1 ring-sky-500/30">
                {t('review.teamAvg')} {review.allyAvgScore ?? '—'}
              </span>
            )}

            {review.tags.map((tag) => (
              <span
                key={tag}
                className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                  TAG_TONE[tag] ?? TAG_TONE.incomplete
                }`}
              >
                {t(`review.tag.${tag}`)}
              </span>
            ))}
          </div>
        </div>

        {/* 主体：我方 / 敌方。横屏并排两列，竖屏上下分区 */}
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-2.5">
          <div className="grid gap-2.5 landscape:grid-cols-2 landscape:items-start">
            <section>
              <TeamHeader side="ally" count={review.allyReviews.length} />
              <div className="flex flex-col gap-1.5">{review.allyReviews.map(cardOf)}</div>
            </section>

            <section>
              <TeamHeader side="enemy" count={review.enemyReviews.length} />
              {enemyHasData ? (
                <div className="flex flex-col gap-1.5">{review.enemyReviews.map(cardOf)}</div>
              ) : (
                // 敌方完全没录：收起成一行的提示，别留一大片空白
                <p className="rounded-lg border border-dashed border-slate-800 px-2.5 py-2 text-[10px] leading-relaxed text-slate-500">
                  {t('review.enemyEmpty')}
                </p>
              )}
            </section>
          </div>
        </div>

        {/* 底部：改完数据回到这里会立即重算 */}
        <div className="shrink-0 border-t border-slate-800 px-3 py-2">
          <button
            type="button"
            onClick={onEdit}
            className="flex h-10 w-full items-center justify-center gap-1.5 rounded-lg border border-slate-800 bg-slate-900/80 text-[12.5px] font-semibold text-slate-300 transition-colors active:bg-slate-800"
          >
            <Pencil size={13} />
            {t('review.edit')}
          </button>
        </div>
      </div>
    </div>
  );
}
