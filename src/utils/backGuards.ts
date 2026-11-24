import { useEffect, useRef } from 'react';

/**
 * 页面内的「返回键临时状态」栈。
 *
 * 模态层（弹窗 / 抽屉）由 App 统一从 state 推导，不需要走这里；
 * 这里只处理组件内部、外部看不见的临时状态——目前唯一的使用者是
 * 选图页的搜索框：搜索框有内容时，返回键先清空搜索，而不是直接退出页面。
 *
 * 用栈而不是单例，是为了将来出现「弹层里再开一个可返回状态」时不至于互相覆盖。
 */
type BackGuard = () => void;

const stack: BackGuard[] = [];

/** 注册一个返回键拦截器，返回取消注册的函数（重复调用安全） */
export function pushBackGuard(guard: BackGuard): () => void {
  stack.push(guard);
  let released = false;
  return () => {
    if (released) return;
    released = true;
    const i = stack.lastIndexOf(guard);
    if (i >= 0) stack.splice(i, 1);
  };
}

/** 当前待消费的拦截器数量（App 用它决定这次返回要不要先走拦截器） */
export function backGuardCount(): number {
  return stack.length;
}

/** 执行最顶层拦截器；返回 false 表示当前没有拦截器 */
export function runTopBackGuard(): boolean {
  const guard = stack[stack.length - 1];
  if (!guard) return false;
  guard();
  return true;
}

/** 清空所有拦截器（单元测试用） */
export function resetBackGuards(): void {
  stack.length = 0;
}

/**
 * 组件内声明式注册返回拦截器：`active` 为 true 期间，返回键先交给 `handler`。
 * 处理器存在 ref 里，避免每次渲染都重新注册。
 */
export function useBackGuard(active: boolean, handler: () => void): void {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    if (!active) return;
    return pushBackGuard(() => handlerRef.current());
  }, [active]);
}
