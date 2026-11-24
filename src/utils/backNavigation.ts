/**
 * Android 返回键（含左右边缘侧滑返回）的逐层决策。
 *
 * 这里只做「当前该做什么」的纯计算：输入是当前界面状态 + 上一次返回时间，
 * 输出是一个动作。真正的副作用（关弹窗、切页面、退出 App）留在 App 里执行，
 * 这样每一层优先级都能被单元测试直接盯住，不需要渲染组件。
 *
 * 优先级（每次返回只走最上面一层）：
 *   1. 关闭最顶层模态层（更新说明 / 对位详情 / 长按对位）；
 *   2. 消费页面内临时状态（选图页搜索框有内容时先清空搜索）；
 *   3. 非「BP 助手」一级页面 → 切回「BP 助手」；
 *   4. 选图页（已建局）→ 回到 BP 面板；
 *   5. 已在 BP 主页面 → 双击退出：首次只提示，2 秒内再按一次才退出。
 */

/** 双击退出的时间窗：首次返回后这段时间内再按一次才真正退出 */
export const EXIT_CONFIRM_WINDOW_MS = 2000;

/** 可叠放的模态层。数组末尾 = 最顶层（z-index 更高） */
export type BackLayer = 'matchup' | 'detail' | 'update';

/** 一级页面 */
export type BackTab = 'draft' | 'settings';

/** 「BP 助手」Tab 内的二级页面 */
export type BackScreen = 'select' | 'draft';

export interface BackState {
  /** 当前已打开的模态层，按叠放顺序排列 */
  layers: BackLayer[];
  /** 当前一级页面 */
  tab: BackTab;
  /** BP 助手内的二级页面 */
  screen: BackScreen;
  /** 是否已经建局（启动首屏停在选图页时为 false） */
  hasDraft: boolean;
  /** 页面内是否有可被返回键消费的临时状态（如选图页搜索框非空） */
  hasGuard: boolean;
}

export type BackAction =
  | { type: 'closeLayer'; layer: BackLayer }
  | { type: 'runGuard' }
  | { type: 'goMainTab' }
  | { type: 'leaveMapPicker' }
  | { type: 'showExitHint' }
  | { type: 'exitApp' };

export interface BackDecision {
  action: BackAction;
  /**
   * 处理完后应记录的「上次返回时间」：
   * 提示退出时写入本次时间；其余动作（关弹窗 / 切页面 / 真退出）一律清空计时，
   * 避免用户关完弹窗再滑一次就被判成「二次返回」直接退出。
   */
  lastBackAt: number | null;
}

/**
 * 计算本次返回该执行哪一步。
 *
 * @param state     当前界面状态
 * @param lastBackAt 上一次「退出提示」的时间戳；null = 当前不在双击窗口内
 * @param now       本次返回的时间戳
 */
export function decideBack(
  state: BackState,
  lastBackAt: number | null,
  now: number,
): BackDecision {
  // 1. 最顶层模态层
  const topLayer = state.layers.length > 0 ? state.layers[state.layers.length - 1]! : null;
  if (topLayer) {
    return { action: { type: 'closeLayer', layer: topLayer }, lastBackAt: null };
  }

  // 2. 页面内临时状态（搜索框等）
  if (state.hasGuard) {
    return { action: { type: 'runGuard' }, lastBackAt: null };
  }

  // 3. 非主页面 Tab → 回「BP 助手」
  if (state.tab !== 'draft') {
    return { action: { type: 'goMainTab' }, lastBackAt: null };
  }

  // 4. 选图页（已建局）→ 回 BP 面板；首屏没建局时不算可返回的页面
  if (state.hasDraft && state.screen === 'select') {
    return { action: { type: 'leaveMapPicker' }, lastBackAt: null };
  }

  // 5. BP 主页面：双击退出
  const delta = lastBackAt === null ? Number.POSITIVE_INFINITY : now - lastBackAt;
  if (delta >= 0 && delta <= EXIT_CONFIRM_WINDOW_MS) {
    return { action: { type: 'exitApp' }, lastBackAt: null };
  }
  return { action: { type: 'showExitHint' }, lastBackAt: now };
}
