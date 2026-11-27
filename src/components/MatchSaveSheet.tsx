import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { Crown, User, X } from 'lucide-react';
import { useTranslation } from '../i18n';
import { useModalFocus } from '../utils/modalFocus';
import {
  SCORE_OPTIONS,
  WIN_SCORES,
  formatStatInput,
  formatWanInput,
  objectiveIsWan,
  objectiveKindOf,
  parseStatInput,
  parseWanInput,
  resultOfScore,
  sanitizeWanTyping,
  type EnemyStat,
  type MatchRecord,
  type MatchScore,
  type MatchStat,
  type ObjectiveKind,
} from '../services/matchHistoryStore';
import type { MetricKey } from '../services/reviewEngine';
import { unlockSfx } from '../services/reviewSfx';
import Avatar from './Avatar';

/** 抽屉对外暴露的关闭入口（供安卓返回键调用） */
export interface MatchSaveSheetHandle {
  /** 与点 × 完全同一条路径：脏了就存，没动过就直接关 */
  requestClose: () => void;
}

interface MatchSaveSheetProps {
  /** 正在保存 / 编辑的记录；新建时由当前 BP 生成 */
  record: MatchRecord;
  /** true = 首次保存（显示「先存阵容」快捷入口）；false = 编辑已有记录 */
  isNew: boolean;
  /** 英雄英文原名（译名由 Avatar / 本组件按当前语言解析） */
  getBrawler: (id: number) => { name: string } | undefined;
  /** 唯一主操作：保存后直接进复盘（没选比分时只保存并关闭） */
  onSaveAndReview: (record: MatchRecord) => void;
  /**
   * 关闭抽屉（× / 遮罩 / Esc / 安卓返回）。
   * `record` 为 null 表示「什么都没改，不需要落库」——新建局完全没填时走这条，
   * 避免往历史里塞一条空白记录。
   */
  onClose: (record: MatchRecord | null) => void;
}

/**
 * 输入框草稿：数值一律以字符串保存，空串 = 未填（保存时转回 null）。
 * 伤害 / 治疗 / 承伤 / 金库伤害存的是「万」，其它指标存原始整数。
 */
interface StatDraft {
  kills: string;
  deaths: string;
  damage: string;
  healing: string;
  damageTaken: string;
  objective: string;
  isSelf: boolean;
  isStarPlayer: boolean;
}

type Side = 'ally' | 'enemy';

/** 参与金标比较的项（死亡不算领跑项） */
const LEADER_KEYS: readonly MetricKey[] = ['kills', 'damage', 'healing', 'damageTaken', 'objective'];

function draftFrom(
  stat:
    | {
        kills: number | null;
        deaths: number | null;
        damage: number | null;
        healing?: number | null;
        damageTaken?: number | null;
        objectiveValue?: number | null;
        isStarPlayer: boolean;
      }
    | undefined,
  isSelf: boolean,
  objectiveKind: ObjectiveKind | null,
): StatDraft {
  const objectiveValue = stat?.objectiveValue ?? null;
  return {
    kills: formatStatInput(stat?.kills ?? null),
    deaths: formatStatInput(stat?.deaths ?? null),
    damage: formatWanInput(stat?.damage ?? null),
    healing: formatWanInput(stat?.healing ?? null),
    damageTaken: formatWanInput(stat?.damageTaken ?? null),
    objective: objectiveIsWan(objectiveKind)
      ? formatWanInput(objectiveValue)
      : formatStatInput(objectiveValue),
    isSelf,
    isStarPlayer: stat?.isStarPlayer ?? false,
  };
}

/** 只保留非负整数：粘贴 / 输入法带进来的其它字符直接吞掉 */
const digitsOnly = (value: string): string => value.replace(/\D/g, '');

