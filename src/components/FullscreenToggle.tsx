import { Maximize, Minimize } from 'lucide-react';
import { useTranslation } from '../i18n';
import { useFullscreenLandscape } from '../utils/fullscreenLandscape';

/**
 * 全屏横屏开关（视频播放器式图标按钮）。
 *
 * 未全屏显示「展开」图标，全屏后换成「收起」图标；图标状态完全由
 * `useFullscreenLandscape` 跟随系统事件同步，用户按 ESC / 系统手势退出也会立刻还原。
 *
 * 浏览器不支持网页全屏（iPhone Safari）时直接不渲染，避免点了没反应。
 */
export default function FullscreenToggle({ className = '' }: { className?: string }) {
  const { t } = useTranslation();
  const { supported, active, toggle } = useFullscreenLandscape();

  if (!supported) return null;

  const label = active ? t('topbar.exitFullscreen') : t('topbar.fullscreen');

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={label}
      aria-pressed={active}
      title={label}
      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-line-strong bg-surface/80 text-body transition-colors active:bg-press active:text-fg ${className}`}
    >
      {active ? <Minimize size={15} /> : <Maximize size={15} />}
    </button>
  );
}
