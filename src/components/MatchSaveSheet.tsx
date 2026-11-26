import { useState, type ReactNode } from 'react';
import { Crown, User, X } from 'lucide-react';
import { useTranslation } from '../i18n';
import {
  SCORE_OPTIONS,
  WIN_SCORES,
  formatStatInput,
  parseStatInput,
  resultOfScore,
  type MatchRecord,
  type MatchScore,
  type MatchStat,
} from '../services/matchHistoryStore';
import Avatar from './Avatar';

interface MatchSaveSheetProps {
  /** 正在保存 / 编辑的记录；新建时由当前 BP 生成 */
  record: MatchRecord;
  /** true = 首次保存（显示「先存阵容」快捷入口）；false = 编辑已有记录 */
  isNew: boolean;
  /** 英雄英文原名（译名由 Avatar / 本组件按当前语言解析） */
  getBrawler: (id: number) => { name: string } | undefined;
  onSave: (record: MatchRecord) => void;
  onClose: () => void;
}

/** 输入框草稿：数值以字符串保存，空串 = 未填（保存时转回 null） */
interface StatDraft {
  kills: string;
  deaths: string;
  damage: string;
  isSelf: boolean;
  isStarPlayer: boolean;
}

type StatField = 'kills' | 'deaths' | 'damage';

function initialStats(record: MatchRecord): StatDraft[] {
  return record.allyPicks.map((_, i) => {
    const stat = record.allyStats[i];
    return {
      kills: formatStatInput(stat?.kills ?? null),
      deaths: formatStatInput(stat?.deaths ?? null),
      damage: formatStatInput(stat?.damage ?? null),
      isSelf: stat?.isSelf ?? false,
      isStarPlayer: stat?.isStarPlayer ?? false,
    };
  });
}

/** 只保留非负整数：粘贴 / 输入法带进来的其它字符直接吞掉 */
const digitsOnly = (value: string): string => value.replace(/\D/g, '');

/**
 * 保存 / 编辑一局的底部抽屉。
 *
 * 两条保存路径共用一个组件：
 *   1. 「先存阵容，打完再补录」——一键以 pending 落库，用户可以立刻切回游戏；
 *   2. 直接选比分 + 填战绩——只选胜负也允许保存，K/D/伤害全部选填。
 *
 * 数值输入框刻意不做「默认 0」：空串就是 null（没填），0 才是真的 0。
 * 用 0 兜底会让下一阶段的复盘引擎把「没记录」当成「零输出」。
 */
