import { useCallback, useEffect, useState } from 'react';
import type { ReviewGrade } from './reviewEngine';

/**
 * 复盘评级音效 —— **只给 `!!`（brilliant / 妙手）出声**。
 *
 * 参照 Chess.com 的实际体验：一颗妙手值得一声提示，其余五档只用视觉弹出，
 * 否则六个人轮着响会把复盘变成噪音。所以这里只保留一条播放路径：
 *
 *   1. 本地文件优先：`src/assets/sfx/brilliant.{mp3,ogg,wav}`（构建时静态扫描，
 *      没有文件就是 null，不会产生任何 404 请求）；
 *   2. 没有本地文件时回退到 Web Audio 现场合成的 `!!` 音色（明亮上升大三和弦琶音
 *      + 高频闪烁），零资源体积、零网络依赖。
 *
 * 静音开关照旧持久化在 localStorage，对所有声音（包括这一声）统一生效。
 */

export const SFX_MUTED_KEY = 'brawl.draft.sfxMuted';

const SFX_MODULES = import.meta.glob('../assets/sfx/brilliant.{mp3,ogg,wav}', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>;

/** 约定文件名的 URL；目录为空时为 null（走合成音） */
const LOCAL_BRILLIANT: string | null = Object.values(SFX_MODULES)[0] ?? null;

/* ------------------------------------------------------------------ *
 * 静音开关（localStorage）
 * ------------------------------------------------------------------ */

export function isSfxMuted(): boolean {
  try {
    if (typeof localStorage === 'undefined') return false;
    return localStorage.getItem(SFX_MUTED_KEY) === '1';
  } catch {
    return false;
  }
}

export function setSfxMuted(muted: boolean): void {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(SFX_MUTED_KEY, muted ? '1' : '0');
  } catch {
    /* 隐私模式 / 配额满：只影响持久化 */
  }
}

/** 静音状态的 React 绑定：状态在进程内唯一来源，变更同步落盘 */
export function useSfxMuted(): { muted: boolean; toggle: () => void } {
  const [muted, setMuted] = useState(() => isSfxMuted());

  useEffect(() => {
    setSfxMuted(muted);
  }, [muted]);

  const toggle = useCallback(() => setMuted((prev) => !prev), []);

  return { muted, toggle };
}

/* ------------------------------------------------------------------ *
 * Web Audio 合成（只有 !! 一档）
 * ------------------------------------------------------------------ */

type AudioContextCtor = typeof AudioContext;

let audioCtx: AudioContext | null = null;

function contextCtor(): AudioContextCtor | null {
  if (typeof window === 'undefined') return null;
  // Safari / 老 WebView 只有 webkit 前缀版；两者都没有就返回 null（静默降级）
  const legacy = (globalThis as typeof globalThis & { webkitAudioContext?: AudioContextCtor })
    .webkitAudioContext;
  return (typeof AudioContext !== 'undefined' ? AudioContext : null) ?? legacy ?? null;
}

function ensureContext(): AudioContext | null {
  if (audioCtx) return audioCtx;
  const Ctor = contextCtor();
  if (!Ctor) return null;
  try {
    audioCtx = new Ctor();
    return audioCtx;
  } catch {
    return null;
  }
}

/**
 * 唤醒音频上下文。
 *
 * 浏览器要求 AudioContext 必须在用户手势里创建 / resume，所以「复盘」按钮的
 * onClick 里先调一次它；等卡片揭晓时，声音才不会被静默拦截。
 */
export function unlockSfx(): void {
  const ctx = ensureContext();
  if (!ctx) return;
  if (ctx.state === 'suspended') void ctx.resume().catch(() => undefined);
}

interface ToneSpec {
  /** 起始频率（Hz） */
  freq: number;
  /** 相对本次播放起点的延迟（秒） */
  start: number;
  /** 时长（秒） */
  dur: number;
  type?: OscillatorType;
  /** 相对主音量的增益（0~1） */
  gain?: number;
}

/** 主音量：合成音整体偏轻，避免在手机扬声器上刺耳 */
const MASTER_GAIN = 0.16;

function playTones(ctx: AudioContext, tones: readonly ToneSpec[]): void {
  const now = ctx.currentTime;
  for (const tone of tones) {
    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    const t0 = now + tone.start;
    const t1 = t0 + tone.dur;

    osc.type = tone.type ?? 'sine';
    osc.frequency.setValueAtTime(tone.freq, t0);

    const peak = Math.max(0.0001, (tone.gain ?? 1) * MASTER_GAIN);
    env.gain.setValueAtTime(0.0001, t0);
    env.gain.exponentialRampToValueAtTime(peak, t0 + 0.012);
    env.gain.exponentialRampToValueAtTime(0.0001, t1);

    osc.connect(env);
    env.connect(ctx.destination);

    osc.start(t0);
    osc.stop(t1 + 0.02);
  }
}

/**
 * `!!` 的合成音：明亮清脆的上升大三和弦琶音（C-E-G-C）+ 两枚高频闪烁，
 * 做出「亮片」质感——这是没有 Fan Kit 素材时听到的那一版。
 */
const BRILLIANT_TONES: readonly ToneSpec[] = [
  { freq: 523.25, start: 0, dur: 0.16, type: 'triangle', gain: 0.55 },
  { freq: 659.25, start: 0.07, dur: 0.16, type: 'triangle', gain: 0.55 },
  { freq: 783.99, start: 0.14, dur: 0.18, type: 'triangle', gain: 0.6 },
  { freq: 1046.5, start: 0.21, dur: 0.26, type: 'triangle', gain: 0.65 },
  { freq: 2093, start: 0.3, dur: 0.09, type: 'sine', gain: 0.22 },
  { freq: 3136, start: 0.35, dur: 0.09, type: 'sine', gain: 0.16 },
];

function synthBrilliant(): void {
  const ctx = ensureContext();
  if (!ctx) return;
  if (ctx.state === 'suspended') void ctx.resume().catch(() => undefined);
  try {
    playTones(ctx, BRILLIANT_TONES);
  } catch {
    /* 音频不可用（老 WebView / 被策略禁用）：静默降级 */
  }
}

/* ------------------------------------------------------------------ *
 * 播放
 * ------------------------------------------------------------------ */

let localAudio: HTMLAudioElement | null = null;

/** 播放本地文件；解码失败 / 自动播放被拦截时返回 false，交给合成音兜底 */
function playLocal(url: string): Promise<boolean> {
  try {
    if (!localAudio) {
      localAudio = new Audio(url);
      localAudio.preload = 'auto';
    }
    localAudio.currentTime = 0;
    return localAudio
      .play()
      .then(() => true)
      .catch(() => false);
  } catch {
    return Promise.resolve(false);
  }
}

/**
 * 复盘音效的唯一入口。
 *
 * 只有 `brilliant`（`!!`）会出声，其余评级直接返回——调用方可以无脑传评级，
 * 不必在界面层再判一次；静音时同样直接返回。
 */
export function playReviewSfx(grade: ReviewGrade): void {
  if (grade !== 'brilliant') return;
  if (isSfxMuted()) return;

  if (LOCAL_BRILLIANT) {
    void playLocal(LOCAL_BRILLIANT).then((ok) => {
      if (!ok) synthBrilliant();
    });
    return;
  }
  synthBrilliant();
}
