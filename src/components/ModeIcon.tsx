import { useEffect, useState } from 'react';
import { modeColor, modeIconUrl } from '../data/localization';
import { useTranslation } from '../i18n';

interface ModeIconProps {
  mode: string;
  /** 像素边长（正方形） */
  size?: number;
  className?: string;
}

/**
 * 官方模式图标（`public/modes/{mode}.png`，随包离线）。
 * 加载失败时退回该模式主题色的圆点——和之前的设计一致，不会出现裂图。
 */
export default function ModeIcon({ mode, size = 14, className = '' }: ModeIconProps) {
  const { mode: modeLabel } = useTranslation();
  const [failed, setFailed] = useState(false);

  useEffect(() => setFailed(false), [mode]);

  if (failed) {
    return (
      <span
        className={`shrink-0 rounded-full ${className}`}
        style={{ width: size * 0.5, height: size * 0.5, backgroundColor: modeColor(mode) }}
        aria-hidden
      />
    );
  }

  return (
    <img
      src={modeIconUrl(mode)}
      alt={modeLabel(mode)}
      width={size}
      height={size}
      className={`shrink-0 object-contain ${className}`}
      draggable={false}
      onError={() => setFailed(true)}
    />
  );
}
