import { useRef, type TouchEvent as ReactTouchEvent } from 'react';

/**
 * 左右滑动切页：判定 + 手势。
 *
 * 这一层只回答两件事：
 *   1. `decideSwipe`（纯函数）：这一次抬手**该不该**切页、切哪一边；
 *   2. `useSwipePager`（DOM）：把手指位移跟手地画到页面上。
 *
 * 切页本身由调用方执行（改 tab），这里不碰任何业务状态。
 *
 * 为什么禁用条件这么多：这是移动端最容易「打架」的一块——
 * 安卓全面屏的左右边缘侧滑是系统返回、横向滚动的标签栏要吃掉横滑、
 * 竖向滚动列表里斜着划一下不该翻页、BP 选人界面正要点英雄更不该翻页。
 * 任何一个条件漏掉，用户都会觉得「这应用不听话」。
 */

/** 屏幕左右边缘的禁区宽度：安卓全面屏侧滑返回的手势区 */
export const SWIPE_EDGE_PX = 28;
/** 触发切页的最小横向位移 */
export const SWIPE_MIN_DISTANCE = 56;
/** 跟手位移的阻尼与上限：只露出一小段，避免拖出一大块空白 */
const FOLLOW_RATIO = 0.45;
const FOLLOW_MAX_PX = 72;
/** 超过这个位移才锁定为横向手势，用来区分「点一下」和「划一下」 */
const AXIS_LOCK_PX = 8;

export type SwipeDirection = 'next' | 'prev';

export interface SwipePoint {
  x: number;
  y: number;
}

export interface SwipeDecisionInput {
  start: SwipePoint;
  end: SwipePoint;
  /** 视口宽度（用于边缘禁区判定） */
  viewportWidth: number;
  /** 当前是否允许切页：弹窗打开 / BP 选人操作态 / 横屏双栏时传 false */
  enabled: boolean;
  /** 手指落点是否位于可横向滚动的子容器内（标签栏、横向卡片列表等） */
  inHorizontalScroller: boolean;
  edge?: number;
  minDistance?: number;
}

/** 落点是否落在左右边缘禁区 */
export function isEdgeTouch(x: number, viewportWidth: number, edge = SWIPE_EDGE_PX): boolean {
  return x <= edge || x >= viewportWidth - edge;
}

/**
 * 判定一次手势是否切页。
 *
 * 返回 `'next'` = 去下一个 Tab（手指向左），`'prev'` = 上一个，`null` = 不切。
 * 禁用条件按「最省事就能排除」的顺序排列，先排除的代价最低。
 */
export function decideSwipe(input: SwipeDecisionInput): SwipeDirection | null {
  if (!input.enabled) return null;
  if (input.inHorizontalScroller) return null;

  const edge = input.edge ?? SWIPE_EDGE_PX;
  if (isEdgeTouch(input.start.x, input.viewportWidth, edge)) return null;

  const dx = input.end.x - input.start.x;
  const dy = input.end.y - input.start.y;
  const minDistance = input.minDistance ?? SWIPE_MIN_DISTANCE;

  // 位移不够：多半是点按或手抖
  if (Math.abs(dx) < minDistance) return null;
  // 竖向占优：用户在滚列表，不是要翻页
  if (Math.abs(dx) <= Math.abs(dy)) return null;

  return dx < 0 ? 'next' : 'prev';
}

/**
 * 手指落点是否在「可横向滚动」的容器里。
 *
 * 只看真正能滚的（`scrollWidth` 超出 `clientWidth` 且有横向溢出样式），
 * 否则页面上每一个 `overflow-hidden` 的包装层都会被误判成横滑容器，
 * 滑动切页就彻底失效了。
 */
export function hasHorizontalScroller(
  target: EventTarget | null,
  boundary: Element | null,
): boolean {
  if (typeof Element === 'undefined' || !(target instanceof Element)) return false;
  if (typeof window === 'undefined' || typeof window.getComputedStyle !== 'function') return false;

  let node: Element | null = target;
  while (node && node !== boundary) {
    if (node.scrollWidth - node.clientWidth > 4) {
      const overflowX = window.getComputedStyle(node).overflowX;
      if (overflowX === 'auto' || overflowX === 'scroll' || overflowX === 'overlay') return true;
    }
    node = node.parentElement;
  }
  return false;
}

