import { Fragment } from 'react';
import { RotateCcw, Undo2 } from 'lucide-react';
import type { MetaIndex } from '../data/metaIndex';
import type { ActiveSlot, BanValue, DraftState, Side } from '../utils/draftEngine';
import {
  BAN_SLOTS_PER_TEAM,
  TEAM_SLOTS,
  banCount,
  banSideOfIndex,
  isEmptyBan,
  matchupCell,
  slotBase,
  slotPickNumbers,
} from '../utils/draftEngine';
import {
  COUNTER_LIGHT_CLASS,
  baseScoreColor,
  matchupCellTip,
  orderTag,
} from '../utils/display';
import { useLongPress } from '../utils/useLongPress';
import { useTranslation } from '../i18n';
import Avatar from './Avatar';

interface DraftBarProps {
  state: DraftState;
  idx: MetaIndex;
  /** 只回英文原名，译名由本组件按当前语言解析 */
  getBrawler: (id: number) => { name: string } | undefined;
  onActivate: (slot: ActiveSlot) => void;
  onClear: (slot: ActiveSlot) => void;
  /** 长按 / 右键已选槽位：看该英雄本图对位 */
  onMatchup: (brawlerId: number) => void;
  /** 撤回上一步 */
  onUndo: () => void;
  /** 重置整局（清空 Ban 与双方选人） */
  onReset: () => void;
  /** 未选先手时点「蓝先 / 红先」，或在 Ban 行右侧切换先手方 */
  onChooseFirst: (side: Side) => void;
  canUndo: boolean;
  /**
   * 版式：
   *   - `portrait`（默认）：贴底横向操作台，高度按 CSS 变量自适应（矮视口自动压紧）；
   *   - `landscape`：占据横屏左栏剩余高度，3 行选角槽弹性缩放，撤回/重置钉在底端。
   */
  variant?: 'portrait' | 'landscape';
  className?: string;
}

function isActive(active: ActiveSlot, kind: ActiveSlot['kind'], index: number): boolean {
  return active.kind === kind && active.index === index;
}

/* ------------------------------------------------------------------ *
 * 前置态：还没选先手方
 * ------------------------------------------------------------------ */

/**
 * 「蓝先 / 红先」大按钮：等宽两列，蓝=己方先选，红=敌方先选。
 * 不配图标——排位开局的投硬币（Coin Flip）图标在 Brawlify 上没有清晰的独立资源，
 * 与其用交叉双剑误导，不如只留大号粗体文字。
 */
function FirstPickButton({
  side,
  onPick,
  fill = false,
}: {
  side: Side;
  onPick: (s: Side) => void;
  /** 横屏：撑满左栏可用高度 */
  fill?: boolean;
}) {
  const { t } = useTranslation();
  const ally = side === 'ally';
  const label = t(ally ? 'draft.firstAlly' : 'draft.firstEnemy');
  return (
    <button
      type="button"
      onClick={() => onPick(side)}
      className={`flex ${fill ? 'h-full min-h-0' : 'h-[104px]'} items-center justify-center rounded-xl border-2 transition-colors ${
        ally
          ? 'border-ally/60 bg-ally/15 text-ally active:bg-ally/25'
          : 'border-enemy/60 bg-enemy/15 text-enemy active:bg-enemy/25'
      }`}
      aria-label={label}
    >
      <span className="text-[26px] font-bold leading-none tracking-wide">{label}</span>
    </button>
  );
}

/* ------------------------------------------------------------------ *
 * 正式 BP 态
 * ------------------------------------------------------------------ */

interface SlotCellProps {
  kind: Side;
  index: number;
  /** 该槽位的全局蛇形顺位号（1-6） */
  pickNo: number;
  state: DraftState;
  idx: MetaIndex;
  getBrawler: DraftBarProps['getBrawler'];
  onActivate: (slot: ActiveSlot) => void;
  onClear: (slot: ActiveSlot) => void;
  onMatchup: (brawlerId: number) => void;
  /** 横屏：高度由父级 flex 分配（3 行等分、自适应不截断） */
  fill?: boolean;
}