/** 草稿 → 原始整数（万单位自动 ×10000） */
function rawOf(draft: StatDraft, key: MetricKey, objectiveKind: ObjectiveKind | null): number | null {
  switch (key) {
    case 'kills':
      return parseStatInput(draft.kills);
    case 'damage':
      return parseWanInput(draft.damage);
    case 'healing':
      return parseWanInput(draft.healing);
    case 'damageTaken':
      return parseWanInput(draft.damageTaken);
    case 'objective':
      return objectiveIsWan(objectiveKind)
        ? parseWanInput(draft.objective)
        : parseStatInput(draft.objective);
    default:
      return null;
  }
}

/** 单名英雄的录入行：头像 + 译名 + 我/最佳 + 5~6 个数字框 */
function StatRowEditor({
  brawlerId,
  name,
  fallbackName,
  draft,
  side,
  objectiveKind,
  isLeader,
  onToggleSelf,
  onToggleStar,
  onChange,
}: {
  brawlerId: string;
  name: string;
  /** 数据里查不到译名时的 alt 文本 */
  fallbackName: string;
  draft: StatDraft;
  side: Side;
  objectiveKind: ObjectiveKind | null;
  /** 该行是否在某个指标上领跑全场 */
  isLeader: (key: MetricKey) => boolean;
  onToggleSelf?: () => void;
  onToggleStar: () => void;
  onChange: (field: keyof StatDraft, value: string) => void;
}) {
  const { t } = useTranslation();
  const id = Number(brawlerId);
  const ally = side === 'ally';

  return (
    <div
      className={`rounded-lg border border-line border-l-2 bg-app p-1.5 ${
        ally ? 'border-l-ally/60' : 'border-l-enemy/60'
      }`}
    >
      <div className="flex items-center gap-2">
        <Avatar id={Number.isFinite(id) ? id : 0} name={fallbackName} size={28} rounded="rounded" />
        <span className="min-w-0 flex-1 truncate text-[12.5px] font-semibold text-body">
          {name}
        </span>
        <div className="flex shrink-0 items-center gap-1">
          {onToggleSelf && (
            <FlagChip
              active={draft.isSelf}
              tone="sky"
              onClick={onToggleSelf}
              label={t('save.self')}
            >
              <User size={9} />
            </FlagChip>
          )}
          <FlagChip
            active={draft.isStarPlayer}
            tone="amber"
            onClick={onToggleStar}
            label={t('save.star')}
          >
            <Crown size={9} />
          </FlagChip>
        </div>
      </div>

      {/* 第一排：击杀 / 死亡 / 造成伤害 */}
      <div className="mt-1.5 grid grid-cols-3 gap-1.5">
        <StatFieldInput
          label={t('save.kills')}
          value={draft.kills}
          gold={isLeader('kills')}
          onChange={(v) => onChange('kills', digitsOnly(v))}
        />
        <StatFieldInput
          label={t('save.deaths')}
          value={draft.deaths}
          onChange={(v) => onChange('deaths', digitsOnly(v))}
        />
        <StatFieldInput
          label={t('save.damage')}
          value={draft.damage}
          unit={t('save.unitWan')}
          gold={isLeader('damage')}
          onChange={(v) => onChange('damage', sanitizeWanTyping(v))}
        />
      </div>

      {/* 第二排：治疗 / 承伤 / 模式专属（淘汰赛没有第 5 项） */}
      <div className={`mt-1.5 grid gap-1.5 ${objectiveKind ? 'grid-cols-3' : 'grid-cols-2'}`}>
        <StatFieldInput
          label={t('save.healing')}
          value={draft.healing}
          unit={t('save.unitWan')}
          gold={isLeader('healing')}
          onChange={(v) => onChange('healing', sanitizeWanTyping(v))}
        />
        <StatFieldInput
          label={t('save.damageTaken')}
          value={draft.damageTaken}
          unit={t('save.unitWan')}
          gold={isLeader('damageTaken')}
          onChange={(v) => onChange('damageTaken', sanitizeWanTyping(v))}
        />
        {objectiveKind && (
          <StatFieldInput
            label={t(`objective.${objectiveKind}`)}
            value={draft.objective}
            unit={objectiveIsWan(objectiveKind) ? t('save.unitWan') : undefined}
            gold={isLeader('objective')}
            onChange={(v) =>
              onChange(
                'objective',
                objectiveIsWan(objectiveKind) ? sanitizeWanTyping(v) : digitsOnly(v),
              )
            }
          />
        )}
      </div>
    </div>
  );
}

