import { useEffect, useState } from 'react';
import { avatarCdnUrl, avatarInitial, avatarUrl, fallbackColor } from '../data/localization';
import { useTranslation } from '../i18n';

interface AvatarProps {
  id: number;
  name: string;
  /** 像素值或 CSS 尺寸表达式（如 var(--avatar)），随界面密度变化 */
  size?: number | string;
  /** 填满父容器（用于弹性尺寸的槽位），此时忽略 size 的宽高 */
  fill?: boolean;
  /** 填充方式：contain 不裁切（默认），cover 铺满（用于宽扁的槽位） */
  fit?: 'contain' | 'cover';
  className?: string;
  rounded?: string;
}

/** 加载阶段：本地静态文件 → Brawlify CDN → 首字色块 */
type Stage = 'local' | 'cdn' | 'failed';

/**
 * 英雄头像。
 *
 * 优先本地 `public/brawlers/{id}.png`（离线可用、零延迟），
 * 本地缺失才回落 CDN，两者都失败则降级为「按 ID 确定性配色 + 首字」的色块，
 * 绝不出现裂图。
 *
 * 刻意**不用** `loading="lazy"`：英雄池一屏几十个头像，懒加载会让首屏出现大片空白，
 * 这里全部 eager，并给未解码完的图片垫一层深色底，视觉上永远是「正在加载」。
 */
export default function Avatar({
  id,
  name,
  size = 36,
  fill = false,
  fit = 'contain',
  className = '',
  rounded = 'rounded-md',
}: AvatarProps) {
  const { brawler } = useTranslation();
  const [stage, setStage] = useState<Stage>('local');
  /** 展示名（当前语言），alt / title / 兜底首字都用它 */
  const displayName = brawler(name);

  // 切换英雄时重置，避免上一张图的失败状态传染给新英雄
  useEffect(() => {
    setStage('local');
  }, [id]);

  const dimension = fill ? undefined : { width: size, height: size };
  const fillClass = fill ? 'h-full w-full' : '';
  // 兜底首字字号：数字直接算，CSS 变量走 calc
  const fallbackFontSize = fill
    ? '0.42em'
    : typeof size === 'number'
      ? Math.max(11, Math.round(size * 0.42))
      : `calc(${size} * 0.42)`;

  if (stage === 'failed') {
    return (
      <div
        className={`flex shrink-0 select-none items-center justify-center font-bold leading-none text-white/95 ${rounded} ${fillClass} ${className}`}
        style={{
          ...dimension,
          backgroundColor: fallbackColor(id),
          fontSize: fallbackFontSize,
        }}
        aria-label={displayName}
        title={displayName}
      >
        {avatarInitial(displayName)}
      </div>
    );
  }

  return (
    <img
      src={stage === 'cdn' ? avatarCdnUrl(id) : avatarUrl(id)}
      alt={displayName}
      width={fill ? undefined : size}
      height={fill ? undefined : size}
      decoding="async"
      draggable={false}
      onError={() => setStage((s) => (s === 'local' ? 'cdn' : 'failed'))}
      className={`shrink-0 select-none bg-raised/60 ${fit === 'cover' ? 'object-cover' : 'object-contain'} ${rounded} ${fillClass} ${className}`}
      style={dimension}
    />
  );
}
