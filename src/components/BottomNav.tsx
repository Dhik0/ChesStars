import type { ReactNode } from 'react';
import { History, House, Info, Settings } from 'lucide-react';
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
      className="m3-nav-tab select-none"
    >
      <span className="m3-nav-icon-wrap h-8 w-16 shrink-0">
        <span className="m3-nav-pill h-8 w-16 rounded-full" data-active={active} aria-hidden />
        <span className="m3-nav-icon">{children}</span>
        {dot && <span className="m3-nav-dot" aria-hidden />}
      </span>
      <span className="m3-nav-label">{label}</span>
    </button>
  );
}

/**
 * 底部一级导航（M3 Navigation Bar，贴底 Tonal 分层，不画顶线）。
 *
 * 四个入口：BP 主流程 / 战绩 / 设置 / 关于。只负责切换一级页面，
 * BP 状态与历史对局都由 App 持有，切走再切回不会丢进度。
 *
 * 68px 栏高 + 底部安全区；选中项图标外包 64×32 药丸，图标与标签走
 * secondary-container 角色，切换时药丸横向展开淡入。
 */
export default function BottomNav({ tab, onChange, hasUpdate = false }: BottomNavProps) {
  const { t } = useTranslation();
  return (
    <nav className="m3-nav" aria-label={t('nav.main')}>
      <div className="m3-nav-grid">
        <TabButton
          active={tab === 'draft'}
          label={t('nav.draft')}
          ariaLabel={t('nav.draftAria')}
          onClick={() => onChange('draft')}
        >
          <House size={22} strokeWidth={tab === 'draft' ? 2.6 : 2} />
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
