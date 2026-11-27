import { Eye, EyeOff } from 'lucide-react';
import { useTranslation } from '../i18n';

interface BlockedToggleProps {
  /** 该英雄是否已被本人屏蔽 */
  blocked: boolean;
  onToggle: () => void;
  /** 是否在按钮下方补一行影响范围说明（空间紧的弹层可以关掉） */
  withHint?: boolean;
  className?: string;
}

/**
 * 「不喜欢 / 屏蔽推荐」开关。
 *
 * 长按对位卡与算分明细卡共用同一个按钮，文案与配色保持一致：
 * 未屏蔽时用琥珀色描边强调「这是个可以点的操作」，已屏蔽时收敛成中性灰，
 * 文案变成「取消屏蔽」。
 */
export default function BlockedToggle({
  blocked,
  onToggle,
  withHint = false,
  className = '',
}: BlockedToggleProps) {
  const { t } = useTranslation();

  return (
    <div className={className}>
      <button
        type="button"
        onClick={onToggle}
        aria-pressed={blocked}
        className={`flex h-9 w-full items-center justify-center gap-1.5 rounded-lg border text-[12px] font-semibold transition-colors ${
          blocked
            ? 'border-line-strong bg-raised/60 text-body active:bg-press'
            : 'border-gold/50 bg-amber-500/10 text-gold active:bg-amber-500/20'
        }`}
      >
        {blocked ? <Eye size={13} /> : <EyeOff size={13} />}
        {blocked ? t('blocked.undo') : t('blocked.action')}
      </button>
      {withHint && (
        <p className="mt-1 text-[10px] leading-relaxed text-subtle">{t('blocked.hint')}</p>
      )}
    </div>
  );
}
