import { useEffect, useRef, type TouchEvent as ReactTouchEvent } from 'react';
import { hasHorizontalScroller } from './swipeNav';

/**
 * 设置二级子页的「跟手右滑返回」。
 *
 * 和一级 Tab 的左右滑切页是两套手势，互不干扰：
 *   - 一级切页跟手位移有阻尼（最多露 72px），这里要求 1:1 跟随手指；
 *   - 一级切页在左右两侧 28px 都是禁区，这里只避开**最左侧** 28px
 *     （安卓全面屏系统返回手势区），右侧起滑反而最自然；
 *   - 松手超过屏宽 30% 才弹出返回，否则回弹复位。
 *
 * 位移和遮罩透明度都直接写 style，不走 state：子页里上百个 DOM 节点，
 * 每帧重渲染会明显掉帧。
 */

/** 最左侧的系统手势盲区 */
export const SWIPE_BACK_EDGE_PX = 28;
/** 松手判定阈值：拖过屏宽的 30% */
export const SWIPE_BACK_THRESHOLD = 0.3;
/** 推入 / 弹出 / 回弹统一用这条曲线 */
export const SWIPE_BACK_MS = 260;
export const SWIPE_BACK_EASE = 'cubic-bezier(0.22, 1, 0.36, 1)';
/** 横向手势锁定距离 */
const AXIS_LOCK_PX = 8;

/**
 * 纯函数：这一次抬手该不该关掉子页。
 * 只认向右拖；起点落在左侧系统手势区、位移不够、向左拖一律返回 false。
 */
export function shouldSwipeBack(
  startX: number,
  endX: number,
  viewportWidth: number,
  edge = SWIPE_BACK_EDGE_PX,
  threshold = SWIPE_BACK_THRESHOLD,
): boolean {
  if (startX <= edge) return false;
  return endX - startX > viewportWidth * threshold;
}

export interface SwipeBackElementRef {
  current: HTMLElement | null;
}

export interface SwipeBackOptions {
  enabled: boolean;
  /** 整块子页（被 translate 的元素） */
  pageRef: SwipeBackElementRef;
  /** 子页后面那层压暗遮罩，拖动时随进度淡出 */
  scrimRef: SwipeBackElementRef;
  onBack: () => void;
}

export interface SwipeBackHandlers {
  onTouchStart: (event: ReactTouchEvent<HTMLElement>) => void;
  onTouchMove: (event: ReactTouchEvent<HTMLElement>) => void;
  onTouchEnd: (event: ReactTouchEvent<HTMLElement>) => void;
  onTouchCancel: () => void;
}

interface Gesture {
  startX: number;
  startY: number;
  width: number;
  horizontal: boolean;
  dead: boolean;
}

export function useSwipeBack({
  enabled,
  pageRef,
  scrimRef,
  onBack,
}: SwipeBackOptions): SwipeBackHandlers {
  const gesture = useRef<Gesture | null>(null);
  const closing = useRef(false);
  const timer = useRef<number | null>(null);
  const backRef = useRef(onBack);
  backRef.current = onBack;

  useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    },
    [],
  );

  /** 给元素补上统一的过渡曲线（拖动过程中保持 none） */
  const animate = (offset: number): void => {
    const page = pageRef.current;
    const scrim = scrimRef.current;
    const width = gesture.current?.width ?? window.innerWidth;
    if (page) {
      page.style.transition = `transform ${SWIPE_BACK_MS}ms ${SWIPE_BACK_EASE}`;
      page.style.transform = `translate3d(${offset}px, 0, 0)`;
    }
    if (scrim) {
      scrim.style.transition = `opacity ${SWIPE_BACK_MS}ms ${SWIPE_BACK_EASE}`;
      scrim.style.opacity = String(Math.max(0, 1 - offset / width));
    }
  };

  /** 弹出返回：整块滑出右侧后交给 App 卸载子页 */
  const finish = (): void => {
    if (closing.current) return;
    closing.current = true;
    const width = gesture.current?.width ?? window.innerWidth;
    animate(width);
    timer.current = window.setTimeout(() => backRef.current(), SWIPE_BACK_MS);
  };

  /** 回弹复位 */
  const snapBack = (): void => {
    animate(0);
    timer.current = window.setTimeout(() => {
      timer.current = null;
      const page = pageRef.current;
      if (page) {
        page.style.transition = '';
        page.style.transform = '';
      }
    }, SWIPE_BACK_MS);
  };

  const clearTimer = (): void => {
    if (timer.current !== null) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
  };

  return {
    onTouchStart(event) {
      gesture.current = null;
      if (!enabled || closing.current || event.touches.length !== 1) return;
      const touch = event.touches[0];
      if (!touch) return;
      if (touch.clientX <= SWIPE_BACK_EDGE_PX) return;
      if (hasHorizontalScroller(event.target, pageRef.current)) return;

      clearTimer();
      const page = pageRef.current;
      if (page) {
        // 入场动画结束后就没有 transform 了；万一首帧就起滑，先关掉动画避免打架
        page.style.animation = 'none';
        page.style.transition = 'none';
      }
      const scrim = scrimRef.current;
      if (scrim) scrim.style.transition = 'none';

      gesture.current = {
        startX: touch.clientX,
        startY: touch.clientY,
        width: window.innerWidth,
        horizontal: false,
        dead: false,
      };
    },

    onTouchMove(event) {
      const g = gesture.current;
      if (!g || g.dead || closing.current) return;
      const touch = event.touches[0];
      if (!touch) return;

      const dx = touch.clientX - g.startX;
      const dy = touch.clientY - g.startY;

      if (!g.horizontal) {
        if (dx > AXIS_LOCK_PX && dx > Math.abs(dy)) {
          g.horizontal = true;
        } else if (Math.abs(dy) > AXIS_LOCK_PX || dx < -AXIS_LOCK_PX) {
          // 竖向滚动 / 向左划：这一下不是返回手势，交回浏览器
          g.dead = true;
          return;
        } else {
          return;
        }
      }

      const offset = Math.max(0, Math.min(dx, g.width));
      const page = pageRef.current;
      const scrim = scrimRef.current;
      if (page) {
        page.style.transition = 'none';
        page.style.transform = `translate3d(${offset}px, 0, 0)`;
      }
      if (scrim) {
        scrim.style.transition = 'none';
        scrim.style.opacity = String(1 - offset / g.width);
      }
    },

    onTouchEnd(event) {
      const g = gesture.current;
      gesture.current = null;
      if (!g || g.dead || closing.current) return;
      const touch = event.changedTouches[0];
      if (!touch) {
        snapBack();
        return;
      }
      if (shouldSwipeBack(g.startX, touch.clientX, g.width)) finish();
      else snapBack();
    },

    onTouchCancel() {
      const g = gesture.current;
      gesture.current = null;
      if (g && g.horizontal && !g.dead) snapBack();
    },
  };
}