/** 单个已选/空槽位。抽成组件是为了让长按 hook 能合法地按槽位各持一份状态 */
function SlotCell({
  kind,
  index,
  pickNo,
  state,
  idx,
  getBrawler,
  onActivate,
  onClear,
  onMatchup,
  fill = false,
}: SlotCellProps) {
  const { t, brawler } = useTranslation();
  const isAlly = kind === 'ally';
  const arr = isAlly ? state.ally : state.enemy;
  const oppArr = isAlly ? state.enemy : state.ally;
  const id = arr[index];
  const active = isActive(state.active, kind, index);
  const info = id !== undefined ? getBrawler(id) : undefined;
  const base = id !== undefined ? slotBase(idx, state, id) : null;
  const tint = isAlly ? 'bg-ally/15' : 'bg-enemy/15';

  const press = useLongPress({
    onLongPress: () => {
      if (id !== undefined) onMatchup(id);
    },
    onClick: () => (id !== undefined ? onClear({ kind, index }) : onActivate({ kind, index })),
    disabled: id === undefined,
  });

  const ringOf = (side: Side, on: boolean) =>
    side === 'ally'
      ? on
        ? 'ring-2 ring-ally shadow-[0_0_10px_rgba(59,130,246,0.55)]'
        : 'border-ally/45'
      : on
        ? 'ring-2 ring-enemy shadow-[0_0_10px_rgba(239,68,68,0.55)]'
        : 'border-enemy/45';

  const portrait = (
    <span className="relative h-full w-[var(--slot-avatar-w)] shrink-0 overflow-hidden">
      {info && id !== undefined ? (
        // key 跟随英雄 id：落子 / 换人 / 撤回重选都会重播一次弹性入场
        <span key={id} className="block h-full w-full animate-slot-drop motion-reduce:animate-none">
          <Avatar id={id} name={info.name} fill rounded="rounded-none" />
        </span>
      ) : (
        <span
          className={`flex h-full items-center justify-center text-[15px] font-semibold tabular-nums ${
            active ? (isAlly ? 'text-ally/80' : 'text-enemy/80') : 'text-faint'
          }`}
        >
          {pickNo}
        </span>
      )}
      {/* 顺位角标：已选槽位也标出它是全局第几手 */}
      {info && id !== undefined && (
        <span
          className={`absolute top-0 rounded-[2px] bg-black/70 px-1 text-[8px] font-bold leading-[11px] tabular-nums text-white ${
            isAlly ? 'left-0' : 'right-0'
          }`}
        >
          {pickNo}
        </span>
      )}
    </span>
  );

  const scoreBlock = base && (
    <span className="flex flex-col items-end leading-none">
      <span
        className={`text-[13px] font-bold tabular-nums ${
          base.hasData ? baseScoreColor(base.score) : 'text-faint'
        }`}
      >
        {base.hasData ? base.score.toFixed(1) : '—'}
      </span>
    </span>
  );

  /**
   * 中轴竖排色条：**固定 3 格**，自上而下对应对方第 1/2/3 行槽位。
   * 绿=优势 / 红=劣势 / 黄=均势（有五五开数据）/ 深灰=无数据。
   *
   * 每一格都由同一条对称查表记录得出：蓝方第 i 行对红方第 j 行、红方第 j 行
   * 对蓝方第 i 行取到的是同一个数值的正负两面，所以换边后颜色必然互为镜像。
   */
  const strip =
    id !== undefined ? (
      <span className="flex w-[5px] shrink-0 flex-col gap-[2px] py-[4px]">
        {Array.from({ length: TEAM_SLOTS }, (_, i) => {
          const oppId = oppArr[i];
          if (typeof oppId !== 'number') {
            return (
              <span
                key={i}
                className={`flex-1 rounded-[1px] ${COUNTER_LIGHT_CLASS.none}`}
                title={t('draft.oppSlotEmpty', { n: i + 1 })}
              />
            );
          }
          const cell = matchupCell(idx, state.mapName, state.mode, id, oppId);
          const oppRef = getBrawler(oppId);
          const name = oppRef ? brawler(oppRef.name) : '';
          return (
            <span
              key={i}
              className={`flex-1 rounded-[1px] ${COUNTER_LIGHT_CLASS[cell.light]}`}
              title={matchupCellTip(cell, name, t)}
            />
          );
        })}
      </span>
    ) : null;

  /** 信息区：已选显示「基础分 + 顺位」，空槽且激活时显示加号 */
  const tag = base ? orderTag(base.pickOrder) : null;
  const orderChip = tag ? (
    <span
      className={`shrink-0 rounded px-1 text-[8px] font-semibold leading-[12px] ${tag.cls}`}
    >
      {t(tag.key)}
    </span>
  ) : null;

  const infoBody = info ? (
    isAlly ? (
      <>
        {orderChip}
        {scoreBlock}
      </>
    ) : (
      <>
        {scoreBlock}
        {orderChip}
      </>
    )
  ) : active ? (
    <span
      className={`text-[18px] font-light leading-none ${
        isAlly ? 'text-ally/60' : 'text-enemy/60'
      }`}
    >
      +
    </span>
  ) : null;

  const infoAlign = info ? (isAlly ? 'justify-end' : 'justify-start') : 'justify-center';

  return (
    <button
      type="button"
      {...press}
      className={`relative flex w-full select-none items-stretch overflow-hidden rounded-lg border transition-all duration-200 motion-reduce:transition-none ${
        fill ? 'h-full min-h-0 flex-1' : 'h-[var(--slot-h)]'
      } ${tint} ${ringOf(kind, active)}`}
      aria-label={`${t('draft.slotAria', {
        side: t(isAlly ? 'draft.sideAllyShort' : 'draft.sideEnemyShort'),
        index: index + 1,
        pick: pickNo,
      })}${info ? t('draft.slotFilled', { name: brawler(info.name) }) : t('draft.slotEmpty')}`}
    >
      {isAlly ? (
        <>
          {portrait}
          <span className={`flex min-w-0 flex-1 items-center gap-1 px-1 ${infoAlign}`}>
            {infoBody}
          </span>
          {strip}
        </>
      ) : (
        <>
          {strip}
          <span className={`flex min-w-0 flex-1 items-center gap-1 px-1 ${infoAlign}`}>
            {infoBody}
          </span>
          {portrait}
        </>
      )}
    </button>
  );
}

