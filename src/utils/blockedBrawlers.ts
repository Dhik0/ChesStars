import { useCallback, useEffect, useMemo, useState } from 'react';

/**
 * 个人「不喜欢 / 屏蔽」英雄名单。
 *
 * 只影响**展示层**：己方选人阶段的推荐栏会跳过这些英雄（并从后面的高分英雄补齐），
 * Ban 推荐与全英雄池都不受影响——屏蔽是个人口味，不能让人因此漏掉高威胁 Ban 位，
 * 也不能让敌方选人 / 手动录入时点不到英雄。
 *
 * 存储用 localStorage，与 `brawl.draft.map` / `brawl.draft.lang` 同一命名空间。
 * 隐私模式 / 存储被禁用时全部读写都吞掉异常：本次会话内仍然可用，只是不持久。
 */

export const BLOCKED_STORAGE_KEY = 'brawl.draft.blockedBrawlers';

/**
 * 清洗存储值：只保留正整数 ID，去重并保持顺序。
 * 数据更新后可能出现已下架英雄的旧 ID，这里不做剔除——渲染层查不到名字时用 `#id` 兜底。
 */
function sanitize(raw: unknown): number[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<number>();
  const out: number[] = [];
  for (const value of raw) {
    if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) continue;
    if (seen.has(value)) continue;
    seen.add(value);
    out.push(value);
  }
  return out;
}

/** 读取屏蔽名单；JSON 损坏 / 存储不可用时返回空数组 */
export function readBlockedIds(): number[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(BLOCKED_STORAGE_KEY);
    if (!raw) return [];
    return sanitize(JSON.parse(raw) as unknown);
  } catch {
    // 解析失败或隐私模式禁用存储：当作没屏蔽过
    return [];
  }
}

/** 写入屏蔽名单；写失败不影响本次会话（内存里的 state 仍然是准的） */
export function writeBlockedIds(ids: number[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(BLOCKED_STORAGE_KEY, JSON.stringify(sanitize(ids)));
  } catch {
    /* 配额不足 / 隐私模式：忽略 */
  }
}

export interface BlockedBrawlers {
  /** 按屏蔽顺序排列的 ID 列表（集中管理弹层用） */
  ids: number[];
  /** 判断 / 过滤用的集合 */
  blocked: Set<number>;
  isBlocked: (id: number) => boolean;
  /** 切换单个英雄的屏蔽状态 */
  toggle: (id: number) => void;
  /** 清空全部屏蔽 */
  clear: () => void;
}

/**
 * 屏蔽名单的 React 绑定：状态在本进程内唯一来源，每次变更同步落盘。
 * 落盘放在 effect 里而不是 setState 更新函数里——更新函数在 StrictMode 下会被重复执行。
 */
export function useBlockedBrawlers(): BlockedBrawlers {
  const [ids, setIds] = useState<number[]>(() => readBlockedIds());

  const blocked = useMemo(() => new Set(ids), [ids]);

  useEffect(() => {
    writeBlockedIds(ids);
  }, [ids]);

  const toggle = useCallback((id: number) => {
    setIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }, []);

  const clear = useCallback(() => setIds([]), []);

  const isBlocked = useCallback((id: number) => blocked.has(id), [blocked]);

  return { ids, blocked, isBlocked, toggle, clear };
}