/**
 * 保存 / 编辑一局的底部抽屉。
 *
 * 保存路径收敛成两条，都走「不丢数据」这条原则：
 *   1. 「保存并复盘」——底部唯一主按钮，存完直接进评级面板；
 *   2. 任何关闭手势（× / 遮罩 / Esc / 安卓返回）——脏数据自动落库再关，
 *      新建局完全没填时直接关，不往历史里塞空白记录。
 *
 * 「先存阵容，打完再补录」保留在顶部卡片里：一键以 pending 落库，用户可以立刻切回游戏。
 *
 * 指标口径对齐官方结算面板：击杀 / 死亡 / 造成伤害 / 治疗 / 承受伤害 + 1 项模式专属。
 * 大数值（伤害 / 治疗 / 承伤 / 金库伤害）按「万」录入——手机上敲 5 位数太慢，
 * 而 `8.02` 这种两位小数已经足够精确（误差 ≤ 50）。
 *
 * 数值输入框刻意不做「默认 0」：空串就是 null（没填），0 才是真的 0。
 * 用 0 兜底会让复盘引擎把「没记录」当成「零输出」。
 */
const MatchSaveSheet = forwardRef<MatchSaveSheetHandle, MatchSaveSheetProps>(function MatchSaveSheet(
  { record, isNew, getBrawler, onSaveAndReview, onClose },
  ref,
) {
  const { t, map: mapLabel, mode: modeLabel, brawler } = useTranslation();
  const dialogRef = useRef<HTMLDivElement>(null);
  useModalFocus(dialogRef);
  const objectiveKind = objectiveKindOf(record.mode);
  const [score, setScore] = useState<MatchScore | null>(record.score);
  const [team, setTeam] = useState<Side>('ally');
  const [allyStats, setAllyStats] = useState<StatDraft[]>(() =>
    record.allyPicks.map((_, i) =>
      draftFrom(record.allyStats[i], record.allyStats[i]?.isSelf ?? false, objectiveKind),
    ),
  );
  const [enemyStats, setEnemyStats] = useState<StatDraft[]>(() =>
    (record.enemyStats ?? []).map((stat) => draftFrom(stat, false, objectiveKind)),
  );

  const setOf = (side: Side) => (side === 'ally' ? allyStats : enemyStats);

  /**
   * 全场单项最高（6 人一起比）：返回 `${side}-${index}-${key}` 集合。
   * 只统计「有值且 > 0」的项，并列都算领跑——和游戏结算面板的金标口径一致。
   */
  const leaderKeys = useMemo(() => {
    const rows: Array<{ side: Side; index: number; draft: StatDraft }> = [
      ...allyStats.map((draft, index) => ({ side: 'ally' as const, index, draft })),
      ...enemyStats.map((draft, index) => ({ side: 'enemy' as const, index, draft })),
    ];
    const best: Record<string, number> = {};
    for (const row of rows) {
      for (const key of LEADER_KEYS) {
        const value = rawOf(row.draft, key, objectiveKind);
        if (value !== null && value > (best[key] ?? 0)) best[key] = value;
      }
    }
    const keys = new Set<string>();
    for (const row of rows) {
      for (const key of LEADER_KEYS) {
        const value = rawOf(row.draft, key, objectiveKind);
        if (value !== null && value > 0 && value === best[key]) {
          keys.add(`${row.side}-${row.index}-${key}`);
        }
      }
    }
    return keys;
  }, [allyStats, enemyStats, objectiveKind]);

  /** 再点一次同一比分 = 取消，回到「待补录」 */
  const pickScore = (next: MatchScore) => setScore((prev) => (prev === next ? null : next));

  const updateDraft = (side: Side, index: number, patch: Partial<StatDraft>) => {
    const apply = (prev: StatDraft[]) =>
      prev.map((s, i) => (i === index ? { ...s, ...patch } : s));
    if (side === 'ally') setAllyStats(apply);
    else setEnemyStats(apply);
  };

  /**
   * 「我」只在我方生效且全局唯一。
   * 「最佳」跨双方唯一：勾任意一人，其余 5 人（含另一队）自动取消。
   */
  const toggleSelf = (index: number) => {
    const next = !allyStats[index]?.isSelf;
    setAllyStats((prev) => prev.map((s, i) => ({ ...s, isSelf: i === index ? next : false })));
  };

  const toggleStar = (side: Side, index: number) => {
    const active = !setOf(side)[index]?.isStarPlayer;
    const only = (prev: StatDraft[]) =>
      prev.map((s, i) => ({ ...s, isStarPlayer: i === index ? active : false }));
    const clearAll = (prev: StatDraft[]) => prev.map((s) => ({ ...s, isStarPlayer: false }));

    if (side === 'ally') {
      setAllyStats(only);
      setEnemyStats(clearAll);
    } else {
      setEnemyStats(only);
      setAllyStats(clearAll);
    }
  };

  const buildAllyStats = (): MatchStat[] =>
    record.allyPicks.map((pick, i) => {
      const draft = allyStats[i] ?? draftFrom(undefined, false, objectiveKind);
      return {
        brawlerId: pick.brawlerId,
        kills: parseStatInput(draft.kills),
        deaths: parseStatInput(draft.deaths),
        damage: parseWanInput(draft.damage),
        healing: parseWanInput(draft.healing),
        damageTaken: parseWanInput(draft.damageTaken),
        // 淘汰赛没有第 5 项，历史里残留的值也一并清成 null
        objectiveValue:
          objectiveKind === null
            ? null
            : objectiveIsWan(objectiveKind)
              ? parseWanInput(draft.objective)
              : parseStatInput(draft.objective),
        isSelf: draft.isSelf,
        isStarPlayer: draft.isStarPlayer,
      };
    });

  const buildEnemyStats = (): EnemyStat[] =>
    record.enemyPicks.map((pick, i) => {
      const draft = enemyStats[i] ?? draftFrom(undefined, false, objectiveKind);
      return {
        brawlerId: pick.brawlerId,
        kills: parseStatInput(draft.kills),
        deaths: parseStatInput(draft.deaths),
        damage: parseWanInput(draft.damage),
        healing: parseWanInput(draft.healing),
        damageTaken: parseWanInput(draft.damageTaken),
        objectiveValue:
          objectiveKind === null
            ? null
            : objectiveIsWan(objectiveKind)
              ? parseWanInput(draft.objective)
              : parseStatInput(draft.objective),
        isStarPlayer: draft.isStarPlayer,
      };
    });

  const withStats = (nextScore: MatchScore | null): MatchRecord => ({
    ...record,
    result: nextScore ? resultOfScore(nextScore) : 'pending',
    score: nextScore,
    allyStats: buildAllyStats(),
    enemyStats: buildEnemyStats(),
  });

  /**
   * 新建局是否被改动过：选了比分，或任意一行填了数值 / 勾了「我」「最佳」。
   * 编辑已有对局一律视为「有内容要存」。
   */
  const isDirty = (): boolean => {
    if (!isNew) return true;
    if (score !== null) return true;
    return [...allyStats, ...enemyStats].some(
      (draft) =>
        draft.isSelf ||
        draft.isStarPlayer ||
        [draft.kills, draft.deaths, draft.damage, draft.healing, draft.damageTaken, draft.objective].some(
          (value) => value.trim() !== '',
        ),
    );
  };

  /**
   * 关闭的唯一入口：× / 遮罩 / Esc / 安卓返回全部走这里。
   * 脏数据先落库（不弹复盘），完全没动过的新建局直接关——不写空白条目。
   */
  const requestClose = () => {
    onClose(isDirty() ? withStats(score) : null);
  };

  // 用 ref 转存最新实现，键盘监听与返回键句柄只注册一次，但永远读到当前表单状态
  const closeRef = useRef(requestClose);
  closeRef.current = requestClose;

  useImperativeHandle(ref, () => ({ requestClose: () => closeRef.current() }), []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.stopPropagation();
      closeRef.current();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  /** 底部唯一主操作：存完直接进复盘；没选比分时只保存并关闭（复盘需要比分才能算） */
  const submitAndReview = () => {
    unlockSfx();
    onSaveAndReview(withStats(score));
  };

  const picks = team === 'ally' ? record.allyPicks : record.enemyPicks;
  const drafts = team === 'ally' ? allyStats : enemyStats;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end scrim animate-fade-in"
      onClick={requestClose}
      role="presentation"
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={isNew ? t('save.title') : t('save.editTitle')}
        className="mx-auto flex max-h-dvh-88 w-full max-w-[440px] flex-col overflow-hidden rounded-t-2xl border-t border-line-strong bg-surface shadow-card animate-slide-up landscape:max-w-[720px] safe-bottom"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 头部：这一局是哪张图、哪个模式 */}
        <div className="flex shrink-0 items-center gap-2 border-b border-line px-3 py-2.5">
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-[14px] font-semibold text-fg">
              {isNew ? t('save.title') : t('save.editTitle')}
            </h2>
            <p className="mt-0.5 truncate text-[10px] text-subtle">
              {mapLabel(record.mapId)} · {modeLabel(record.mode)}
            </p>
          </div>
          <button
            type="button"
            onClick={requestClose}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-subtle active:bg-press"
            aria-label={t('save.close')}
          >
            <X size={16} />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-2.5">
          {/* 快捷路径：先存阵容，打完再补 */}
          {isNew && (
            <button
              type="button"
              onClick={() => onClose(withStats(null))}
              className="mb-3 flex w-full items-center gap-2 rounded-[14px] border border-accent/40 bg-accent-soft px-2.5 py-2 text-left transition-colors active:bg-press/60"
            >
              <span className="min-w-0 flex-1">
                <span className="block text-[12.5px] font-semibold text-accent">
                  {t('save.quick')}
                </span>
                <span className="mt-0.5 block text-[10px] leading-snug text-accent/70">
                  {t('save.quickHint')}
                </span>
              </span>
            </button>
          )}

          {/* 胜负与比分：4 枚胶囊，点中即选，再点取消 */}
          <section className="mb-3">
            <div className="mb-1.5 flex items-baseline justify-between gap-2">
              <h3 className="text-[11px] font-semibold text-body">{t('save.scoreTitle')}</h3>
              <span className="shrink-0 text-[9px] text-faint">{t('save.scoreHint')}</span>
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
                          : 'border-red-500/60 bg-red-500/15 text-danger'
                        : 'border-line bg-raised text-muted active:bg-press'
                    }`}
                  >
                    <span>{t(win ? 'result.win' : 'result.loss')}</span>
                    <span className="tabular-nums">{option}</span>
                  </button>
                );
              })}
            </div>
          </section>

          {/* 双方战绩：Tab 切换，避免 6 行把页面拖长 */}
          <section>
            <div className="mb-1.5 flex items-baseline justify-between gap-2">
              <h3 className="text-[11px] font-semibold text-body">{t('save.statsTitle')}</h3>
              <span className="shrink-0 text-[9px] text-faint">{t('save.statsHint')}</span>
            </div>

            <div
              className="mb-2 grid grid-cols-2 gap-1 rounded-lg bg-app/70 p-0.5"
              role="tablist"
              aria-label={t('save.statsTitle')}
            >
              {(['ally', 'enemy'] as const).map((side) => {
                const active = team === side;
                const ally = side === 'ally';
                return (
                  <button
                    key={side}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => setTeam(side)}
                    className={`flex h-8 items-center justify-center gap-1.5 rounded-md text-[11.5px] font-semibold transition-colors ${
                      active
                        ? ally
                          ? 'bg-ally/15 text-ally ring-1 ring-ally/40'
                          : 'bg-enemy/15 text-enemy ring-1 ring-enemy/40'
                        : 'text-muted active:bg-press'
                    }`}
                  >
                    <span
                      className={`h-1.5 w-1.5 rounded-full ${ally ? 'bg-ally' : 'bg-enemy'} ${
                        active ? '' : 'opacity-40'
                      }`}
                      aria-hidden
                    />
                    {t(ally ? 'save.teamAlly' : 'save.teamEnemy')}
                  </button>
                );
              })}
            </div>

            <div className="flex flex-col gap-1.5">
              {picks.map((pick, index) => {
                const id = Number(pick.brawlerId);
                const info = Number.isFinite(id) ? getBrawler(id) : undefined;
                return (
                  <StatRowEditor
                    key={`${team}-${pick.brawlerId}-${index}`}
                    brawlerId={pick.brawlerId}
                    name={info ? brawler(info.name) : `#${pick.brawlerId}`}
                    fallbackName={info?.name ?? `#${pick.brawlerId}`}
                    draft={drafts[index] ?? draftFrom(undefined, false, objectiveKind)}
                    side={team}
                    objectiveKind={objectiveKind}
                    isLeader={(key) => leaderKeys.has(`${team}-${index}-${key}`)}
                    onToggleSelf={team === 'ally' ? () => toggleSelf(index) : undefined}
                    onToggleStar={() => toggleStar(team, index)}
                    onChange={(field, value) =>
                      updateDraft(team, index, { [field]: value } as Partial<StatDraft>)
                    }
                  />
                );
              })}
            </div>
          </section>
        </div>

        {/* 底部：只有一个通栏主操作——保存并复盘 */}
        <div className="shrink-0 border-t border-line px-3 py-2">
          <button
            type="button"
            onClick={submitAndReview}
            className="bg-accent text-accent-on flex h-11 w-full items-center justify-center rounded-[16px] text-[13px] font-semibold transition-opacity active:opacity-80"
          >
            {t('save.saveAndReview')}
          </button>
        </div>
      </div>
    </div>
  );
});

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
      ? 'border-accent/60 bg-accent-soft text-accent'
      : 'border-gold/60 bg-amber-500/15 text-gold';
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`flex h-6 items-center gap-0.5 rounded-full border px-1.5 text-[10px] font-medium transition-colors ${
        active ? activeCls : 'border-line bg-surface/60 text-subtle active:bg-press'
      }`}
    >
      {children}
      {label}
    </button>
  );
}

