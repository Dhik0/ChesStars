import { useCallback, useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import {
  ArrowLeft,
  Check,
  ChevronRight,
  ChevronsUpDown,
  Database,
  Download,
  EyeOff,
  Languages,
  Paintbrush,
  Palette,
  RefreshCw,
  RotateCcw,
  SlidersHorizontal,
  Volume2,
} from 'lucide-react';
import { PageVeil } from './PageHeader';
import { LANG_CHOICES, LANG_LABEL, useTranslation, type LangChoice } from '../i18n';
import { pullMessage } from '../i18n/format';
import {
  browserPrefsStorage,
  resetPreferences,
  type DisplayPrefs,
} from '../services/prefsStore';
import type { MetaSnapshot, PullResult } from '../services/metaStore';
import type { ThemeMode } from '../services/themeStore';
import { isSfxMuted, setSfxMuted } from '../services/reviewSfx';
import { useTheme } from '../utils/useTheme';
import { SWIPE_BACK_EASE, SWIPE_BACK_MS, useSwipeBack } from '../utils/useSwipeBack';

/** 「设置」页里三个推入式二级子页 */
export type SettingsPage = 'appearance' | 'draft' | 'data';

interface SettingsViewProps {
  snapshot: MetaSnapshot;
  /** 有子页推入时，底层主界面微微左移 */
  subpageOpen: boolean;
  languageOpen: boolean;
  onLanguageOpenChange: (open: boolean) => void;
  onOpenPage: (page: SettingsPage) => void;
  onOpenThemeColor: () => void;
}

interface SettingsSubpageProps {
  page: SettingsPage;
  onBack: () => void;
  snapshot: MetaSnapshot;
  onPull: () => Promise<PullResult>;
  displayPrefs: DisplayPrefs;
  onDisplayPrefsChange: (prefs: DisplayPrefs) => void;
  blockedCount: number;
  onOpenBlocked: () => void;
  onOpenThemeColor: () => void;
}

const SOURCE_KEY: Record<MetaSnapshot['source'], string> = {
  builtin: 'settings.sourceBuiltin',
  cache: 'settings.sourceCache',
  remote: 'settings.sourceRemote',
};

const SOURCE_STYLE: Record<MetaSnapshot['source'], string> = {
  builtin: 'bg-raised text-body',
  cache: 'bg-accent-soft text-accent',
  remote: 'bg-strong/20 text-strong',
};

/** 三段式切换胶囊：跟随系统 / 浅色 / 深色（与参考的原生设置页同序） */
const THEME_MODES: ReadonlyArray<{ key: ThemeMode; labelKey: string }> = [
  { key: 'system', labelKey: 'settings.themeSystem' },
  { key: 'light', labelKey: 'settings.themeLight' },
  { key: 'dark', labelKey: 'settings.themeDark' },
];

const SUBPAGE_TITLE_KEY: Record<SettingsPage, string> = {
  appearance: 'settings.pageAppearance',
  draft: 'settings.pageDraft',
  data: 'settings.pageData',
};

/* ------------------------------------------------------------------ *
 * 共用小组件
 * ------------------------------------------------------------------ */

/** 卡片内的一行导航 / 开关入口：统一 64px 触控比例 */
function ListRow({
  icon,
  title,
  subtitle,
  onClick,
  trailing,
  rowRef,
}: {
  icon?: ReactNode;
  title: string;
  subtitle?: string;
  onClick?: () => void;
  trailing?: ReactNode;
  rowRef?: RefObject<HTMLButtonElement>;
}) {
  return (
    <button
      type="button"
      ref={rowRef}
      onClick={onClick}
      className="list-row"
    >
      {icon && <span className="list-icon">{icon}</span>}
      <span className="min-w-0 flex-1">
        <span className="list-title truncate">{title}</span>
        {subtitle && <span className="list-subtitle truncate">{subtitle}</span>}
      </span>
      {trailing ?? <ChevronRight size={20} className="shrink-0 text-faint" />}
    </button>
  );
}

/** 内缩胶囊开关：50×28 外轨 + 20px 圆点四周留 4px，比例由 .switch-track 统一定义 */
function Toggle({
  checked,
  label,
  onChange,
}: {
  checked: boolean;
  label: string;
  onChange: (next: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className="switch-track"
    >
      <span className="switch-thumb" />
    </button>
  );
}

function ToggleRow({
  icon,
  title,
  subtitle,
  checked,
  onChange,
}: {
  icon: ReactNode;
  title: string;
  subtitle?: string;
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <div className="list-row">
      <span className="list-icon">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="list-title truncate">{title}</span>
        {subtitle && <span className="list-subtitle">{subtitle}</span>}
      </span>
      <Toggle checked={checked} label={title} onChange={onChange} />
    </div>
  );
}

/** 分组卡片：小标题恒在卡片上方 10px，用 --accent */
function Group({
  label,
  children,
  className = '',
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`mb-7 ${className}`}>
      <h2 className="section-label">{label}</h2>
      <div className="list-card">{children}</div>
    </section>
  );
}

/* ------------------------------------------------------------------ *
 * 锚定悬浮语言选单
 * ------------------------------------------------------------------ */

/** placement 决定卷轴从锚点的哪一侧揭开，由触发行在视口里的剩余空间算出 */
type MenuAnchor = { left: number; top: number; placement: 'up' | 'down' };

function LanguageMenu({
  anchor,
  closing,
  onClose,
}: {
  anchor: MenuAnchor;
  closing: boolean;
  onClose: () => void;
}) {
  const { t, langChoice, setLangChoice } = useTranslation();
  const up = anchor.placement === 'up';
  const panelMotion = up
    ? closing
      ? 'lang-menu-up-out'
      : 'lang-menu-up-in'
    : closing
      ? 'lang-menu-down-out'
      : 'lang-menu-down-in';

  const choose = (choice: LangChoice) => {
    setLangChoice(choice);
    onClose();
  };

  return createPortal(
    <>
      {/* 微暗遮罩：点空白处收起，列表本身不发生任何排版位移 */}
      <div
        className={`scrim fixed inset-0 z-40 ${
          closing ? 'lang-scrim-out pointer-events-none' : 'lang-scrim-in'
        }`}
        onClick={onClose}
        aria-hidden
      />
      {/* 外层只管定位与投影，卷轴裁切放在内层，阴影不会被 clip-path 切掉 */}
      <div
        className={`fixed z-[45] min-w-[230px] w-[248px] max-w-[calc(100vw-24px)] ${
          closing ? 'pointer-events-none' : ''
        }`}
        style={{
          left: anchor.left,
          top: anchor.top,
          filter: 'var(--menu-filter)',
        }}
      >
        <div
          role="menu"
          aria-label={t('settings.language')}
          aria-hidden={closing || undefined}
          className={`${panelMotion} rounded-[20px] border border-line-strong/40 p-1.5`}
          style={{
            transformOrigin: up ? '85% 100%' : '85% 0%',
            backgroundColor: 'var(--menu-bg)',
          }}
        >
          {LANG_CHOICES.map((choice) => {
            const active = choice === langChoice;
            const label = choice === 'system' ? t('settings.languageSystem') : LANG_LABEL[choice];
            return (
              <button
                key={choice}
                type="button"
                role="menuitemradio"
                aria-checked={active}
                onClick={() => choose(choice)}
                className={`flex w-full items-center gap-2 rounded-[14px] px-5 py-3.5 text-left text-[16px] font-medium transition-colors active:bg-white/[0.06] ${
                  active ? 'text-[color:var(--menu-selected-fg)]' : 'text-body'
                }`}
              >
                <span className="min-w-0 flex-1 truncate">{label}</span>
                {active && <Check size={18} strokeWidth={2.6} className="shrink-0" />}
              </button>
            );
          })}
        </div>
      </div>
    </>,
    document.body,
  );
}

/* ------------------------------------------------------------------ *
 * 设置主界面：干净的三组导航列表
 * ------------------------------------------------------------------ */

/**
 * 设置页（一级页面）。
 *
 * 主界面只做导航：外观 / 偏好 / 通用三组，点一行推入二级子页；
 * 语言是入口附近弹出的悬浮选单，不占文档流，切换零排版抖动。
 * 面向普通用户：不展示算法、网络链路与技术参数（见项目长期 UI 文案规范）。
 */
export default function SettingsView({
  snapshot,
  subpageOpen,
  languageOpen,
  onLanguageOpenChange,
  onOpenPage,
}: SettingsViewProps) {
  const { t, lang } = useTranslation();
  const { mode, darkPalette, monetEnabled } = useTheme();
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const langRowRef = useRef<HTMLButtonElement | null>(null);
  const [anchor, setAnchor] = useState<MenuAnchor | null>(null);
  /** 关闭时先留一帧播放反向卷轴，约 180ms 后再真正卸载 */
  const [menuMounted, setMenuMounted] = useState(false);
  const [closing, setClosing] = useState(false);
  const closeTimer = useRef<number | null>(null);

  /** 外观行的动态副标题：纯黑 OLED · 色彩微染关 */
  const appearanceSummary = (() => {
    const base =
      mode === 'light'
        ? t('settings.themeLight')
        : darkPalette === 'oled'
          ? t('settings.paletteOled')
          : t('settings.paletteNavy');
    const tint = monetEnabled ? t('settings.monetOnLabel') : t('settings.monetOffLabel');
    return `${base} · ${tint}`;
  })();

  /** 数据行的副标题：只回答「数据是哪天的」 */
  const dataSummary = `${t('settings.dataDate')} ${snapshot.dataDate ?? t('settings.unknown')}`;

  const openLanguage = () => {
    const row = langRowRef.current;
    const width = 248;
    const height = 208;
    const gap = 8;
    const rect = row?.getBoundingClientRect();
    if (!rect) {
      setAnchor({ left: 20, top: 120, placement: 'down' });
      onLanguageOpenChange(true);
      return;
    }
    const left = Math.max(12, Math.min(rect.right - width, window.innerWidth - width - 12));
    const spaceBelow = window.innerHeight - rect.bottom;
    // 下方放不下且上方更宽裕时向上弹，否则向下弹
    const placement: MenuAnchor['placement'] =
      spaceBelow < height + gap && rect.top > spaceBelow ? 'up' : 'down';
    const top =
      placement === 'up'
        ? Math.max(12, rect.top - height - gap)
        : Math.max(12, Math.min(rect.bottom + gap, window.innerHeight - height - 12));
    setAnchor({ left, top, placement });
    onLanguageOpenChange(true);
  };

  /** 选单内部触发的关闭：先切退场态，再让外层状态翻转 */
  const requestClose = () => {
    setClosing(true);
    onLanguageOpenChange(false);
  };

  /**
   * languageOpen 由外层持有（Esc / 返回键也会直接改它），
   * 所以这里按 prop 滞后 180ms 卸载，保证所有关闭路径都能播完反向卷轴。
   */
  useEffect(() => {
    if (languageOpen) {
      if (closeTimer.current !== null) {
        window.clearTimeout(closeTimer.current);
        closeTimer.current = null;
      }
      setClosing(false);
      setMenuMounted(true);
      return;
    }
    if (!menuMounted) return;
    setClosing(true);
    closeTimer.current = window.setTimeout(() => {
      setMenuMounted(false);
      setClosing(false);
      setAnchor(null);
      closeTimer.current = null;
    }, 180);
  }, [languageOpen, menuMounted]);

  useEffect(
    () => () => {
      if (closeTimer.current !== null) window.clearTimeout(closeTimer.current);
    },
    [],
  );

  /** 列表滚动 / 窗口变化时收起选单，避免悬浮层停在错误的锚点 */
  useEffect(() => {
    if (!languageOpen) return;
    const close = () => onLanguageOpenChange(false);
    const scroller = scrollRef.current;
    window.addEventListener('resize', close);
    scroller?.addEventListener('scroll', close, { passive: true });
    return () => {
      window.removeEventListener('resize', close);
      scroller?.removeEventListener('scroll', close);
    };
  }, [languageOpen, onLanguageOpenChange]);

  return (
    <div
      className={`settings-page relative flex h-full min-h-0 flex-col bg-app ${
        subpageOpen ? 'settings-underlay' : ''
      }`}
    >
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-8">
        <header className="page-head settings-page-head">
          <h1 className="page-title font-medium">{t('settings.title')}</h1>
        </header>

        <Group label={t('settings.sectionAppearance')}>
          <ListRow
            icon={<Palette size={22} />}
            title={t('settings.navAppearance')}
            subtitle={appearanceSummary}
            onClick={() => onOpenPage('appearance')}
          />
        </Group>

        <Group label={t('settings.sectionPreference')}>
          <ListRow
            icon={<SlidersHorizontal size={22} />}
            title={t('settings.navDraft')}
            subtitle={t('settings.navDraftHint')}
            onClick={() => onOpenPage('draft')}
          />
        </Group>

        <Group label={t('settings.sectionGeneral')}>
          <ListRow
            rowRef={langRowRef}
            icon={<Languages size={22} />}
            title={t('settings.language')}
            subtitle={t('settings.languageHint')}
            onClick={openLanguage}
            trailing={
              <span className="list-trailing">
                {LANG_LABEL[lang]}
                <ChevronsUpDown size={16} className="text-accent" />
              </span>
            }
          />
          <ListRow
            icon={<Database size={22} />}
            title={t('settings.navData')}
            subtitle={dataSummary}
            onClick={() => onOpenPage('data')}
          />
        </Group>
      </div>

      <PageVeil />
      {menuMounted && anchor && (
        <LanguageMenu anchor={anchor} closing={closing} onClose={requestClose} />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * 二级子页
 * ------------------------------------------------------------------ */

/** 格式化元数据更新时间（按当前语言） */
function formatTime(iso: string, lang: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(lang, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

/** 主题子页：三段独立模式按钮 + Monet 开关卡 + 主题色调色盘入口 */
function AppearancePage({ onOpenThemeColor }: Pick<SettingsSubpageProps, 'onOpenThemeColor'>) {
  const { t } = useTranslation();
  const { mode, monetEnabled, customAccent, setMode, setMonetEnabled } = useTheme();

  return (
    <div className="space-y-5">
      {/* 三段模式：独立等宽按钮，上方不再放分组小标题 */}
      <div
        className="grid grid-cols-3 gap-2.5"
        role="radiogroup"
        aria-label={t('settings.themeMode')}
      >
        {THEME_MODES.map(({ key, labelKey }) => {
          const active = mode === key;
          return (
            <button
              key={key}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => setMode(key)}
              className="theme-mode-btn h-12 min-w-0 rounded-[15px] px-1 text-[15px] font-medium"
            >
              <span className="block truncate">{t(labelKey)}</span>
            </button>
          );
        })}
      </div>

      {/* 卡片一：Monet 开关 + 主题色入口 */}
      <div className="theme-card card py-2">
        <ToggleRow
          icon={<Paintbrush size={22} />}
          title={t('settings.monetTitle')}
          subtitle={t('settings.monetDesc')}
          checked={monetEnabled}
          onChange={setMonetEnabled}
        />
        {/* 随 Monet 开关手风琴展开：关闭时整行完全收起，不占位也不响应点击 */}
        <div className="theme-color-reveal" data-open={monetEnabled}>
          <div>
            <ListRow
              icon={<Palette size={22} />}
              title={t('settings.themeColorTitle')}
              subtitle={t('settings.themeColorDesc')}
              onClick={onOpenThemeColor}
              trailing={
                <span className="list-trailing">
                  <span
                    className="theme-swatch h-5 w-5 rounded-full border border-line-strong"
                    style={{
                      backgroundColor: `rgb(${customAccent.r} ${customAccent.g} ${customAccent.b} / ${customAccent.a})`,
                    }}
                  />
                  <ChevronRight size={18} className="text-faint" />
                </span>
              }
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function DraftPage({
  displayPrefs,
  onDisplayPrefsChange,
  blockedCount,
  onOpenBlocked,
}: Pick<SettingsSubpageProps, 'displayPrefs' | 'onDisplayPrefsChange' | 'blockedCount' | 'onOpenBlocked'>) {
  const { t } = useTranslation();
  const [sfxOn, setSfxOn] = useState(() => !isSfxMuted());

  const toggleSfx = (next: boolean) => {
    setSfxOn(next);
    setSfxMuted(!next);
  };

  return (
    <>
      <Group label={t('settings.draftSectionBlocked')} className="mt-2">
        <ListRow
          icon={<EyeOff size={22} />}
          title={t('settings.draftBlocked')}
          subtitle={t('settings.draftBlockedHint')}
          onClick={onOpenBlocked}
          trailing={
            <span className="list-trailing">
              {t('settings.draftBlockedCount', { n: blockedCount })}
              <ChevronRight size={18} className="text-faint" />
            </span>
          }
        />
        <ToggleRow
          icon={<EyeOff size={22} />}
          title={t('settings.draftHideBlocked')}
          subtitle={t('settings.draftHideBlockedHint')}
          checked={displayPrefs.hideBlocked}
          onChange={(hideBlocked) => onDisplayPrefsChange({ ...displayPrefs, hideBlocked })}
        />
      </Group>

      <Group label={t('settings.draftSectionReview')}>
        <ToggleRow
          icon={<Volume2 size={22} />}
          title={t('settings.draftSfx')}
          subtitle={t('settings.draftSfxHint')}
          checked={sfxOn}
          onChange={toggleSfx}
        />
        <ToggleRow
          icon={<SlidersHorizontal size={22} />}
          title={t('settings.draftAdvanced')}
          subtitle={t('settings.draftAdvancedHint')}
          checked={displayPrefs.advancedTools}
          onChange={(advancedTools) => onDisplayPrefsChange({ ...displayPrefs, advancedTools })}
        />
      </Group>
    </>
  );
}

function DataPage({ snapshot, onPull }: Pick<SettingsSubpageProps, 'snapshot' | 'onPull'>) {
  const { t, lang, num, tier } = useTranslation();
  const [pulling, setPulling] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);

  const tierText = (() => {
    const min = snapshot.meta.min_tier;
    const hit = snapshot.meta.tier_audit?.distribution.find((d) => d.tier === min);
    return hit?.label ? `${tier(hit.label)}+` : String(min);
  })();

  const handlePull = async () => {
    setPulling(true);
    setMessage(null);
    const res = await onPull();
    setMessage({ ok: res.ok, text: pullMessage(res, t, num) });
    setPulling(false);
  };

  const handleReset = () => {
    resetPreferences(browserPrefsStorage());
    setConfirmReset(false);
    setMessage({ ok: true, text: t('settings.resetDone') });
    // 偏好分别住在主题单例、i18n 上下文与组件 state 里，刷新是最稳的一条同步路径
    window.setTimeout(() => window.location.reload(), 700);
  };

  return (
    <>
      <h2 className="section-label mt-2">{t('settings.sectionData')}</h2>
      <div className="card px-5 py-4">
        <div className="mb-3 flex items-center gap-2">
          <span className={`rounded-full px-2.5 py-1 text-[12px] font-semibold ${SOURCE_STYLE[snapshot.source]}`}>
            {t(SOURCE_KEY[snapshot.source])}
          </span>
          <span className="text-[12px] text-muted">
            {t('settings.updatedAt', { time: formatTime(snapshot.updatedAt, lang) })}
          </span>
        </div>
        <div className="grid grid-cols-2 gap-x-3 gap-y-2.5 text-[13px]">
          <span className="text-muted">
            {t('settings.dataDate')}{' '}
            <span className="tabular-nums text-body">{snapshot.dataDate ?? t('settings.unknown')}</span>
          </span>
          <span className="text-muted">
            {t('settings.totalBattles')}{' '}
            <span className="tabular-nums text-body">{num(snapshot.totalBattles)}</span>
          </span>
          <span className="text-muted">
            {t('settings.minTier')} <span className="text-body">{tierText}</span>
          </span>
          <span className="text-muted">
            {t('settings.maps')}{' '}
            <span className="tabular-nums text-body">{snapshot.meta.maps.length}</span>
          </span>
          <span className="text-muted">
            {t('settings.brawlers')}{' '}
            <span className="tabular-nums text-body">{snapshot.meta.brawlers.length}</span>
          </span>
        </div>
      </div>

      <button
        type="button"
        onClick={() => void handlePull()}
        disabled={pulling}
        className="bg-accent text-accent-on mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-[18px] text-[15px] font-semibold transition-opacity active:opacity-80 disabled:opacity-60"
      >
        {pulling ? <RefreshCw size={17} className="animate-spin" /> : <Download size={17} />}
        {pulling ? t('settings.pulling') : t('settings.pull')}
      </button>

      {message && (
        <p
          className={`mt-3 rounded-[16px] px-3.5 py-2.5 text-[13px] leading-snug ${
            message.ok ? 'bg-strong/10 text-strong' : 'bg-red-500/10 text-danger'
          }`}
        >
          {message.text}
        </p>
      )}

      <h2 className="section-label mt-8">{t('settings.resetSection')}</h2>
      <div className="list-card">
        <ListRow
          icon={<RotateCcw size={22} />}
          title={t('settings.reset')}
          subtitle={t('settings.resetHint')}
          onClick={() => setConfirmReset(true)}
          trailing={<ChevronRight size={20} className="shrink-0 text-faint" />}
        />
        {confirmReset && (
          <div className="flex items-center gap-2 px-5 py-4">
            <span className="min-w-0 flex-1 text-[13px] leading-snug text-body">
              {t('settings.resetConfirmHint')}
            </span>
            <button
              type="button"
              onClick={() => setConfirmReset(false)}
              className="h-10 shrink-0 rounded-[14px] bg-raised px-3 text-[13px] font-medium text-body active:bg-press"
            >
              {t('settings.resetCancel')}
            </button>
            <button
              type="button"
              onClick={handleReset}
              className="bg-accent text-accent-on h-10 shrink-0 rounded-[14px] px-3 text-[13px] font-semibold active:opacity-80"
            >
              {t('settings.resetConfirm')}
            </button>
          </div>
        )}
      </div>
    </>
  );
}

/**
 * 推入式二级子页：整屏从右侧滑入，底层设置页左移压暗。
 * 返回箭头 / 跟手右滑都用同一条 260ms 曲线；松手越过 30% 屏宽即弹出返回。
 */
export function SettingsSubpage({
  page,
  onBack,
  snapshot,
  onPull,
  displayPrefs,
  onDisplayPrefsChange,
  blockedCount,
  onOpenBlocked,
  onOpenThemeColor,
}: SettingsSubpageProps) {
  const { t } = useTranslation();
  const pageRef = useRef<HTMLDivElement | null>(null);
  const scrimRef = useRef<HTMLDivElement | null>(null);
  const closeTimer = useRef<number | null>(null);
  const finished = useRef(false);

  const commitClose = useCallback(() => {
    if (finished.current) return;
    finished.current = true;
    onBack();
  }, [onBack]);

  useEffect(
    () => () => {
      if (closeTimer.current !== null) window.clearTimeout(closeTimer.current);
    },
    [],
  );

  /** 返回箭头：整块滑出右侧后再让 App 卸载子页 */
  const requestClose = () => {
    const pageEl = pageRef.current;
    const scrim = scrimRef.current;
    const easing = `transform ${SWIPE_BACK_MS}ms ${SWIPE_BACK_EASE}`;
    if (pageEl) {
      pageEl.style.animation = 'none';
      pageEl.style.transition = easing;
      pageEl.style.transform = 'translate3d(100%, 0, 0)';
    }
    if (scrim) {
      scrim.style.transition = `opacity ${SWIPE_BACK_MS}ms ${SWIPE_BACK_EASE}`;
      scrim.style.opacity = '0';
    }
    closeTimer.current = window.setTimeout(commitClose, SWIPE_BACK_MS);
  };

  const swipeHandlers = useSwipeBack({
    enabled: true,
    pageRef,
    scrimRef,
    onBack: commitClose,
  });

  return (
    <div className="absolute inset-0 z-40">
      <div
        ref={scrimRef}
        className="absolute inset-0 bg-black/45"
        style={{ opacity: 1 }}
        onClick={requestClose}
        aria-hidden
      />
      <div
        ref={pageRef}
        className="absolute inset-0 flex flex-col bg-app animate-subpage-in"
        style={{ touchAction: 'pan-y' }}
        {...swipeHandlers}
      >
        <header className="subpage-head">
          <button
            type="button"
            onClick={requestClose}
            className="subpage-back"
            aria-label={t('picker.back')}
          >
            <ArrowLeft size={22} strokeWidth={2.2} />
          </button>
          <h1 className="subpage-title">{t(SUBPAGE_TITLE_KEY[page])}</h1>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-8">
          {page === 'appearance' && (
            <AppearancePage onOpenThemeColor={onOpenThemeColor} />
          )}
          {page === 'draft' && (
            <DraftPage
              displayPrefs={displayPrefs}
              onDisplayPrefsChange={onDisplayPrefsChange}
              blockedCount={blockedCount}
              onOpenBlocked={onOpenBlocked}
            />
          )}
          {page === 'data' && <DataPage snapshot={snapshot} onPull={onPull} />}
        </div>
        <PageVeil />
      </div>
    </div>
  );
}
