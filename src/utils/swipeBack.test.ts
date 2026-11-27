import { describe, expect, it } from 'vitest';
import {
  SWIPE_BACK_EDGE_PX,
  SWIPE_BACK_MS,
  SWIPE_BACK_THRESHOLD,
  shouldSwipeBack,
} from './useSwipeBack';

/**
 * 设置二级子页「右滑返回」的判定守卫。
 * 只盯三件事：左侧系统手势盲区、30% 屏宽阈值、方向必须是向右。
 */

const WIDTH = 400;

describe('shouldSwipeBack', () => {
  it('拖过屏宽 30% 松手即返回', () => {
    expect(shouldSwipeBack(100, 100 + WIDTH * SWIPE_BACK_THRESHOLD + 1, WIDTH)).toBe(true);
    expect(shouldSwipeBack(120, 320, WIDTH)).toBe(true);
  });

  it('不足 30% 松手回弹，不返回', () => {
    expect(shouldSwipeBack(100, 100 + WIDTH * SWIPE_BACK_THRESHOLD - 1, WIDTH)).toBe(false);
    expect(shouldSwipeBack(100, 110, WIDTH)).toBe(false);
  });

  it('刚好等于阈值不算越过', () => {
    expect(shouldSwipeBack(100, 100 + WIDTH * SWIPE_BACK_THRESHOLD, WIDTH)).toBe(false);
  });

  it('起点落在最左侧 28px 系统手势盲区里不接管', () => {
    expect(shouldSwipeBack(SWIPE_BACK_EDGE_PX, 380, WIDTH)).toBe(false);
    expect(shouldSwipeBack(0, 380, WIDTH)).toBe(false);
  });

  it('盲区外 1px 起滑可以接管', () => {
    expect(shouldSwipeBack(SWIPE_BACK_EDGE_PX + 1, 300, WIDTH)).toBe(true);
  });

  it('向左拖 / 原地不动一律不返回', () => {
    expect(shouldSwipeBack(300, 100, WIDTH)).toBe(false);
    expect(shouldSwipeBack(200, 200, WIDTH)).toBe(false);
  });

  it('阈值按视口宽度自适应', () => {
    expect(SWIPE_BACK_THRESHOLD).toBe(0.3);
    expect(shouldSwipeBack(200, 200 + 320 * 0.3 + 1, 320)).toBe(true);
  });

  it('弹出动画时长与推入一致', () => {
    expect(SWIPE_BACK_MS).toBe(260);
  });
});
