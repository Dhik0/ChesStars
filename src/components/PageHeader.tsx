import type { ReactNode } from 'react';
import { ArrowLeft } from 'lucide-react';

/**
 * 原生大标题页头（设置 / 战绩共用）。
 *
 * 标题不吸顶，随列表一起上滑；顶部那层渐隐遮罩由 `PageVeil` 单独盖在页面根上，
 * 列表从底下滚过去时会自然淡出，不会和状态栏时间叠在一起。
 */
export function PageTitle({
  title,
  trailing,
}: {
  title: string;
  trailing?: ReactNode;
}) {
  return (
    <header className="page-head flex items-end justify-between gap-3">
      <h1 className="page-title">{title}</h1>
      {trailing}
    </header>
  );
}

/** 顶部安全区渐隐遮罩：放在页面根容器里（根容器需 relative） */
export function PageVeil() {
  return <div className="page-veil" aria-hidden />;
}

/** 二级子页页头：40px 返回箭头 + 28px 大标题 */
export function SubpageHeader({
  title,
  onBack,
  backLabel,
}: {
  title: string;
  onBack: () => void;
  backLabel: string;
}) {
  return (
    <header className="subpage-head">
      <button
        type="button"
        onClick={onBack}
        className="subpage-back"
        aria-label={backLabel}
      >
        <ArrowLeft size={22} strokeWidth={2.2} />
      </button>
      <h1 className="subpage-title min-w-0 truncate">{title}</h1>
    </header>
  );
}