/* ------------------------------------------------------------------ *
 * Ban 位
 * ------------------------------------------------------------------ */

interface BanCellProps {
  index: number;
  value: BanValue;
  active: boolean;
  getBrawler: DraftBarProps['getBrawler'];
  onActivate: () => void;
  onClear: () => void;
}

/**
 * 单个 Ban 格。三种形态：
 *   空槽 → 显示全局序号；空 Ban → 中性 `Ø` 占位；有英雄 → 灰度头像 + 红叉。
 * 槽位归属（蓝 1-3 / 红 4-6）只体现在 aria-label 与空格序号配色上，
 * 不额外占宽度——Ban 行本来就挤。
 */
function BanCell({ index, value, active, getBrawler, onActivate, onClear }: BanCellProps) {
  const { t, brawler } = useTranslation();
  const side = banSideOfIndex(index);
  const sideLabel = t(side === 'ally' ? 'draft.sideAllyShort' : 'draft.sideEnemyShort');
  const teamIndex = (index % BAN_SLOTS_PER_TEAM) + 1;
  const blank = isEmptyBan(value);
  const filled = value !== null && value !== undefined;
  const info = typeof value === 'number' && !blank ? getBrawler(value) : undefined;

  return (
    <button
      type="button"
      onClick={() => (filled ? onClear() : onActivate())}
      className={`relative flex aspect-square min-w-0 max-w-[var(--ban-max)] flex-1 items-center justify-center overflow-hidden rounded border transition-all duration-200 motion-reduce:transition-none ${
        active
          ? 'border-body bg-raised ring-2 ring-fg/80 ban-active-glow'
          : blank
            ? 'border-dashed border-line-strong/80 bg-raised'
            : 'border-line-strong/80 bg-raised'
      }`}
      aria-label={`${t('draft.banAria', { side: sideLabel, index: teamIndex, n: index + 1 })}${
        info
          ? t('draft.slotFilled', { name: brawler(info.name) })
          : blank
            ? t('draft.banEmptyBan')
            : t('draft.slotEmpty')
      }`}
      title={blank ? t('draft.banEmptyTitle', { side: sideLabel }) : undefined}
    >
      {info && typeof value === 'number' ? (
        <span
          key={value}
          className="absolute inset-0 flex animate-slot-drop motion-reduce:animate-none"
        >
          <Avatar
            id={value}
            name={info.name}
            fill
            rounded="rounded-sm"
            className="opacity-60 grayscale"
          />
          <span className="absolute inset-0 flex items-center justify-center">
            <span className="h-[1.5px] w-[70%] rotate-45 bg-enemy/90" />
            <span className="absolute h-[1.5px] w-[70%] -rotate-45 bg-enemy/90" />
          </span>
        </span>
      ) : blank ? (
        <span className="text-[13px] font-bold leading-none text-muted" aria-hidden>
          Ø
        </span>
      ) : (
        <span
          className={`text-[10px] tabular-nums ${
            side === 'ally' ? 'text-ally/45' : 'text-enemy/45'
          }`}
        >
          {index + 1}
        </span>
      )}
    </button>
  );
}

