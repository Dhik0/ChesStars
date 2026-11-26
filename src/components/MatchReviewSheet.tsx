import { useEffect, useMemo, useState } from 'react';
import { BookOpen, Crown, Pencil, Volume2, VolumeX, X } from 'lucide-react';
import type { MetaIndex } from '../data/metaIndex';
import { useTranslation } from '../i18n';
import type { MatchRecord } from '../services/matchHistoryStore';
import {
  GRADE_ORDER,
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

/** 顶部高光播报条停留时长（与 banner-life 动画时长一致） */
const BANNER_LIFE_MS = 2000;

/**
 * 评级配色（对齐 Chess.com 的记谱习惯）：
 * `!!` 青蓝 / `!` 蓝 / `★` 亮绿 / `✓` 淡绿 / `📖` 棕 / `?!` 黄 / `?` 橙 / `×` 浅红 / `??` 深红
 */
const GRADE_TONE: Record<ReviewGrade, string> = {
  brilliant: 'border-cyan-400/70 bg-cyan-400/15 text-cyan-300',
  great: 'border-blue-400/70 bg-blue-400/15 text-blue-300',
  best: 'border-green-500/70 bg-green-500/15 text-green-400',
  good: 'border-green-300/60 bg-green-300/10 text-green-200',
  book: 'border-amber-700/70 bg-amber-800/25 text-amber-500',
  inaccuracy: 'border-yellow-400/70 bg-yellow-400/15 text-yellow-300',
  mistake: 'border-orange-400/70 bg-orange-400/15 text-orange-300',
  miss: 'border-rose-400/60 bg-rose-500/10 text-rose-300',
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

/** 卡片的稳定标识（同一英雄在同一侧不会重复） */
const cardKeyOf = (player: PlayerReview): string => `${player.side}-${player.brawlerId}`;

/**
 * 评级符号。`book` 用书本图标而不是 emoji——📖 在深色小角标里又糊又跳，
 * 与 ★ / ✓ 这种等宽排印放一起会显得杂乱。
 */
function GradeGlyph({ grade, size = 15 }: { grade: ReviewGrade; size?: number }) {
  if (grade === 'book') {
    // 书本图标比文字符号更耐看，但要跟字号同档，太小会糊成一团
    return <BookOpen size={size - 1} strokeWidth={2.6} aria-hidden />;
  }
  return (
    <span className="font-black leading-none" style={{ fontSize: size }} aria-hidden>
      {GRADE_SYMBOL[grade]}
    </span>
  );
}

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
 * 只有 `!!` 是可点的（点一下重播妙手音效 + 重新触发流光），其余档位只有视觉弹出。
 * `fxNonce` 变化时用 key 强制重挂波纹 / 闪光层，从而让动画重播。
 */
function GradeBadge({
  grade,
  revealed,
  fxNonce,
  onReplay,
}: {
  grade: ReviewGrade;
  revealed: boolean;
  fxNonce: number;
  onReplay?: () => void;
}) {
  const { t } = useTranslation();
  const playable = grade === 'brilliant';
  const cls = `flex h-11 w-11 shrink-0 flex-col items-center justify-center gap-0.5 rounded-lg border ${
    GRADE_TONE[grade]
  } ${revealed ? 'animate-grade-pop' : 'opacity-0'}`;
  const body = (
    <>
      <GradeGlyph grade={grade} />
      <span className="text-[8px] font-semibold leading-none">{t(`review.grade.${grade}`)}</span>
    </>
  );

  if (!playable) return <span className={cls}>{body}</span>;

  return (
    <span className="relative inline-flex shrink-0">
      {/* 能量波纹 + 瞬时闪光：只在 !!/ 重播时出现，动画结束即透明 */}
      {fxNonce > 0 && (
        <>
          <span
            key={`ring-${fxNonce}`}
            aria-hidden
            className="pointer-events-none absolute inset-0 rounded-lg border-2 border-cyan-300/80 animate-brilliant-ring motion-reduce:hidden"
          />
          <span
            key={`flash-${fxNonce}`}
            aria-hidden
            className="pointer-events-none absolute inset-0 rounded-lg bg-cyan-300/30 animate-brilliant-flash motion-reduce:hidden"
          />
        </>
      )}
      <button
        type="button"
        onClick={() => {
          playReviewSfx(grade);
          onReplay?.();
        }}
        aria-label={`${t(`review.grade.${grade}`)} · ${GRADE_SYMBOL[grade]}`}
        title={t(`review.grade.${grade}`)}
        className={`${cls} transition-transform active:scale-95`}
      >
        {body}
      </button>
    </span>
  );
}

/** 单名英雄的复盘卡片（数值一律是总局原值，与结算面板 1:1） */
function ReviewCard({
  player,
  revealed,
  fxNonce,
  onReplay,
  getBrawler,
}: {
  player: PlayerReview;
  revealed: boolean;
  /** `!!` 特效触发计数：每次 +1 都重放流光 */
  fxNonce: number;
  onReplay: () => void;
  getBrawler: (id: number) => { name: string } | undefined;
}) {
  const { t, lang, brawler } = useTranslation();
  const id = Number(player.brawlerId);
  const info = Number.isFinite(id) ? getBrawler(id) : undefined;
  const displayName = info ? brawler(info.name) : `#${player.brawlerId}`;
  const grade = player.grade;
  const ally = player.side === 'ally';
  const brilliant = grade === 'brilliant';
  /** 常驻微光只在揭晓之后亮起，避免「还没轮到他先发光」 */
  const glowing = brilliant && revealed;

  /** 第二排指标：治疗 / 承伤 / 模式专属；只渲染录入了的项 */
  const extraCells: Array<{ key: MetricKey; label: string; value: string }> = [];
  if (player.metrics) {
    const totals = player.metrics.totals;
    if (totals.healing !== null) {
      extraCells.push({
        key: 'healing',
        label: t('review.healing'),
        value: formatBigNumber(totals.healing, lang),
      });
    }
    if (totals.damageTaken !== null) {
      extraCells.push({
        key: 'damageTaken',
        label: t('review.damageTaken'),
        value: formatBigNumber(totals.damageTaken, lang),
      });
    }
    if (totals.objectiveValue !== null && player.objectiveKind) {
      extraCells.push({
        key: 'objective',
        label: t(`objective.${player.objectiveKind}`),
        value:
          player.objectiveKind === 'safeDamage'
            ? formatBigNumber(totals.objectiveValue, lang)
            : String(totals.objectiveValue),
      });
    }
  }

  const totals = player.metrics?.totals;

  return (
    <article
      data-card-key={cardKeyOf(player)}
      data-fx={fxNonce}
      className={`relative overflow-hidden rounded-lg border border-slate-800 border-l-2 bg-slate-950/60 p-2 transition-shadow duration-300 ${
        ally ? 'border-l-ally/70' : 'border-l-enemy/70'
      } ${glowing ? 'shadow-[0_0_22px_-8px_rgba(34,211,238,0.75)] ring-1 ring-cyan-400/60' : ''}`}
    >
      {/* 常驻青蓝氛围：顶部一层很淡的渐变，和普通卡片拉开层次 */}
      {glowing && (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-12 bg-gradient-to-b from-cyan-400/10 to-transparent"
        />
      )}

      {/* 流光扫过：fxNonce 变化即重挂，从而重放 900ms 的斜向高光 */}
      {fxNonce > 0 && (
        <span
          key={`sweep-${fxNonce}`}
          aria-hidden
          className="pointer-events-none absolute inset-y-[-30%] left-0 w-[45%] bg-gradient-to-r from-transparent via-cyan-300/28 to-transparent animate-brilliant-sweep motion-reduce:animate-none"
        />
      )}

      <div className="relative flex items-center gap-2">
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
          <GradeBadge
            grade={grade}
            revealed={revealed}
            fxNonce={fxNonce}
            onReplay={onReplay}
          />
        ) : (
          <span className="shrink-0 rounded-lg border border-dashed border-slate-700 px-2 py-1.5 text-[9.5px] leading-tight text-slate-500">
            {t('review.noData')}
          </span>
        )}
      </div>

      {player.metrics && totals ? (
        <>
          <div className="relative mt-2 grid grid-cols-4 gap-1">
            <StatCell label={t('review.kd')} value={player.metrics.displayKd ?? '—'} />
            <StatCell
              label={t('review.statKills')}
              value={totals.kills === null ? '—' : String(totals.kills)}
              gold={player.highlights.includes('kills')}
            />
            <StatCell
              label={t('review.statDeaths')}
              value={totals.deaths === null ? '—' : String(totals.deaths)}
            />
            <StatCell
              label={t('review.statDamage')}
              value={formatBigNumber(totals.damage, lang)}
              gold={player.highlights.includes('damage')}
            />
          </div>

          {extraCells.length > 0 && (
            <div
              className="relative mt-1 grid gap-1"
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
            <div className="relative mt-1 flex items-center gap-2 text-[9.5px] tabular-nums text-slate-500">
              <span>
                {t('review.dmgShare')} {Math.round(player.metrics.damageShare * 100)}%
              </span>
              <span className="text-slate-700">·</span>
              <span>
                {t('review.killShare')} {Math.round(player.metrics.killShare * 100)}%
              </span>
            </div>
          )}

          <p className="relative mt-1.5 text-[10.5px] leading-relaxed text-slate-400">
            {t(player.comment.key, player.comment.params)}
          </p>

          {player.notes.length > 0 && (
            <div className="relative mt-1 flex flex-wrap items-center gap-1">
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
        <p className="relative mt-1.5 text-[10.5px] leading-relaxed text-slate-600">
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
 * 声音只在 `!!` 出现时响（参照 Chess.com）。声音响起的同时，该卡片会扫过一道青蓝流光、
 * 角标炸开一圈波纹，并在顶部弹一条播报条——小屏上卡片可能还在屏幕外，
 * 播报条是「听得到但找不到人」的兜底，点一下直接滚过去。
 */
export default function MatchReviewSheet({
  idx,
  record,
  getBrawler,
  onEdit,
  onClose,
}: MatchReviewSheetProps) {
  const { t, lang, brawler, map: mapLabel, mode: modeLabel } = useTranslation();
  const { muted, toggle } = useSfxMuted();

  // 评语里的伤害用本地化单位（万 / k），不输出裸整数
  const review = useMemo(
    () => reviewMatch(idx, record, { formatBig: (v) => formatBigNumber(v, lang) }),
    [idx, record, lang],
  );

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

  /** 顶部评级符号汇总：只列本局出现过的档位 */
  const gradeSummary = useMemo(() => {
    const counts = new Map<ReviewGrade, number>();
    for (const player of [...review.allyReviews, ...review.enemyReviews]) {
      if (!player.grade) continue;
      counts.set(player.grade, (counts.get(player.grade) ?? 0) + 1);
    }
    return GRADE_ORDER.filter((grade) => counts.has(grade)).map((grade) => ({
      grade,
      count: counts.get(grade) ?? 0,
    }));
  }, [review]);

  const [revealed, setRevealed] = useState(0);
  /** 每张卡片的 `!!` 特效触发计数：+1 即重放流光 / 波纹 */
  const [fx, setFx] = useState<Record<string, number>>({});
  /** 顶部高光播报条：后触发的直接替换前一个 */
  const [banner, setBanner] = useState<{ player: PlayerReview; at: number } | null>(null);

  const bumpFx = (key: string) =>
    setFx((prev) => ({ ...prev, [key]: (prev[key] ?? 0) + 1 }));

  // 逐个揭晓：到点弹角标；只有 !! 出声 + 触发联动特效
  useEffect(() => {
    setRevealed(0);
    const timers = rated.map((player, index) =>
      window.setTimeout(() => {
        setRevealed(index + 1);
        if (player.grade === 'brilliant') {
          playReviewSfx(player.grade);
          const key = cardKeyOf(player);
          setFx((prev) => ({ ...prev, [key]: (prev[key] ?? 0) + 1 }));
          setBanner({ player, at: Date.now() });
        }
      }, stepMs * (index + 1)),
    );
    return () => {
      for (const timer of timers) window.clearTimeout(timer);
    };
  }, [rated, stepMs]);

  // 播报条 2s 自动消失；连续触发时新 banner 会重置计时
  useEffect(() => {
    if (!banner) return;
    const timer = window.setTimeout(() => setBanner(null), BANNER_LIFE_MS);
    return () => window.clearTimeout(timer);
  }, [banner]);

  if (!review.eligible) return null;

  const win = record.result === 'win';
  const enemyHasData = review.enemyReviews.some((p) => p.hasData);
  const hasCompare = review.enemyAvgScore !== null;

  /** 点击角标重播：音效由角标自己播，这里只负责重放卡片特效 */
  const replayFx = (player: PlayerReview) => bumpFx(cardKeyOf(player));

  /** 点击播报条：滚到那张卡片并重放流光 */
  const focusPlayer = (player: PlayerReview) => {
    const key = cardKeyOf(player);
    const target = document.querySelector<HTMLElement>(`[data-card-key="${key}"]`);
    target?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    bumpFx(key);
  };

  const cardOf = (player: PlayerReview) => {
    const index = revealIndexOf.get(player);
    return (
      <ReviewCard
        key={cardKeyOf(player)}
        player={player}
        revealed={index !== undefined && revealed > index}
        fxNonce={fx[cardKeyOf(player)] ?? 0}
        onReplay={() => replayFx(player)}
        getBrawler={getBrawler}
      />
    );
  };

  const bannerName = banner
    ? (() => {
        const id = Number(banner.player.brawlerId);
        const info = Number.isFinite(id) ? getBrawler(id) : undefined;
        return info ? brawler(info.name) : `#${banner.player.brawlerId}`;
      })()
    : '';

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
        {/* 顶部：地图 / 模式 / 比分 / 音效开关 */}
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

          {/* 对局总览：双色均分方块 + 标签 + 评级符号汇总 */}
          <div className="mt-2 rounded-lg border border-slate-800 bg-slate-950/50 p-1.5">
            <div className="flex items-stretch gap-1.5">
              <div className="flex min-w-0 flex-1 flex-col items-center justify-center rounded-md border border-ally/40 bg-ally/10 py-1">
                <span className="text-[9px] leading-none text-ally/80">
                  {t(hasCompare ? 'review.allyTeam' : 'review.teamAvg')}
                </span>
                <span className="mt-0.5 text-[17px] font-bold leading-none tabular-nums text-ally">
                  {review.allyAvgScore ?? '—'}
                </span>
              </div>

              {hasCompare && (
                <>
                  <span className="self-center text-[9px] font-semibold text-slate-600">
                    {t('review.vs')}
                  </span>
                  <div className="flex min-w-0 flex-1 flex-col items-center justify-center rounded-md border border-enemy/40 bg-enemy/10 py-1">
                    <span className="text-[9px] leading-none text-enemy/80">
                      {t('review.enemyTeam')}
                    </span>
                    <span className="mt-0.5 text-[17px] font-bold leading-none tabular-nums text-enemy">
                      {review.enemyAvgScore}
                    </span>
                  </div>
                </>
              )}
            </div>

            {(review.tags.length > 0 || gradeSummary.length > 0) && (
              <div className="mt-1.5 flex flex-wrap items-center gap-1">
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

                {gradeSummary.length > 0 && (
                  <span className="ml-auto flex items-center gap-1">
                    {gradeSummary.map(({ grade, count }) => (
                      <span
                        key={grade}
                        title={t(`review.grade.${grade}`)}
                        className={`flex items-center gap-0.5 rounded border px-1.5 py-0.5 text-[10px] font-bold leading-none ${GRADE_TONE[grade]}`}
                      >
                        <GradeGlyph grade={grade} size={12} />
                        <span className="tabular-nums">{count}</span>
                      </span>
                    ))}
                  </span>
                )}
              </div>
            )}
          </div>
        </div>

        {/* 主体：我方 / 敌方。横屏并排两列，竖屏上下分区 */}
        <div className="relative flex min-h-0 flex-1 flex-col">
          {/*
            高光播报条：浮在滚动区上方（不进文档流），所以出现 / 消失都不会让内容跳动，
            也不会挡住右上角的关闭 / 静音——那两颗按钮在头部，播报条在这块区域顶端。
            wrapper 必须 pointer-events-none，否则这层会吃掉滚轮与点击。
          */}
          {banner && (
            <div
              key={banner.at}
              className="pointer-events-none absolute inset-x-0 top-0 z-20 px-3 pt-2"
            >
              <button
                type="button"
                onClick={() => focusPlayer(banner.player)}
                aria-label={t('review.brilliantBannerAria', { name: bannerName })}
                className="pointer-events-auto flex w-full items-center gap-1.5 rounded-full border border-cyan-400/50 bg-slate-900/95 px-2 py-1 text-left shadow-lg shadow-cyan-500/10 animate-banner-life motion-reduce:animate-none active:bg-slate-800"
              >
                <Avatar
                  id={Number(banner.player.brawlerId) || 0}
                  name={bannerName}
                  size={18}
                  rounded="rounded-full"
                />
                <span className="min-w-0 flex-1 truncate text-[11px] font-semibold text-cyan-100">
                  {bannerName}
                </span>
                <span className="shrink-0 rounded-full bg-cyan-400/15 px-1.5 py-0.5 text-[9px] font-bold leading-none text-cyan-300">
                  {GRADE_SYMBOL.brilliant} {t('review.grade.brilliant')}
                </span>
              </button>
            </div>
          )}

          {/*
            滚动区必须是 flex 子项（flex-1 min-h-0）而不是 height:100%：
            百分比高度在「高度由 flex 分配」的父级里解析不出来，会退化成内容高度，
            结果就是容器永远不溢出、滚轮和触屏都滚不动（V2.2 实测 bug）。
            这里也不能加 overflow-hidden——那是卡片裁剪流光专用的。
          */}
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
