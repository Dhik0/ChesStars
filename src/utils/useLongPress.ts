import { useRef } from 'react';
import type { MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from 'react';

/**
 * 长按手势：候选卡片与底部槽位共用。
 *
 * 三条硬约束（踩过坑，别改）：
 *   1. 手指移动超过 tolerance 立即取消计时 —— 否则列表上下滑动会被误判成长按；
 *   2. 长按触发后必须吃掉紧随其后的 click —— 否则「看克制」会顺带把人选进槽位；
 *   3. PC/模拟器右键直接触发，并拦掉默认菜单 —— 右键菜单会盖住弹窗。
 */

export const LONG_PRESS_MS = 400;
export const LONG_PRESS_TOLERANCE_PX = 10;

export interface LongPressOptions {
  /** 长按 / 右键触发 */
  onLongPress: () => void;
  /** 短按触发（长按后不会触发） */
  onClick?: () => void;
  /** 禁用长按（例如空槽位没有英雄可看） */
  disabled?: boolean;
  delay?: number;
  tolerance?: number;
}

export interface LongPressHandlers {
  onPointerDown: (e: ReactPointerEvent) => void;
  onPointerMove: (e: ReactPointerEvent) => void;
  onPointerUp: (e: ReactPointerEvent) => void;
  onPointerLeave: (e: ReactPointerEvent) => void;
  onPointerCancel: (e: ReactPointerEvent) => void;
  onClick: (e: ReactMouseEvent) => void;
  onContextMenu: (e: ReactMouseEvent) => void;
}

export function useLongPress({
  onLongPress,
  onClick,
  disabled = false,
  delay = LONG_PRESS_MS,
  tolerance = LONG_PRESS_TOLERANCE_PX,
}: LongPressOptions): LongPressHandlers {
  const timer = useRef<number | null>(null);
  const origin = useRef<{ x: number; y: number } | null>(null);
  const fired = useRef(false);
  /** 本次按下后是否发生过超容差位移（滑动列表 / 拖拽） */
  const moved = useRef(false);

  const clearTimer = () => {
    if (timer.current !== null) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
  };

  const cancel = () => {
    clearTimer();
    origin.current = null;
  };

  const handlePointerDown = (e: ReactPointerEvent) => {
    // 只认主键（左键 / 单指触摸）；右键走 onContextMenu
    if (disabled || e.button !== 0) return;
    clearTimer();
    fired.current = false;
    moved.current = false;
    origin.current = { x: e.clientX, y: e.clientY };
    timer.current = window.setTimeout(() => {
      timer.current = null;
      fired.current = true;
      onLongPress();
    }, delay);
  };

  const handlePointerMove = (e: ReactPointerEvent) => {
    if (timer.current === null || !origin.current) return;
    const dx = e.clientX - origin.current.x;
    const dy = e.clientY - origin.current.y;
    if (Math.hypot(dx, dy) > tolerance) {
      // 超过容差 = 用户在滑动列表，放弃这次长按，同时吃掉收尾的 click
      moved.current = true;
      cancel();
    }
  };

  const handleClick = () => {
    if (fired.current || moved.current) {
      // 长按已打开弹窗 / 这是一次滑动，都不应该再触发点选
      fired.current = false;
      moved.current = false;
      return;
    }
    onClick?.();
  };

  const handleContextMenu = (e: ReactMouseEvent) => {
    e.preventDefault();
    if (disabled) return;
    cancel();
    onLongPress();
  };

  return {
    onPointerDown: handlePointerDown,
    onPointerMove: handlePointerMove,
    onPointerUp: cancel,
    onPointerLeave: cancel,
    onPointerCancel: cancel,
    onClick: handleClick,
    onContextMenu: handleContextMenu,
  };
}
