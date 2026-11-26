import type { ReactNode } from 'react';
import { History, Settings, Swords } from 'lucide-react';
import { useTranslation } from '../i18n';

/** 一级页面：BP 助手（选图 + BP 主流程）/ 战绩 / 设置 */
export type MainTab = 'draft' | 'history' | 'settings';

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
 * 三个入口：BP 主流程 / 战绩 / 设置。只负责切换一级页面，
 * BP 状态与历史对局都由 App 持有，切走再切回不会丢进度。
 *
 * 底部按 `env(safe-area-inset-bottom)` 留出安全区（全面屏手势条 / 刘海屏）。
 */
export default function BottomNav({ tab, onChange, hasUpdate = false }: BottomNavProps) {
  const { t } = useTranslation();
  return (
    <nav
      className="relative z-30 shrink-0 border-t border-slate-800 bg-slate-950/95 backdrop-blur"
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
      aria-label={t('nav.main')}
    >
      <div className="grid grid-cols-3">
        <TabButton
          active={tab === 'draft'}
          label={t('nav.draft')}
          ariaLabel={t('nav.draftAria')}
          onClick={() => onChange('draft')}
        >
          <Swords size={19} strokeWidth={tab === 'draft' ? 2.4 : 2} />
        </TabButton>

        <TabButton
          active={tab === 'history'}
          label={t('nav.history')}
          ariaLabel={t('nav.historyAria')}
          onClick={() => onChange('history')}
        >
          <History size={19} strokeWidth={tab === 'history' ? 2.4 : 2} />
        </TabButton>

        <TabButton
          active={tab === 'settings'}
          label={t('nav.settings')}
          dot={hasUpdate}
          ariaLabel={hasUpdate ? t('nav.settingsAriaNew') : t('nav.settingsAria')}
          onClick={() => onChange('settings')}
        >
          <Settings size={19} strokeWidth={tab === 'settings' ? 2.4 : 2} />
        </TabButton>
      </div>
    </nav>
  );
}
