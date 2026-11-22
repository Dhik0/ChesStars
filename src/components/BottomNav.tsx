import type { ReactNode } from 'react';
import { Settings, Swords } from 'lucide-react';

/** 一级页面：左侧「BP 助手」（选图 + BP 主流程）/ 右侧「设置」 */
export type MainTab = 'draft' | 'settings';

interface BottomNavProps {
  tab: MainTab;
  onChange: (tab: MainTab) => void;
  /** 发现新版本：设置 Tab 图标右上角打一个小圆点 */
  hasUpdate?: boolean;
}

interface TabButtonProps {
  active: boolean;
  label: string;
  /** 图标右侧角标（新版本红点） */
  dot?: boolean;
  ariaLabel: string;
  onClick: () => void;
  children: ReactNode;
}

function TabButton({ active, label, dot = false, ariaLabel, onClick, children }: TabButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      aria-current={active ? 'page' : undefined}
      className={`relative flex h-[54px] select-none flex-col items-center justify-center gap-1 transition-colors ${
        active ? 'text-sky-300' : 'text-slate-500 active:bg-slate-900/70'
      }`}
    >
      {/* 选中指示：图标上沿一小段主题色横条 */}
      {active && (
        <span className="absolute inset-x-0 top-0 mx-auto h-[2px] w-9 rounded-full bg-sky-400" />
      )}
      <span className="relative flex items-center justify-center">
        {children}
        {dot && (
          <span
            className="pointer-events-none absolute -right-1 -top-0.5 h-2 w-2 rounded-full bg-sky-400 ring-2 ring-slate-950"
            aria-hidden
          />
        )}
      </span>
      <span className={`text-[10px] leading-none ${active ? 'font-semibold' : 'font-medium'}`}>
        {label}
      </span>
    </button>
  );
}

/**
 * 底部一级导航。
 *
 * 两个入口：左侧回到「选图 / BP」主流程，右侧进入「设置」页。
 * 只负责切换一级页面，BP 状态由 App 持有，切走再切回不会丢进度。
 *
 * 底部按 `env(safe-area-inset-bottom)` 留出安全区（全面屏手势条 / 刘海屏）。
 */
export default function BottomNav({ tab, onChange, hasUpdate = false }: BottomNavProps) {
  return (
    <nav
      className="relative z-30 shrink-0 border-t border-slate-800 bg-slate-950/95 backdrop-blur"
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
      aria-label="主导航"
    >
      <div className="grid grid-cols-2">
        <TabButton
          active={tab === 'draft'}
          label="BP 助手"
          ariaLabel="BP 助手（选择地图与 BP 禁选）"
          onClick={() => onChange('draft')}
        >
          <Swords size={19} strokeWidth={tab === 'draft' ? 2.4 : 2} />
        </TabButton>

        <TabButton
          active={tab === 'settings'}
          label="设置"
          dot={hasUpdate}
          ariaLabel={hasUpdate ? '设置（有新版本）' : '设置'}
          onClick={() => onChange('settings')}
        >
          <Settings size={19} strokeWidth={tab === 'settings' ? 2.4 : 2} />
        </TabButton>
      </div>
    </nav>
  );
}
