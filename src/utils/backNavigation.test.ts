import { describe, expect, it } from 'vitest';
import {
  EXIT_CONFIRM_WINDOW_MS,
  decideBack,
  type BackLayer,
  type BackState,
} from './backNavigation';

/** BP 主页面（已建局、无弹层）的基准状态 */
function mainPage(over: Partial<BackState> = {}): BackState {
  return {
    layers: [],
    tab: 'draft',
    screen: 'draft',
    hasDraft: true,
    hasGuard: false,
    ...over,
  };
}

const T0 = 1_700_000_000_000;

describe('decideBack：弹层优先', () => {
  it('有弹层时只关最顶层，不切页面也不退出', () => {
    const res = decideBack(mainPage({ layers: ['matchup', 'detail'] }), null, T0);
    expect(res.action).toEqual({ type: 'closeLayer', layer: 'detail' });
    // 关弹窗不算「按过返回键」，双击计时必须清空
    expect(res.lastBackAt).toBeNull();
  });

  it('更新弹窗盖在详情之上时先关更新弹窗', () => {
    const layers: BackLayer[] = ['matchup', 'detail', 'update'];
    const res = decideBack(mainPage({ layers }), null, T0);
    expect(res.action).toEqual({ type: 'closeLayer', layer: 'update' });
  });

  it('只有一层时关这一层', () => {
    expect(decideBack(mainPage({ layers: ['matchup'] }), null, T0).action).toEqual({
      type: 'closeLayer',
      layer: 'matchup',
    });
  });

  it('设置页上有弹层时，先关弹层而不是切回 BP 助手', () => {
    const res = decideBack(mainPage({ tab: 'settings', layers: ['update'] }), null, T0);
    expect(res.action).toEqual({ type: 'closeLayer', layer: 'update' });
  });
});

describe('decideBack：逐层返回', () => {
  it('设置页无弹层时切回 BP 助手', () => {
    const res = decideBack(mainPage({ tab: 'settings' }), null, T0);
    expect(res.action).toEqual({ type: 'goMainTab' });
    expect(res.lastBackAt).toBeNull();
  });

  it('选图页（已建局）返回 BP 面板', () => {
    const res = decideBack(mainPage({ screen: 'select' }), null, T0);
    expect(res.action).toEqual({ type: 'leaveMapPicker' });
  });

  it('首屏选图（未建局）不当作可返回页面，走双击退出', () => {
    const res = decideBack(
      mainPage({ screen: 'select', hasDraft: false }),
      null,
      T0,
    );
    expect(res.action).toEqual({ type: 'showExitHint' });
  });

  it('页面内搜索框有内容时先清空搜索，优先于切 Tab', () => {
    const res = decideBack(
      mainPage({ tab: 'settings', screen: 'select', hasGuard: true }),
      null,
      T0,
    );
    expect(res.action).toEqual({ type: 'runGuard' });
  });

  it('弹层优先于搜索拦截', () => {
    const res = decideBack(mainPage({ layers: ['detail'], hasGuard: true }), null, T0);
    expect(res.action).toEqual({ type: 'closeLayer', layer: 'detail' });
  });
});

describe('decideBack：主页面双击退出', () => {
  it('首次返回只提示，不退出，并记录时间', () => {
    const res = decideBack(mainPage(), null, T0);
    expect(res.action).toEqual({ type: 'showExitHint' });
    expect(res.lastBackAt).toBe(T0);
  });

  it('2 秒内再次返回触发退出，并清空计时', () => {
    const first = decideBack(mainPage(), null, T0);
    const second = decideBack(mainPage(), first.lastBackAt, T0 + 1200);
    expect(second.action).toEqual({ type: 'exitApp' });
    expect(second.lastBackAt).toBeNull();
  });

  it('刚好卡在 2000ms 边界仍算二次返回', () => {
    const second = decideBack(mainPage(), T0, T0 + EXIT_CONFIRM_WINDOW_MS);
    expect(second.action).toEqual({ type: 'exitApp' });
  });

  it('超过 2 秒后重新计次：再提示一次，不退出', () => {
    const second = decideBack(mainPage(), T0, T0 + EXIT_CONFIRM_WINDOW_MS + 1);
    expect(second.action).toEqual({ type: 'showExitHint' });
    expect(second.lastBackAt).toBe(T0 + EXIT_CONFIRM_WINDOW_MS + 1);
  });

  it('超时后重新计次，紧接着的一次返回才退出', () => {
    const stale = decideBack(mainPage(), T0, T0 + 5000);
    expect(stale.action).toEqual({ type: 'showExitHint' });
    const retry = decideBack(mainPage(), stale.lastBackAt, T0 + 5000 + 800);
    expect(retry.action).toEqual({ type: 'exitApp' });
  });

  it('关完弹窗后的一次返回重新开始计次，不会被判成二次退出', () => {
    const closed = decideBack(mainPage({ layers: ['detail'] }), T0, T0 + 300);
    expect(closed.lastBackAt).toBeNull();
    const next = decideBack(mainPage(), closed.lastBackAt, T0 + 600);
    expect(next.action).toEqual({ type: 'showExitHint' });
  });
});
