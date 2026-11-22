import { useEffect, useState } from 'react';

/** 矮视口阈值：低于此高度的竖屏（悬浮小窗）启用紧凑底部 BP 区 */
export const SHORT_MAX_HEIGHT = 660;

/** 横屏判定：真·横屏比例且宽度够放下双栏 */
const LANDSCAPE_MQ = '(orientation: landscape) and (min-width: 520px)';

export interface ViewportState {
  width: number;
  height: number;
  /** 是否进入左右双栏横屏布局 */
  landscape: boolean;
  /** 是否矮视口（竖屏小窗） */
  short: boolean;
}

function read(): ViewportState {
  const width = window.innerWidth;
  const height = window.innerHeight;
  return {
    width,
    height,
    landscape: window.matchMedia(LANDSCAPE_MQ).matches,
    short: height <= SHORT_MAX_HEIGHT,
  };
}

/**
 * 视口姿态 hook：横屏 / 竖屏、是否矮视口。
 *
 * 用 `matchMedia` 的 orientation 而不是单纯比较宽高，避免安卓分屏
 * 或输入法弹出时 `innerWidth/innerHeight` 抖动导致的布局翻转。
 */
export function useViewport(): ViewportState {
  const [vp, setVp] = useState<ViewportState>(() =>
    typeof window === 'undefined'
      ? { width: 360, height: 780, landscape: false, short: false }
      : read(),
  );

  useEffect(() => {
    const update = () => setVp(read());
    const mq = window.matchMedia(LANDSCAPE_MQ);
    // 老 WebView 只有 addListener，做一次兼容
    if (typeof mq.addEventListener === 'function') mq.addEventListener('change', update);
    else mq.addListener(update);

    window.addEventListener('resize', update);
    window.addEventListener('orientationchange', update);
    update();

    return () => {
      if (typeof mq.removeEventListener === 'function') mq.removeEventListener('change', update);
      else mq.removeListener(update);
      window.removeEventListener('resize', update);
      window.removeEventListener('orientationchange', update);
    };
  }, []);

  return vp;
}