/** Ban 行最右侧的先手切换按钮：蓝先 / 红先，点一下直接换边（无图标，纯文字） */
function SideSwitch({
  side,
  onSwitch,
  compact = false,
}: {
  side: Side;
  onSwitch: (s: Side) => void;
  compact?: boolean;
}) {
  const { t } = useTranslation();
  const ally = side === 'ally';
  const next: Side = ally ? 'enemy' : 'ally';
  // 紧凑按钮宽度只有 42~52px：英文用短标签（Blue / Red），避免换行
  const currentLabel = t(ally ? 'draft.firstAllyChip' : 'draft.firstEnemyChip');
  const nextLabel = t(next === 'ally' ? 'draft.firstAllyChip' : 'draft.firstEnemyChip');
  return (
    <button
      type="button"
      onClick={() => onSwitch(next)}
      className={`flex shrink-0 items-center justify-center rounded-lg border-2 font-bold transition-colors ${
        compact ? 'h-[30px] w-[42px]' : 'h-[36px] w-[52px]'
      } ${
        ally
          ? 'border-ally/60 bg-ally/15 text-ally active:bg-ally/25'
          : 'border-enemy/60 bg-enemy/15 text-enemy active:bg-enemy/25'
      }`}
      aria-label={`${currentLabel} → ${nextLabel}`}
      title={t('draft.switchSide')}
    >
      <span className="text-[12px] leading-none tracking-wide">{currentLabel}</span>
    </button>
  );
}

