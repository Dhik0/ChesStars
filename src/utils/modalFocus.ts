import { useEffect, type RefObject } from 'react';

/**
 * 模态对话框焦点管理（M3 / WCAG 2.1）。
 *
 * 三件事：
 *   1. 打开时记住触发元素，把焦点移入对话框首个可聚焦项；
 *   2. Tab / Shift+Tab 在对话框内循环，不跑到被遮罩盖住的底层；
 *   3. 关闭时把焦点还给触发元素，键盘用户不会「丢位置」。
 *
 * 只处理焦点，不接管 Escape —— 返回键/Escape 仍由 App 的 backNavigation 栈统一消费，
 * 避免两套关闭逻辑打架。对话框退出动画由各自组件负责，卸载时本 hook 自动归还焦点。
 */
export function useModalFocus(dialogRef: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    const previouslyFocused = document.activeElement as HTMLElement | null;

    const focusableSelector = [
      'a[href]',
      'button:not([disabled])',
      'input:not([disabled]):not([type="hidden"])',
      'select:not([disabled])',
      'textarea:not([disabled])',
      '[tabindex]:not([tabindex="-1"])',
    ].join(',');

    const getFocusable = () =>
      Array.from(dialog.querySelectorAll<HTMLElement>(focusableSelector)).filter(
        (el) => el.getClientRects().length > 0 && el.tabIndex >= 0,
      );

    // 首帧移入：优先首个可聚焦项；对话框里没有可聚焦项时聚焦容器本身（需 tabIndex=-1）
    const first = getFocusable()[0];
    (first ?? dialog).focus({ preventScroll: true });

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return;
      const items = getFocusable();
      if (items.length === 0) {
        event.preventDefault();
        dialog.focus({ preventScroll: true });
        return;
      }
      const firstItem = items[0];
      const lastItem = items[items.length - 1];
      const active = document.activeElement;
      if (event.shiftKey && (active === firstItem || active === dialog)) {
        event.preventDefault();
        lastItem.focus();
      } else if (!event.shiftKey && active === lastItem) {
        event.preventDefault();
        firstItem.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
      // 触发元素可能已被卸载（例如从战绩卡片打开复盘后删除），focus 到失效节点没有意义
      if (previouslyFocused && document.contains(previouslyFocused)) {
        previouslyFocused.focus({ preventScroll: true });
      }
    };
  }, [dialogRef]);
}