export default function MatchSaveSheet({
  record,
  isNew,
  getBrawler,
  onSave,
  onClose,
}: MatchSaveSheetProps) {
  const { t, map: mapLabel, mode: modeLabel, brawler } = useTranslation();
  const [score, setScore] = useState<MatchScore | null>(record.score);
  const [stats, setStats] = useState<StatDraft[]>(() => initialStats(record));

  /** 再点一次同一比分 = 取消，回到「待补录」 */
  const pickScore = (next: MatchScore) => setScore((prev) => (prev === next ? null : next));

  /** 「我」「最佳」各自全局唯一：点中一个，其余自动取消 */
  const toggleFlag = (index: number, field: 'isSelf' | 'isStarPlayer') => {
    setStats((prev) =>
      prev.map((s, i) => ({
        ...s,
        [field]: i === index ? !s[field] : false,
      })),
    );
  };

  const setNumber = (index: number, field: StatField, value: string) => {
    setStats((prev) => prev.map((s, i) => (i === index ? { ...s, [field]: digitsOnly(value) } : s)));
  };

  const buildStats = (): MatchStat[] =>
    record.allyPicks.map((pick, i) => ({
      brawlerId: pick.brawlerId,
      kills: parseStatInput(stats[i]?.kills ?? ''),
      deaths: parseStatInput(stats[i]?.deaths ?? ''),
      damage: parseStatInput(stats[i]?.damage ?? ''),
      isSelf: stats[i]?.isSelf ?? false,
      isStarPlayer: stats[i]?.isStarPlayer ?? false,
    }));

  const submit = (nextScore: MatchScore | null) => {
    onSave({
      ...record,
      result: nextScore ? resultOfScore(nextScore) : 'pending',
      score: nextScore,
      allyStats: buildStats(),
    });
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
        aria-label={isNew ? t('save.title') : t('save.editTitle')}
        className="mx-auto flex max-h-dvh-88 w-full max-w-[440px] flex-col overflow-hidden rounded-t-2xl border-t border-slate-700 bg-slate-900 animate-slide-up safe-bottom"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 头部：这一局是哪张图、哪个模式 */}
        <div className="flex shrink-0 items-center gap-2 border-b border-slate-800 px-3 py-2.5">
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-[14px] font-semibold text-slate-100">
              {isNew ? t('save.title') : t('save.editTitle')}
            </h2>
            <p className="mt-0.5 truncate text-[10px] text-slate-500">
              {mapLabel(record.mapId)} · {modeLabel(record.mode)}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-500 active:bg-slate-800"
            aria-label={t('save.cancel')}
          >
            <X size={16} />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-2.5">
          {/* 快捷路径：先存阵容，打完再补 */}
          {isNew && (
            <button
              type="button"
              onClick={() => submit(null)}
              className="mb-3 flex w-full items-center gap-2 rounded-lg border border-sky-500/40 bg-sky-500/10 px-2.5 py-2 text-left transition-colors active:bg-sky-500/20"
            >
              <span className="min-w-0 flex-1">
                <span className="block text-[12.5px] font-semibold text-sky-200">
                  {t('save.quick')}
                </span>
                <span className="mt-0.5 block text-[10px] leading-snug text-sky-400/70">
                  {t('save.quickHint')}
                </span>
              </span>
            </button>
          )}

          {/* 胜负与比分：4 枚胶囊，点中即选，再点取消 */}
          <section className="mb-3">
            <div className="mb-1.5 flex items-baseline justify-between gap-2">
              <h3 className="text-[11px] font-semibold text-slate-300">{t('save.scoreTitle')}</h3>
              <span className="shrink-0 text-[9px] text-slate-600">{t('save.scoreHint')}</span>
            </div>
            <div className="grid grid-cols-4 gap-1.5">
              {SCORE_OPTIONS.map((option) => {
                const active = score === option;
                const win = WIN_SCORES.includes(option);
                return (
                  <button
                    key={option}
                    type="button"
                    onClick={() => pickScore(option)}
                    aria-pressed={active}
                    className={`flex h-9 items-center justify-center gap-1 whitespace-nowrap rounded-lg border text-[11px] font-semibold transition-colors ${
                      active
                        ? win
                          ? 'border-strong/60 bg-strong/15 text-strong'
                          : 'border-red-500/60 bg-red-500/15 text-red-400'
                        : 'border-slate-800 bg-slate-950/60 text-slate-400 active:bg-slate-800'
                    }`}
                  >
                    <span>{t(win ? 'result.win' : 'result.loss')}</span>
                    <span className="tabular-nums">{option}</span>
                  </button>
                );
              })}
            </div>
          </section>

          {/* 我方 3 人战绩（全部选填） */}
          <section>
            <div className="mb-1.5 flex items-baseline justify-between gap-2">
              <h3 className="text-[11px] font-semibold text-slate-300">{t('save.statsTitle')}</h3>
              <span className="shrink-0 text-[9px] text-slate-600">{t('save.statsHint')}</span>
            </div>

            <div className="flex flex-col gap-1.5">
              {record.allyPicks.map((pick, index) => {
                const id = Number(pick.brawlerId);
                const info = Number.isFinite(id) ? getBrawler(id) : undefined;
                const name = info ? brawler(info.name) : `#${pick.brawlerId}`;
                const draft = stats[index]!;

                return (
                  <div
                    key={`${pick.brawlerId}-${index}`}
                    className="rounded-lg border border-slate-800 bg-slate-950/60 p-1.5"
                  >
                    <div className="flex items-center gap-2">
                      <Avatar
                        id={Number.isFinite(id) ? id : 0}
                        name={info?.name ?? `#${pick.brawlerId}`}
                        size={30}
                        rounded="rounded"
                      />
                      <span className="min-w-0 flex-1 truncate text-[12.5px] font-semibold text-slate-200">
                        {name}
                      </span>
                      <div className="flex shrink-0 items-center gap-1">
                        <FlagChip
                          active={draft.isSelf}
                          tone="sky"
                          onClick={() => toggleFlag(index, 'isSelf')}
                          label={t('save.self')}
                        >
                          <User size={9} />
                        </FlagChip>
                        <FlagChip
                          active={draft.isStarPlayer}
                          tone="amber"
                          onClick={() => toggleFlag(index, 'isStarPlayer')}
                          label={t('save.star')}
                        >
                          <Crown size={9} />
                        </FlagChip>
                      </div>
                    </div>

                    <div className="mt-1.5 grid grid-cols-3 gap-1.5">
                      <StatField
                        label={t('save.kills')}
                        value={draft.kills}
                        onChange={(v) => setNumber(index, 'kills', v)}
                      />
                      <StatField
                        label={t('save.deaths')}
                        value={draft.deaths}
                        onChange={(v) => setNumber(index, 'deaths', v)}
                      />
                      <StatField
                        label={t('save.damage')}
                        value={draft.damage}
                        onChange={(v) => setNumber(index, 'damage', v)}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        </div>

        {/* 底部：取消 / 保存 */}
        <div className="grid shrink-0 grid-cols-[auto_minmax(0,1fr)] gap-2 border-t border-slate-800 px-3 py-2">
          <button
            type="button"
            onClick={onClose}
            className="flex h-10 items-center justify-center rounded-lg border border-slate-800 px-4 text-[12.5px] font-semibold text-slate-300 active:bg-slate-800"
          >
            {t('save.cancel')}
          </button>
          <button
            type="button"
            onClick={() => submit(score)}
            className="flex h-10 items-center justify-center rounded-lg bg-sky-600 text-[13px] font-semibold text-white transition-colors active:bg-sky-700"
          >
            {t('save.submit')}
          </button>
        </div>
      </div>
    </div>
  );
}

/** 「我 / 最佳」轻量切换标签 */
function FlagChip({
  active,
  tone,
  label,
  onClick,
  children,
}: {
  active: boolean;
  tone: 'sky' | 'amber';
  label: string;
  onClick: () => void;
  children: ReactNode;
}) {
  const activeCls =
    tone === 'sky'
      ? 'border-sky-500/60 bg-sky-500/15 text-sky-300'
      : 'border-amber-500/60 bg-amber-500/15 text-amber-300';
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`flex h-6 items-center gap-0.5 rounded-full border px-1.5 text-[10px] font-medium transition-colors ${
        active ? activeCls : 'border-slate-800 bg-slate-900/60 text-slate-500 active:bg-slate-800'
      }`}
    >
      {children}
      {label}
    </button>
  );
}

/** 紧凑数字输入：inputMode=numeric 让手机直接弹数字键盘 */
function StatField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="flex min-w-0 flex-col gap-0.5">
      <span className="truncate text-[9px] text-slate-500">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        inputMode="numeric"
        pattern="[0-9]*"
        placeholder="—"
        className="h-8 w-full min-w-0 rounded-md border border-slate-800 bg-slate-900 px-1 text-center text-[13px] tabular-nums text-slate-100 placeholder:text-slate-600 focus:border-slate-600 focus:outline-none"
      />
    </label>
  );
}
