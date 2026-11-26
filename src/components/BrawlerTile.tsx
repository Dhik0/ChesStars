import { EyeOff } from 'lucide-react';
import type { Candidate } from '../utils/draftEngine';
import { TEAM_SLOTS, counterLight } from '../utils/draftEngine';
import {
  COUNTER_LIGHT_CLASS,
  baseScoreColor,
  counterTip,
  orderTag,
} from '../utils/display';
import { useLongPress } from '../utils/useLongPress';
import { useTranslation } from '../i18n';
import Avatar from './Avatar';

interface BrawlerTileProps {
  candidate: Candidate;
  /** 当前列表里的推荐排名（1 起） */
  rank: number;
  /**
   * 该英雄已被「对方」Ban 掉（Ban 阶段会保留在列表里，方便重复 Ban）。
   * 打一枚小角标，避免用户以为是列表漏筛。
   */
  bannedElsewhere?: boolean;
  /**
   * 被本人标记为「不喜欢 / 屏蔽」。
   * 只是视觉提示：卡片**依然可以正常点选**（敌方选人、手动录 Ban 都可能用到），
   * 所以这里只降透明度 + 打小角标，不拦截点击。
   */
  blocked?: boolean;
  onPick: () => void;
  /** 长按 / 右键：打开该英雄在本图的详细对位 */
  onLongPress: () => void;
}

/** 顺位词条：只标先手 / 后手，中位不显示（绝大多数英雄都是中位，标出来只是噪音） */
function PickBadge({ order }: { order: Candidate['pickOrder'] }) {
  const { t } = useTranslation();
  const tag = orderTag(order);
  if (!tag) return null;
  return (
    <span
      className={`shrink-0 rounded px-0.5 text-[8px] font-bold leading-[12px] ${tag.cls}`}
    >
      {t(tag.key)}
    </span>
  );
}

/**
 * 头像格子：点按填入当前槽位，长按（或右键）看本图对位。
 *
 * 左侧竖条 = 该候选对「当前对方已选英雄」的逐一克制关系，
 * 自上而下对应对方第 1/2/3 个槽位；对方还没亮牌时不占位。
 * 卡片分数展示的是**本图基础分**，与底部槽位同口径；动态推荐分只用于排序。
 *
 * 版式取舍：灯条加宽到 8px、段间留 4px，头像横向收到 86%——
 * 三格灯在缩小后的卡片里也能一眼数清，头像仍然占视觉主体。
 */
export default function BrawlerTile({
  candidate,
  rank,
  bannedElsewhere = false,
  blocked = false,
  onPick,
  onLongPress,
}: BrawlerTileProps) {
  const { t, brawler } = useTranslation();
  const c = candidate;
  const press = useLongPress({ onLongPress, onClick: onPick });

  // counterDetails 已经按对方槽位顺序排列，长度 = 对方已选人数
  const bars = c.counterDetails;

  return (
    <div
      role="button"
      tabIndex={0}
      {...press}
      className="flex cursor-pointer select-none flex-col items-center"
    >
      <div className="flex w-full items-stretch gap-1">
        {/* 固定 3 格：自上而下对应对方第 1/2/3 槽；未选人 / 无对位一律中性灰 */}
        <span className="flex w-2 shrink-0 flex-col gap-1 py-[1px]">
          {Array.from({ length: TEAM_SLOTS }, (_, i) => {
            const d = bars[i];
            const light = counterLight(d);
            const tip = d
              ? counterTip(d, brawler(d.opponentName), t)
              : t('draft.oppSlotEmpty', { n: i + 1 });
            return (
              <span
                key={i}
                className={`flex-1 rounded-full ${COUNTER_LIGHT_CLASS[light]}`}
                title={tip}
              />
            );
          })}
        </span>

        {/* 头像：横向占比 86%，剩下的横向空间留给左侧灯条与两侧留白 */}
        <div className="flex min-w-0 flex-1 justify-center">
          <div className="relative aspect-square w-[86%]">
            <Avatar
              id={c.id}
              name={c.name}
              fill
              rounded="rounded-md"
              className={[c.hasData ? '' : 'opacity-50', blocked ? 'opacity-40' : '']
                .filter(Boolean)
                .join(' ')}
            />
            {/* 推荐排名角标 */}
            <span className="absolute left-0 top-0 rounded-br-[3px] bg-black/70 px-1 text-[8px] font-bold leading-[11px] tabular-nums text-slate-200">
              {rank}
            </span>
            {/* 个人屏蔽：右上角小角标，只提示、不挡识别，也不影响点选 */}
            {blocked && (
              <span
                className="absolute right-0 top-0 flex items-center rounded-bl-[3px] bg-slate-950/80 px-0.5 py-px text-slate-300"
                title={t('blocked.badge')}
              >
                <EyeOff size={9} />
              </span>
            )}
            {/* 对方已 Ban：允许重复 Ban，但要让用户知道这手已经 Ban 过。
                贴右下角是为了不跟左上角的排名角标抢位置（头像变窄后更容易撞上） */}
            {bannedElsewhere && (
              <span className="absolute bottom-0 right-0 rounded-tl-[3px] bg-enemy/85 px-1 text-[8px] font-bold leading-[11px] text-white">
                {t('pool.banned')}
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="mt-0.5 w-full truncate text-center text-[9px] leading-tight text-slate-300">
        {brawler(c.name)}
      </div>
      <div className="flex w-full items-center justify-center gap-0.5">
        <span
          className={`text-[10.5px] font-bold leading-tight tabular-nums ${
            c.hasData ? baseScoreColor(c.mapScore) : 'text-slate-600'
          }`}
        >
          {c.hasData ? c.mapScore.toFixed(1) : '—'}
        </span>
        <PickBadge order={c.pickOrder} />
      </div>
    </div>
  );
}