/** 底部拇指操作台：Ban 行横向（右端先手切换），己方/敌方各竖排 3 个，最下方撤回/重置 */
export default function DraftBar({
  state,
  idx,
  getBrawler,
  onActivate,
  onClear,
  onMatchup,
  onUndo,
  onReset,
  onChooseFirst,
  canUndo,
  variant = 'portrait',
  className = '',
}: DraftBarProps) {
  const { t } = useTranslation();
  const landscape = variant === 'landscape';

  const shell = landscape
    ? `flex min-h-0 flex-1 flex-col bg-app/95 px-1.5 pb-1.5 pt-1 ${className}`
    : `shrink-0 border-t border-line bg-app/95 px-2 pb-[var(--draft-pb)] pt-[var(--draft-pt)] ${className}`;

  const actionRow = (
    <div className={`grid shrink-0 grid-cols-2 gap-2 ${landscape ? 'mt-1' : 'mt-[var(--draft-gap)]'}`}>
      <button
        type="button"
        onClick={onUndo}
        disabled={!canUndo}
        className="flex h-[var(--act-h)] items-center justify-center gap-1.5 rounded-lg border border-line bg-surface/80 text-[12px] font-semibold text-body transition-colors active:bg-press active:text-fg disabled:opacity-35 disabled:active:bg-press/80"
        aria-label={t('draft.undo')}
      >
        <Undo2 size={14} />
        {t('draft.undo')}
      </button>
      <button
        type="button"
        onClick={onReset}
        disabled={!banCount(state) && !state.ally.length && !state.enemy.length}
        className="flex h-[var(--act-h)] items-center justify-center gap-1.5 rounded-lg border border-line bg-surface/80 text-[12px] font-semibold text-body transition-colors active:bg-press active:text-fg disabled:opacity-35 disabled:active:bg-press/80"
        aria-label={t('draft.reset')}
      >
        <RotateCcw size={14} />
        {t('draft.reset')}
      </button>
    </div>
  );

  /* ---------------- 前置态：未选先手 ---------------- */
  if (!state.firstPick) {
    return (
      <footer className={shell}>
        <div className={`grid grid-cols-2 gap-2 ${landscape ? 'min-h-0 flex-1' : ''}`}>
          <FirstPickButton side="ally" fill={landscape} onPick={onChooseFirst} />
          <FirstPickButton side="enemy" fill={landscape} onPick={onChooseFirst} />
        </div>
        {landscape && actionRow}
      </footer>
    );
  }

  /* ---------------- 正式 BP 态 ---------------- */
  /** 蛇形顺位：先手方 1/4/5，后手方 2/3/6 */
  const pickNos = slotPickNumbers(state);

  return (
    <footer className={shell}>
      {/* Ban 行：6 个 Ban 位（前 3 己方 / 后 3 敌方）+ 最右侧先手切换 */}
      <div className="flex shrink-0 items-center gap-1.5">
        <div className="flex min-w-0 flex-1 items-center gap-1">
          {[0, BAN_SLOTS_PER_TEAM].map((start, group) => (
            <Fragment key={start}>
              {/* 队内 3 位之间细缝、两队之间一道竖线：不占宽度也能看出分组 */}
              {group > 0 && <span className="h-5 w-px shrink-0 bg-press/80" aria-hidden />}
              <div className="flex min-w-0 flex-1 items-center gap-1">
                {Array.from({ length: BAN_SLOTS_PER_TEAM }, (_, k) => {
                  const i = start + k;
                  return (
                    <BanCell
                      key={`ban-${i}`}
                      index={i}
                      value={state.bans[i] ?? null}
                      active={isActive(state.active, 'ban', i)}
                      getBrawler={getBrawler}
                      onActivate={() => onActivate({ kind: 'ban', index: i })}
                      onClear={() => onClear({ kind: 'ban', index: i })}
                    />
                  );
                })}
              </div>
            </Fragment>
          ))}
        </div>

        <SideSwitch side={state.firstPick} onSwitch={onChooseFirst} compact={landscape} />
      </div>

      {/* 槽位：左右各竖排 3 个，中轴竖排色条贴在各自内侧边缘 */}
      <div
        className={`grid grid-cols-2 gap-2 ${
          landscape ? 'mt-1 min-h-0 flex-1' : 'mt-[var(--draft-gap)]'
        }`}
      >
        <div className={`flex min-h-0 flex-col ${landscape ? 'gap-1' : 'gap-[var(--slot-gap)]'}`}>
          {Array.from({ length: TEAM_SLOTS }, (_, i) => (
            <SlotCell
              key={`ally-${i}`}
              kind="ally"
              index={i}
              pickNo={pickNos.ally[i] ?? i + 1}
              state={state}
              idx={idx}
              getBrawler={getBrawler}
              onActivate={onActivate}
              onClear={onClear}
              onMatchup={onMatchup}
              fill={landscape}
            />
          ))}
        </div>
        <div className={`flex min-h-0 flex-col ${landscape ? 'gap-1' : 'gap-[var(--slot-gap)]'}`}>
          {Array.from({ length: TEAM_SLOTS }, (_, i) => (
            <SlotCell
              key={`enemy-${i}`}
              kind="enemy"
              index={i}
              pickNo={pickNos.enemy[i] ?? i + 1}
              state={state}
              idx={idx}
              getBrawler={getBrawler}
              onActivate={onActivate}
              onClear={onClear}
              onMatchup={onMatchup}
              fill={landscape}
            />
          ))}
        </div>
      </div>

      {actionRow}
    </footer>
  );
}