export interface SwipePagerOptions {
  /** 当前是否允许切页；false 时连跟手位移都不做 */
  enabled: boolean;
  /** 松手且判定成立时调用；切页成功与否由调用方决定（到头了就不动） */
  onSwipe: (direction: SwipeDirection) => void;
}

export interface SwipePagerHandlers {
  onTouchStart: (event: ReactTouchEvent<HTMLElement>) => void;
  onTouchMove: (event: ReactTouchEvent<HTMLElement>) => void;
  onTouchEnd: (event: ReactTouchEvent<HTMLElement>) => void;
  onTouchCancel: () => void;
}

interface Gesture {
  el: HTMLElement;
  startX: number;
  startY: number;
  /** 已锁定为横向手势 */
  horizontal: boolean;
  /** 本次手势不参与切页（竖向滚动 / 落在边缘 / 落在横滑容器里） */
  dead: boolean;
}

/**
 * 跟手位移 + 松手判定。
 *
 * 位移直接写 `element.style.transform`，**不走 state**：
 * 每次 touchmove 触发一次整棵 App 重渲染的话，BP 页那一百多个英雄格子会卡到掉帧。
 * 只有真正切页时才调用 `onSwipe` 让调用方改 tab。
 */
export function useSwipePager({ enabled, onSwipe }: SwipePagerOptions): SwipePagerHandlers {
  const gesture = useRef<Gesture | null>(null);

  const reset = (el: HTMLElement): void => {
    el.style.transition = 'transform 180ms cubic-bezier(0.22, 0.8, 0.3, 1)';
    el.style.transform = '';
  };

  return {
    onTouchStart(event) {
      gesture.current = null;
      if (!enabled) return;
      if (event.touches.length !== 1) return;

      const touch = event.touches[0];
      if (!touch) return;
      if (isEdgeTouch(touch.clientX, window.innerWidth)) return;
      if (hasHorizontalScroller(event.target, event.currentTarget)) return;

      gesture.current = {
        el: event.currentTarget,
        startX: touch.clientX,
        startY: touch.clientY,
        horizontal: false,
        dead: false,
      };
    },

    onTouchMove(event) {
      const g = gesture.current;
      if (!g || g.dead) return;
      const touch = event.touches[0];
      if (!touch) return;

      const dx = touch.clientX - g.startX;
      const dy = touch.clientY - g.startY;

      if (!g.horizontal) {
        if (Math.abs(dx) > AXIS_LOCK_PX && Math.abs(dx) > Math.abs(dy)) {
          g.horizontal = true;
        } else if (Math.abs(dy) > AXIS_LOCK_PX) {
          // 竖向占优：这一下是滚列表，交给浏览器原生滚动，本次手势不再接管
          g.dead = true;
          return;
        } else {
          return;
        }
      }

      const offset = Math.max(-FOLLOW_MAX_PX, Math.min(FOLLOW_MAX_PX, dx * FOLLOW_RATIO));
      g.el.style.transition = 'none';
      g.el.style.transform = `translate3d(${offset}px, 0, 0)`;
    },

    onTouchEnd(event) {
      const g = gesture.current;
      gesture.current = null;
      if (!g || g.dead) return;

      const touch = event.changedTouches[0];
      if (!touch) {
        reset(g.el);
        return;
      }

      const direction = decideSwipe({
        start: { x: g.startX, y: g.startY },
        end: { x: touch.clientX, y: touch.clientY },
        viewportWidth: window.innerWidth,
        enabled,
        // 落点判定已经在 touchstart 做过，这里不再重复查 DOM
        inHorizontalScroller: false,
      });

      reset(g.el);
      if (direction) onSwipe(direction);
    },

    onTouchCancel() {
      const g = gesture.current;
      gesture.current = null;
      if (g) reset(g.el);
    },
  };
}
