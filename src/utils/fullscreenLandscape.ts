import { useCallback, useEffect, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { ScreenOrientation } from '@capacitor/screen-orientation';
import { StatusBar } from '@capacitor/status-bar';

/**
 * 全屏 + 横屏的统一开关。
 *
 * 两套实现，对外只暴露「进 / 出 / 切换 + 当前状态」：
 *
 * - **Web 浏览器**：`requestFullscreen()` 负责全屏，`screen.orientation.lock('landscape')`
 *   负责像视频一样自动横屏。两者刻意拆成两个 try/catch——PC / 平板浏览器不支持锁方向，
 *   但全屏本身仍然有效，不能因为锁方向失败就整体中断。
 * - **安卓原生壳（Capacitor）**：没有网页全屏概念，改用方向锁 + 隐藏状态栏做沉浸式全屏。
 *
 * 状态以 DOM 为准（原生壳没有 `fullscreenchange`，自己记账）：用户按 ESC、系统手势退出、
 * 或系统把方向改回竖屏时，都要让按钮图标立刻跟上，并顺手解开方向锁。
 *
 * 只做显示层的事，不碰任何 BP 计算与数据。
 */

const NATIVE = Capacitor.isNativePlatform();

/** 带 WebKit 前缀的全屏 API（老版 Safari / 安卓 WebView 仍在用） */
type FsDocument = {
  fullscreenEnabled?: boolean;
  fullscreenElement?: Element | null;
  exitFullscreen?: () => Promise<void>;
  webkitFullscreenEnabled?: boolean;
  webkitFullscreenElement?: Element | null;
  webkitExitFullscreen?: () => Promise<void>;
  webkitCancelFullScreen?: () => void;
};

type FsElement = {
  requestFullscreen?: () => Promise<void>;
  webkitRequestFullscreen?: () => Promise<void>;
  webkitRequestFullScreen?: () => void;
};

type OrientationApi = {
  type?: string;
  lock?: (orientation: string) => Promise<void>;
  unlock?: () => void;
};

const fsDoc = (): FsDocument => document as unknown as FsDocument;

function orientationApi(): OrientationApi | undefined {
  if (typeof screen === 'undefined') return undefined;
  return (screen as unknown as { orientation?: OrientationApi }).orientation;
}

/** 原生壳自己记账（安卓没有 fullscreenchange 事件）；Web 端一律以 DOM 为准 */
let nativeActive = false;
/** Web 端当前是否被我们锁过横屏：退出全屏时必须解开，否则页面会一直停在横屏 */
let webLocked = false;
/** 进 / 出过程中的去抖：连点两下不至于把状态机搅乱 */
let busy = false;

/* ------------------------------------------------------------------ *
 * 能力检测与状态读取
 * ------------------------------------------------------------------ */

let supportedCache: boolean | null = null;

/**
 * 当前环境能不能全屏。
 *
 * iPhone Safari 不支持普通元素的网页全屏（只有 video 可以），返回 false，
 * 调用方据此直接隐藏按钮——与其点一下没反应，不如不出现。
 */
export function isFullscreenLandscapeSupported(): boolean {
  if (supportedCache !== null) return supportedCache;
  if (typeof document === 'undefined') {
    supportedCache = false;
    return supportedCache;
  }
  if (NATIVE) {
    supportedCache = true;
    return supportedCache;
  }
  const d = fsDoc();
  const el = document.documentElement as unknown as FsElement;
  const canRequest = Boolean(
    el.requestFullscreen ?? el.webkitRequestFullscreen ?? el.webkitRequestFullScreen,
  );
  supportedCache = Boolean(d.fullscreenEnabled || d.webkitFullscreenEnabled) && canRequest;
  return supportedCache;
}

function isWebFullscreen(): boolean {
  const d = fsDoc();
  return Boolean(d.fullscreenElement ?? d.webkitFullscreenElement);
}

export function isFullscreenLandscapeActive(): boolean {
  if (typeof document === 'undefined') return false;
  return NATIVE ? nativeActive : isWebFullscreen();
}

export interface FullscreenLandscapeState {
  /** 当前环境是否支持全屏（不支持时按钮应隐藏） */
  supported: boolean;
  /** 当前是否处于全屏横屏 */
  active: boolean;
}

type Listener = (state: FullscreenLandscapeState) => void;
const listeners = new Set<Listener>();

function snapshot(): FullscreenLandscapeState {
  return {
    supported: isFullscreenLandscapeSupported(),
    active: isFullscreenLandscapeActive(),
  };
}

function emit(): void {
  const state = snapshot();
  listeners.forEach((fn) => fn(state));
}

/* ------------------------------------------------------------------ *
 * Web：全屏 + 方向锁
 * ------------------------------------------------------------------ */

function unlockWebOrientation(): void {
  try {
    orientationApi()?.unlock?.();
  } catch {
    /* 没锁上的环境解锁失败也无所谓 */
  }
  webLocked = false;
}

async function lockWebLandscape(): Promise<void> {
  // 单独一层 try/catch：锁方向失败不影响已经成功的全屏
  try {
    const api = orientationApi();
    if (!api?.lock) return;
    await api.lock('landscape');
    webLocked = true;
  } catch {
    /* PC / 平板浏览器不支持锁方向，保持全屏即可 */
  }
}

async function enterWeb(): Promise<boolean> {
  const el = document.documentElement as unknown as FsElement;
  const request = el.requestFullscreen ?? el.webkitRequestFullscreen ?? el.webkitRequestFullScreen;
  if (!request) return false;
  try {
    await request.call(el);
  } catch {
    // 非用户手势触发、或浏览器拒绝：维持原状，状态由 fullscreenchange 兜底
    return false;
  }
  await lockWebLandscape();
  emit();
  return true;
}

async function exitWeb(): Promise<void> {
  // 顺序固定：先解锁方向，再退全屏，回到竖屏不会卡在横屏
  unlockWebOrientation();
  const d = fsDoc();
  const exit = d.exitFullscreen ?? d.webkitExitFullscreen ?? d.webkitCancelFullScreen;
  try {
    await exit?.call(d);
  } catch {
    /* 已经不在全屏 / 浏览器拒绝：交给 fullscreenchange 同步 */
  }
  emit();
}

/* ------------------------------------------------------------------ *
 * 安卓原生：方向锁 + 状态栏
 * ------------------------------------------------------------------ */

const wait = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

async function readNativeOrientation(): Promise<string> {
  try {
    const res = await ScreenOrientation.orientation();
    return res.type;
  } catch {
    return '';
  }
}

async function enterNative(): Promise<boolean> {
  try {
    await ScreenOrientation.lock({ orientation: 'landscape' });
  } catch {
    // 系统关掉了旋转 / 设备不支持锁方向：继续隐藏状态栏，至少保住沉浸
  }
  try {
    await StatusBar.hide();
  } catch {
    /* 状态栏插件不可用时忽略 */
  }
  nativeActive = true;
  emit();
  return true;
}

async function exitNative(): Promise<void> {
  try {
    await StatusBar.show();
  } catch {
    /* 状态栏插件不可用时忽略 */
  }
  try {
    // 先读方向再解锁：解锁瞬间若手持角度仍是横屏，会立刻转回去。
    // 先钉一会儿竖屏再放开，回竖屏更顺滑。
    const before = await readNativeOrientation();
    if (before.startsWith('landscape')) {
      await ScreenOrientation.lock({ orientation: 'portrait' });
      await wait(320);
    }
    await ScreenOrientation.unlock();
  } catch {
    /* 解锁失败保持现状，下次进入会重新锁定 */
  }
  nativeActive = false;
  emit();
}

/* ------------------------------------------------------------------ *
 * 对外：进入 / 退出 / 切换
 * ------------------------------------------------------------------ */

export async function enterFullscreenLandscape(): Promise<void> {
  if (busy || !isFullscreenLandscapeSupported() || isFullscreenLandscapeActive()) return;
  busy = true;
  try {
    if (NATIVE) await enterNative();
    else await enterWeb();
  } finally {
    busy = false;
  }
}

export async function exitFullscreenLandscape(): Promise<void> {
  if (busy) return;
  busy = true;
  try {
    if (NATIVE) await exitNative();
    else await exitWeb();
  } finally {
    busy = false;
  }
}

export async function toggleFullscreenLandscape(): Promise<void> {
  if (isFullscreenLandscapeActive()) await exitFullscreenLandscape();
  else await enterFullscreenLandscape();
}

/* ------------------------------------------------------------------ *
 * 状态同步：ESC / 系统退出 / 方向变化
 * ------------------------------------------------------------------ */

function handleFullscreenChange(): void {
  // 用户按 ESC 或系统手势退出全屏：顺手解开方向锁，页面才能真的回到竖屏
  if (!NATIVE && !isWebFullscreen() && webLocked) unlockWebOrientation();
  emit();
}

function handleOrientationChange(): void {
  // 原生壳没有 fullscreenchange：方向被系统改回竖屏（关掉旋转锁定等）时视为退出沉浸
  if (NATIVE && nativeActive) {
    const type = orientationApi()?.type ?? '';
    if (type.startsWith('portrait')) {
      nativeActive = false;
      void StatusBar.show().catch(() => undefined);
    }
  }
  emit();
}

if (typeof document !== 'undefined' && typeof window !== 'undefined') {
  document.addEventListener('fullscreenchange', handleFullscreenChange);
  document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
  window.addEventListener('orientationchange', handleOrientationChange);
}

/** 订阅状态变化；回调会立即收到一次当前状态 */
export function subscribeFullscreenLandscape(fn: Listener): () => void {
  listeners.add(fn);
  fn(snapshot());
  return () => {
    listeners.delete(fn);
  };
}

/** 组件侧入口：状态 + 三个动作 */
export function useFullscreenLandscape(): FullscreenLandscapeState & {
  enter: () => void;
  exit: () => void;
  toggle: () => void;
} {
  const [state, setState] = useState<FullscreenLandscapeState>(snapshot);

  useEffect(() => subscribeFullscreenLandscape(setState), []);

  const enter = useCallback(() => {
    void enterFullscreenLandscape();
  }, []);
  const exit = useCallback(() => {
    void exitFullscreenLandscape();
  }, []);
  const toggle = useCallback(() => {
    void toggleFullscreenLandscape();
  }, []);

  return { ...state, enter, exit, toggle };
}
