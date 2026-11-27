import { useEffect, useState } from 'react';
import { Map as MapIcon } from 'lucide-react';
import { modeColor } from '../data/localization';
import { useTranslation } from '../i18n';
import { themeAccent } from '../utils/display';
import { mapImageUrl } from '../utils/mapImage';
import { useTheme } from '../utils/useTheme';

interface MapThumbProps {
  mapName: string;
  mode: string;
  /** 尺寸与圆角由调用方给，例如 `h-8 w-6 rounded` */
  className?: string;
  /** 占位图里图标的字号，随容器大小调 */
  iconSize?: number;
  /**
   * 填充方式：
   *   - `cover`（默认）：裁切填满容器，适合小方块 / 顶栏条
   *   - `contain`：整张竖向地图按原比例完整显示，两侧留白用同图模糊放大垫底
   */
  variant?: 'cover' | 'contain';
}

/**
 * 地图缩略图。
 *
 * 图片缺失或解码失败时**不会出现裂图**：直接换成按模式主题色渲染的占位块
 * （同色系斜向渐变 + 网格纹理 + 地图图标），视觉上仍然是一张「地图」。
 */
export default function MapThumb({
  mapName,
  mode,
  className = '',
  iconSize = 14,
  variant = 'cover',
}: MapThumbProps) {
  const { t, map: mapLabel } = useTranslation();
  const { resolved: theme } = useTheme();
  const [failed, setFailed] = useState(false);

  // 换图时重置，否则上一张的失败状态会传染给新地图
  useEffect(() => setFailed(false), [mapName]);

  const src = mapImageUrl(mapName);

  if (failed) {
    const accent = themeAccent(modeColor(mode), theme);
    return (
      <div
        className={`relative flex items-center justify-center overflow-hidden bg-raised ${className}`}
        style={{ backgroundImage: `linear-gradient(145deg, ${accent}5C, #0B1220 76%)` }}
        aria-hidden
        title={t('picker.thumbMissing', { name: mapLabel(mapName) })}
      >
        <span
          className="pointer-events-none absolute inset-0 opacity-40"
          style={{
            backgroundImage: `linear-gradient(90deg, ${accent}33 1px, transparent 1px), linear-gradient(0deg, ${accent}33 1px, transparent 1px)`,
            backgroundSize: '6px 6px',
          }}
        />
        <MapIcon size={iconSize} className="relative" style={{ color: accent }} />
      </div>
    );
  }

  if (variant === 'contain') {
    return (
      // 纯色深底（#090d16），不做模糊拉伸：地图完整居中，两侧留黑，画面更干净
      <div className={`relative overflow-hidden bg-[#090d16] ${className}`}>
        <img
          src={src}
          alt={mapLabel(mapName)}
          className="relative h-full w-full object-contain"
          loading="lazy"
          decoding="async"
          draggable={false}
          onError={() => setFailed(true)}
        />
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={mapLabel(mapName)}
      className={`bg-raised object-cover ${className}`}
      loading="lazy"
      decoding="async"
      draggable={false}
      onError={() => setFailed(true)}
    />
  );
}
