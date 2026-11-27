import type { ReactNode } from 'react';
import { History, Info, Settings, Swords } from 'lucide-react';
import { useTranslation } from '../i18n';

/** 一级页面：BP 助手（选图 + BP 主流程）/ 战绩 / 设置 / 关于 */
export type MainTab = 'draft' | 'history' | 'settings' | 'about';

/** Tab 顺序即左右滑动切页的顺序，两处必须共用同一份 */
export const MAIN_TABS: readonly MainTab[] = ['draft', 'history', 'settings', 'about'];

interface BottomNavProps {
  tab: MainTab;
  onChange: (tab: MainTab) => void;
  /** 发现新版本：「关于」Tab 图标右上角打一个小圆点（更新入口已经搬到这里） */
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
      className={`relative flex h-16 select-none flex-col items-center justify-center gap-1 transition-colors ${
        active ? 'text-accent' : 'text-subtle active:bg-press/60'
      }`}
    >
      {/* 干净的选中态：只有图标加粗 + 强调色，不再画顶部短横杠 */}
      <span className="relative flex items-center justify-center">
        {children}
        {dot && (
          <span
            className="bg-accent pointer-events-none absolute -right-1 -top-0.5 h-2 w-2 rounded-full ring-2 ring-app"
            aria-hidden
          />
        )}
      </span>
      <span className={`text-[11px] leading-none ${active ? 'font-semibold' : 'font-medium'}`}>
        {label}
      </span>
    </button>
  );
}

/**
 * 底部一级导航（经典贴底实心栏，不是悬浮胶囊）。
 *
 * 四个入口：BP 主流程 / 战绩 / 设置 / 关于。只负责切换一级页面，
 * BP 状态与历史对局都由 App 持有，切走再切回不会丢进度。
 *
 * 64px 栏高 + 22px 图标 + 11px 标签，顶边只有一道 6% 白的低对比线；
 * 底色与分割线都走主题 Token，底部按 `env(safe-area-inset-bottom)` 留安全区。
 */
export default function BottomNav({ tab, onChange, hasUpdate = false }: BottomNavProps) {
  const { t } = useTranslation();
  return (
    <nav
      className="relative z-30 shrink-0 bg-app"
      style={{
        borderTop: '1px solid var(--nav-line)',
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
      }}
      aria-label={t('nav.main')}
    >
      <div className="grid grid-cols-4">
        <TabButton
          active={tab === 'draft'}
          label={t('nav.draft')}
          ariaLabel={t('nav.draftAria')}
          onClick={() => onChange('draft')}
        >
          <Swords size={22} strokeWidth={tab === 'draft' ? 2.6 : 2} />
        </TabButton>

        <TabButton
          active={tab === 'history'}
          label={t('nav.history')}
          ariaLabel={t('nav.historyAria')}
          onClick={() => onChange('history')}
        >
          <History size={22} strokeWidth={tab === 'history' ? 2.6 : 2} />
        </TabButton>

        <TabButton
          active={tab === 'settings'}
          label={t('nav.settings')}
          ariaLabel={t('nav.settingsAria')}
          onClick={() => onChange('settings')}
        >
          <Settings size={22} strokeWidth={tab === 'settings' ? 2.6 : 2} />
        </TabButton>

        <TabButton
          active={tab === 'about'}
          label={t('nav.about')}
          dot={hasUpdate}
          ariaLabel={hasUpdate ? t('nav.aboutAriaNew') : t('nav.aboutAria')}
          onClick={() => onChange('about')}
        >
          <Info size={22} strokeWidth={tab === 'about' ? 2.6 : 2} />
        </TabButton>
      </div>
    </nav>
  );
}
