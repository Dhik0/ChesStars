import { describe, expect, it } from 'vitest';
import {
  SWIPE_EDGE_PX,
  SWIPE_MIN_DISTANCE,
  decideSwipe,
  isEdgeTouch,
  type SwipeDecisionInput,
} from './swipeNav';

/**
 * 滑动切页的判定单测。
 *
 * 这里只测纯函数：`decideSwipe` 决定「这次手势算不算切页」，
 * 它必须把五条禁用条件全部挡在切页之前——漏掉任何一条，
 * 用户就会在滚列表 / 点英雄 / 侧滑返回时被莫名其妙地翻页。
 */

/** 390×844 的竖屏手机，手指从屏幕中间偏左起手 */
const base: SwipeDecisionInput = {
  start: { x: 200, y: 400 },
  end: { x: 200, y: 400 },
  viewportWidth: 390,
  enabled: true,
  inHorizontalScroller: false,
};

const swipe = (dx: number, dy = 0, patch: Partial<SwipeDecisionInput> = {}) =>
  decideSwipe({
    ...base,
    ...patch,
    start: { x: 200, y: 400 },
    end: { x: 200 + dx, y: 400 + dy },
  });

describe('方向判定', () => {
  it('手指向左滑 = 去下一个 Tab', () => {
    expect(swipe(-SWIPE_MIN_DISTANCE)).toBe('next');
    expect(swipe(-160)).toBe('next');
  });

  it('手指向右滑 = 回上一个 Tab', () => {
    expect(swipe(SWIPE_MIN_DISTANCE)).toBe('prev');
    expect(swipe(160)).toBe('prev');
  });
});

describe('禁用条件：位移', () => {
  it('横向位移不足 56px 不算切页', () => {
    expect(swipe(-SWIPE_MIN_DISTANCE + 1)).toBeNull();
    expect(swipe(SWIPE_MIN_DISTANCE - 1)).toBeNull();
    expect(swipe(0)).toBeNull();
  });

  it('刚好到阈值就算（边界含在内）', () => {
    expect(swipe(-SWIPE_MIN_DISTANCE)).toBe('next');
  });

  it('纵向位移占优时不算切页（用户在滚列表）', () => {
    expect(swipe(-120, 200)).toBeNull();
    // 横竖一样长也按竖向处理，宁可不动
    expect(swipe(-120, 120)).toBeNull();
  });

  it('横向略占优但纵向也有明显位移时仍然切页', () => {
    expect(swipe(-120, 60)).toBe('next');
  });
});

describe('禁用条件：场景', () => {
  it('BP 选人界面 / 弹窗打开时整页禁用', () => {
    expect(swipe(-200, 0, { enabled: false })).toBeNull();
  });

  it('落点在可横向滚动的子容器里不切页', () => {
    expect(swipe(-200, 0, { inHorizontalScroller: true })).toBeNull();
  });

  it('落点在左右 28px 边缘禁区不切页（安卓侧滑返回手势区）', () => {
    const atLeftEdge = decideSwipe({
      ...base,
      start: { x: SWIPE_EDGE_PX - 1, y: 400 },
      end: { x: SWIPE_EDGE_PX - 1 + 160, y: 400 },
    });
    const atRightEdge = decideSwipe({
      ...base,
      start: { x: 390 - SWIPE_EDGE_PX + 1, y: 400 },
      end: { x: 390 - SWIPE_EDGE_PX + 1 - 160, y: 400 },
    });
    expect(atLeftEdge).toBeNull();
    expect(atRightEdge).toBeNull();
  });

  it('刚好离开边缘禁区就可以切页', () => {
    const result = decideSwipe({
      ...base,
      start: { x: SWIPE_EDGE_PX + 1, y: 400 },
      end: { x: SWIPE_EDGE_PX + 1 - 160, y: 400 },
    });
    expect(result).toBe('next');
  });

  it('阈值与边缘宽度可以按需覆盖', () => {
    expect(swipe(-30, 0, { minDistance: 20 })).toBe('next');
    expect(swipe(-30, 0, { minDistance: 100 })).toBeNull();
  });
});

describe('isEdgeTouch', () => {
  it('左右两侧各 28px 是禁区', () => {
    expect(isEdgeTouch(0, 390)).toBe(true);
    expect(isEdgeTouch(SWIPE_EDGE_PX, 390)).toBe(true);
    expect(isEdgeTouch(SWIPE_EDGE_PX + 1, 390)).toBe(false);
    expect(isEdgeTouch(390 - SWIPE_EDGE_PX, 390)).toBe(true);
    expect(isEdgeTouch(390 - SWIPE_EDGE_PX - 1, 390)).toBe(false);
  });
});
