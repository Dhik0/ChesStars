/**
 * Web 端 Service Worker 的「新版本已就绪」状态与「立即更新」动作。
 *
 * 为什么单独一个模块：`main.tsx` 渲染完成后才动态 import PWA 注册逻辑，
 * 而 `App.tsx` 需要在界面上反映「新版本已经装好、等用户点一下」。两边只通过
 * 这里的一个标志位 + 订阅回调通信，不引入 React 依赖，也不会把注册逻辑拉进首屏。
 *
 * 刷新时机刻意交给用户：BP 进行中被强制刷新会丢掉整局进度，
 * 所以 Service Worker 可以立刻接管，页面什么时候刷新由顶部提示条决定。
 */

type Listener = () => void;

let ready = false;
const listeners = new Set<Listener>();

/** 新版本 Service Worker 已接管，等用户确认刷新 */
export function markSwUpdateReady(): void {
  if (ready) return;
  ready = true;
  for (const fn of listeners) fn();
}

export function isSwUpdateReady(): boolean {
  return ready;
}

/** 订阅「新版本已就绪」；返回取消订阅函数 */
export function onSwUpdateReady(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/**
 * 等新 Service Worker 接管当前页面。
 * 已经在自动更新模式下接管时 `controllerchange` 可能早于注册，故加超时兜底，
 * 绝不因为等不到事件而卡住刷新。
 */
function waitForController(timeoutMs: number): Promise<void> {
  return new Promise((resolve) => {
    let timer = 0;
    const done = (): void => {
      window.clearTimeout(timer);
      navigator.serviceWorker.removeEventListener('controllerchange', done);
      resolve();
    };
    timer = window.setTimeout(done, timeoutMs);
    navigator.serviceWorker.addEventListener('controllerchange', done);
  });
}

/**
 * 点击「立即更新」：先让浏览器重新检查 Service Worker 并清掉旧缓存，
 * 再整页刷新拿新的 index.html 与静态资源。
 *
 * 任何一步失败都只影响「是否多等一会儿」，最终一定会刷新。
 */
export async function applyWebUpdate(): Promise<void> {
  try {
    if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(
        registrations.map(async (reg) => {
          try {
            await reg.update();
            // 旧版（prompt 模式）留下的 waiting worker 不会自己接管，需要催一下
            reg.waiting?.postMessage({ type: 'SKIP_WAITING' });
          } catch {
            /* 单个注册更新失败不影响刷新 */
          }
        }),
      );
      await waitForController(1200);
    }
  } catch {
    /* 环境不支持 Service Worker：直接刷新即可 */
  }
  window.location.reload();
}
