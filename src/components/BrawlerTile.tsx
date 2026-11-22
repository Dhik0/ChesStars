import type { Candidate } from '../utils/draftEngine';
import { TEAM_SLOTS, counterLight } from '../utils/draftEngine';
import {
  COUNTER_LIGHT_CLASS,
  COUNTER_LIGHT_TEXT,
  baseScoreColor,
  orderTag,
} from '../utils/display';
import { useLongPress } from '../utils/useLongPress';
import Avatar from './Avatar';

interface BrawlerTileProps {
  candidate: Candidate;
  /** 当前列表里的推荐排名（1 起） */
  rank: number;
  onPick: () => void;
  /** 长按 / 右键：打开该英雄在本图的详细对位 */
  onLongPress: () => void;
}

/** 顺位词条：只标先手 / 后手，中位不显示（绝大多数英雄都是中位，标出来只是噪音） */
function PickBadge({ order }: { order: Candidate['pickOrder'] }) {
  const tag = orderTag(order);
  if (!tag) return null;
  return (
    <span
      className={`shrink-0 rounded px-0.5 text-[8px] font-bold leading-[12px] ${tag.cls}`}
    >
      {tag.label}
    </span>
  );
}

/**
 * 头像格子：点按填入当前槽位，长按（或右键）看本图对位。
 *
 * 左侧竖条 = 该候选对「当前对方已选英雄」的逐一克制关系，
 * 自上而下对应对方第 1/2/3 个槽位；对方还没亮牌时不占位。
 * 卡片分数展示的是**本图基础分**，与底部槽位同口径；动态推荐分只用于排序。
 */
export default function BrawlerTile({ candidate, rank, onPick, onLongPress }: BrawlerTileProps) {
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
      <div className="flex w-full items-stretch gap-[2px]">
        {/* 固定 3 格：自上而下对应对方第 1/2/3 槽；未选人 / 无样本一律中性灰 */}
        <span className="flex w-[4px] shrink-0 flex-col gap-[2px] py-[1px]">
          {Array.from({ length: TEAM_SLOTS }, (_, i) => {
            const d = bars[i];
            const light = counterLight(d);
            const tip = !d
              ? `对方第 ${i + 1} 槽尚未选人`
              : d.hasSample
                ? `对 ${d.opponentName} ${d.rawDelta > 0 ? '+' : ''}${d.rawDelta.toFixed(1)}pp（${COUNTER_LIGHT_TEXT[light]} · ${d.samples}场）`
                : `对 ${d.opponentName} 无可用对位样本`;
            return (
              <span
                key={i}
                className={`flex-1 rounded-[1px] ${COUNTER_LIGHT_CLASS[light]}`}
                title={tip}
              />
            );
          })}
        </span>

        <div className="relative aspect-square min-w-0 flex-1">
          <Avatar
            id={c.id}
            name={c.name}
            fill
            rounded="rounded-md"
            className={c.hasData ? '' : 'opacity-50'}
          />
          {/* 推荐排名角标 */}
          <span className="absolute left-0 top-0 rounded-br-[3px] bg-black/70 px-1 text-[8px] font-bold leading-[11px] tabular-nums text-slate-200">
            {rank}
          </span>
        </div>
      </div>

      <div className="mt-0.5 w-full truncate text-center text-[9px] leading-tight text-slate-300">
        {c.cn}
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