/**
 * 紧凑数字输入。
 *
 * `unit` 有值时右侧显示一个轻量单位角标（万），此时输入框接受小数点；
 * 否则只收非负整数。`gold` 是「全场最高」的金标高亮。
 */
function StatFieldInput({
  label,
  value,
  unit,
  gold = false,
  onChange,
}: {
  label: string;
  value: string;
  unit?: string;
  gold?: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <label className="flex min-w-0 flex-col gap-0.5">
      <span className={`truncate text-[9px] ${gold ? 'text-gold' : 'text-subtle'}`}>
        {label}
      </span>
      <span className="relative block">
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          inputMode={unit ? 'decimal' : 'numeric'}
          pattern={unit ? '[0-9.]*' : '[0-9]*'}
          placeholder="—"
          className={`h-8 w-full min-w-0 rounded-md border bg-raised px-1 text-center text-[13px] tabular-nums focus:outline-none ${
            unit ? 'pr-4' : ''
          } ${
            gold
              ? 'border-gold/70 bg-amber-400/[0.06] text-gold'
              : 'border-line text-fg focus:border-line-strong'
          }`}
        />
        {unit && (
          <span
            className={`pointer-events-none absolute right-1 top-1/2 -translate-y-1/2 text-[8px] ${
              gold ? 'text-gold/80' : 'text-subtle'
            }`}
            aria-hidden
          >
            {unit}
          </span>
        )}
      </span>
    </label>
  );
}

export default MatchSaveSheet;
