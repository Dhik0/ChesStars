import { afterEach, describe, expect, it } from 'vitest';
import {
  backGuardCount,
  pushBackGuard,
  resetBackGuards,
  runTopBackGuard,
} from './backGuards';

afterEach(() => resetBackGuards());

describe('backGuards：页面内返回拦截器栈', () => {
  it('没有拦截器时返回 false', () => {
    expect(backGuardCount()).toBe(0);
    expect(runTopBackGuard()).toBe(false);
  });

  it('只执行最顶层的那一个', () => {
    const calls: string[] = [];
    pushBackGuard(() => calls.push('bottom'));
    pushBackGuard(() => calls.push('top'));

    expect(backGuardCount()).toBe(2);
    expect(runTopBackGuard()).toBe(true);
    expect(calls).toEqual(['top']);
  });

  it('取消注册后不再参与拦截，重复取消安全', () => {
    const calls: string[] = [];
    const release = pushBackGuard(() => calls.push('search'));

    release();
    release();

    expect(backGuardCount()).toBe(0);
    expect(runTopBackGuard()).toBe(false);
    expect(calls).toEqual([]);
  });

  it('取消中间一层后，剩下的顺序保持不变', () => {
    const calls: string[] = [];
    pushBackGuard(() => calls.push('a'));
    const releaseB = pushBackGuard(() => calls.push('b'));
    pushBackGuard(() => calls.push('c'));

    releaseB();
    runTopBackGuard();

    expect(calls).toEqual(['c']);
    expect(backGuardCount()).toBe(2);
  });
});
