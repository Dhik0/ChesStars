import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from 'react';
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
  Moon,
  MoonStar,
  Paintbrush,
  Palette,
  RefreshCw,
  RotateCcw,
  Search,
  SlidersHorizontal,
  Sun,
  SunMoon,
  Trash2,
  Volume2,
  type LucideIcon,
} from 'lucide-react';
import { PageVeil } from './PageHeader';
import Avatar from './Avatar';
import { LANG_CHOICES, LANG_LABEL, useTranslation, type LangChoice } from '../i18n';
import { pullMessage } from '../i18n/format';
import { brawlerSearchNames } from '../i18n/gameData';
import { CLASS_COLOR, CLASS_ORDER, type BrawlerClass } from '../data/brawlerProfile';
import { RARITY_META, RARITY_ORDER, rarityOf, type RarityKey } from '../data/rarity';
import { getClass } from '../data/metaIndex';
import { matchScore } from '../data/localization';
import { raritySectionStyle, themeAccent } from '../utils/display';
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

/** 「设置」页里四个推入式二级子页 */
export type SettingsPage = 'appearance' | 'draft' | 'data' | 'blocked';

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
  blockedIds: number[];
  onApplyBlockedIds: (ids: number[]) => void;
  onOpenPage: (page: SettingsPage) => void;
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

/** 四档主题：自动（跟随系统）/ 浅色 / Tonal 深色 / OLED 纯黑 */
const THEME_MODES: ReadonlyArray<{ key: ThemeMode; labelKey: string; icon: LucideIcon }> = [
  { key: 'system', labelKey: 'settings.themeAuto', icon: SunMoon },
  { key: 'light', labelKey: 'settings.themeLight', icon: Sun },
  { key: 'dark', labelKey: 'settings.themeDark', icon: Moon },
  { key: 'oled', labelKey: 'settings.themeBlack', icon: MoonStar },
];

const SUBPAGE_TITLE_KEY: Record<SettingsPage, string> = {
  appearance: 'settings.pageAppearance',
  draft: 'settings.pageDraft',
  data: 'settings.pageData',
  blocked: 'settings.draftBlocked',
};

/* ------------------------------------------------------------------ *
 * 共用小组件
 * ------------------------------------------------------------------ */

/**
 * 列表行标尺（DESIGN.md 第 3 节）：min-h 64px、16/14 内距、
 * 22px 左侧图标、17px 主字 / 13px 副字。行本身不画分割线，靠卡片缝隙分隔。
 */
const ROW_BASE = 'flex w-full min-h-[64px] items-center gap-3.5 px-4 py-3.5 text-left';

/** 分段卡片里的一行导航入口：每行独立成卡（.m3-item） */
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
    <button type="button" ref={rowRef} onClick={onClick} className={`m3-item ${ROW_BASE}`}>
      {icon && <span className="list-icon">{icon}</span>}
      <span className="min-w-0 flex-1">
        <span className="list-title truncate">{title}</span>
        {subtitle && <span className="list-subtitle truncate">{subtitle}</span>}
      </span>
      {trailing ?? <ChevronRight size={20} className="shrink-0 text-faint" />}
    </button>
  );
}

/** 全局 M3 开关：52×32 轨 + 24px 圆点，关态内嵌 ×、开态内嵌 ✓，图标切换由 CSS 负责 */
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
      className="m3-switch"
    >
      <span className="m3-switch-thumb">
        <svg
          className="m3-switch-icon m3-switch-icon-off"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2.8}
          strokeLinecap="round"
          aria-hidden
        >
          <path d="M7.5 7.5 16.5 16.5M16.5 7.5 7.5 16.5" />
        </svg>
        <svg
          className="m3-switch-icon m3-switch-icon-on"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2.8}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <path d="m5 12.5 4.5 4.5L19 7.5" />
        </svg>
      </span>
    </button>
  );
}

/**
 * 开关行：整行不可点（避免误触），只有右侧开关响应。
 * children 用于把随开关展开的区域贴在同一个卡片内部下沿（主题色入口），
 * 这样卡片收起时外端圆角仍是 20px，不会被 0fr 容器顶成尖角。
 */
function ToggleRow({
  icon,
  title,
  checked,
  onChange,
  children,
}: {
  icon: ReactNode;
  title: string;
  checked: boolean;
  onChange: (next: boolean) => void;
  children?: ReactNode;
}) {
  return (
    <div className="m3-item">
      <div className={ROW_BASE}>
        <span className="list-icon">{icon}</span>
        <span className="min-w-0 flex-1">
          <span className="list-title truncate">{title}</span>
        </span>
        <Toggle checked={checked} label={title} onChange={onChange} />
      </div>
      {children}
    </div>
  );
}

/** 分段组合卡片组：小标题恒在组上方 10px，组内每行独立成卡 */
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
      <div className="m3-group">{children}</div>
    </section>
  );
}

/**
 * 职业筛选胶囊：与 BP 选人池同款（同 CLASS_ORDER / CLASS_COLOR、同横向滚动与选中态）。
 * 窄屏只横滑不换行，避免把下面的稀有度分区顶出可视区。
 */
function ClassChip({
  label,
  active,
  color,
  accent = false,
  onClick,
}: {
  label: string;
  active: boolean;
  color: string;
  /** 「全部」这类不属于具体职业的标签，选中态直接走 --accent */
  accent?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`flex h-[var(--chip-h)] shrink-0 items-center whitespace-nowrap rounded-full border px-2 text-[10.5px] font-medium transition-colors ${
        active
          ? ''
          : 'border-line-strong/80 bg-surface/70 text-muted active:bg-press'
      }`}
      style={
        active
          ? accent
            ? {
                backgroundColor: 'rgb(var(--accent-rgb) / 0.14)',
                borderColor: 'var(--accent)',
                color: 'var(--accent)',
              }
            : { backgroundColor: `${color}2E`, borderColor: `${color}99`, color }
          : undefined
      }
    >
      {label}
    </button>
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
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const langRowRef = useRef<HTMLButtonElement | null>(null);
  const [anchor, setAnchor] = useState<MenuAnchor | null>(null);
  /** 关闭时先留一帧播放反向卷轴，约 180ms 后再真正卸载 */
  const [menuMounted, setMenuMounted] = useState(false);
  const [closing, setClosing] = useState(false);
  const closeTimer = useRef<number | null>(null);

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
            onClick={() => onOpenPage('appearance')}
          />
        </Group>

        <Group label={t('settings.sectionPreference')}>
          <ListRow
            icon={<SlidersHorizontal size={22} />}
            title={t('settings.navDraft')}
            onClick={() => onOpenPage('draft')}
          />
        </Group>

        <Group label={t('settings.sectionGeneral')}>
          <ListRow
            rowRef={langRowRef}
            icon={<Languages size={22} />}
            title={t('settings.language')}
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

/**
 * 主题子页：四段连接按钮 + Monet 开关卡。
 * 主题色入口作为展开区贴在 Monet 那张卡片内部下沿——不用独立子节点，
 * 关/开两种状态下卡片外端圆角都严格保持 20px。
 */
function AppearancePage({ onOpenThemeColor }: Pick<SettingsSubpageProps, 'onOpenThemeColor'>) {
  const { t } = useTranslation();
  const { mode, monetEnabled, customAccent, setMode, setMonetEnabled } = useTheme();

  return (
    <div className="space-y-5">
      {/* 四档模式：连接分段按钮，组内 3px 缝，选中项收成全圆角药丸 */}
      <div
        className="m3-segment-group"
        role="radiogroup"
        aria-label={t('settings.themeMode')}
      >
        {THEME_MODES.map(({ key, labelKey, icon: Icon }) => {
          const active = mode === key;
          return (
            <button
              key={key}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => setMode(key)}
              className="m3-segment"
            >
              <Icon size={19} strokeWidth={2} aria-hidden />
              <span className="block">{t(labelKey)}</span>
            </button>
          );
        })}
      </div>

      {/* 分段卡片：Monet 开关 + 主题色入口（展开区在卡片内部） */}
      <div className="m3-group">
        <ToggleRow
          icon={<Paintbrush size={22} />}
          title={t('settings.monetTitle')}
          checked={monetEnabled}
          onChange={setMonetEnabled}
        >
          {/* 随 Monet 开关手风琴展开：关闭时整行完全收起，不占位也不响应点击 */}
          <div className="theme-color-reveal" data-open={monetEnabled}>
            <div>
              <button
                type="button"
                onClick={onOpenThemeColor}
                className={`m3-item ${ROW_BASE}`}
              >
                <span className="list-icon">
                  <Palette size={22} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="list-title truncate">{t('settings.themeColorTitle')}</span>
                </span>
                <span className="list-trailing">
                  <span
                    className="theme-swatch h-5 w-5 rounded-full border border-line-strong"
                    style={{
                      backgroundColor: `rgb(${customAccent.r} ${customAccent.g} ${customAccent.b} / ${customAccent.a})`,
                    }}
                  />
                  <ChevronRight size={18} className="text-faint" />
                </span>
              </button>
            </div>
          </div>
        </ToggleRow>
      </div>
    </div>
  );
}

function DraftPage({
  displayPrefs,
  onDisplayPrefsChange,
  blockedCount,
  onOpenPage,
}: Pick<SettingsSubpageProps, 'displayPrefs' | 'onDisplayPrefsChange' | 'blockedCount'> & {
  onOpenPage: (page: SettingsPage) => void;
}) {
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
          onClick={() => onOpenPage('blocked')}
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
          checked={displayPrefs.hideBlocked}
          onChange={(hideBlocked) => onDisplayPrefsChange({ ...displayPrefs, hideBlocked })}
        />
      </Group>

      <Group label={t('settings.draftSectionReview')}>
        <ToggleRow
          icon={<Volume2 size={22} />}
          title={t('settings.draftSfx')}
          checked={sfxOn}
          onChange={toggleSfx}
        />
      </Group>
    </>
  );
}

/**
 * 批量屏蔽：沿用 BP 选人池的职业筛选胶囊与稀有度分区卡片。
 * 搜索 / 职业 / 稀有度三者联动过滤，空分组自动隐藏；点一下即切换并落盘。
 */
function BlockedPage({
  snapshot,
  blockedIds,
  onApplyBlockedIds,
}: Pick<SettingsSubpageProps, 'snapshot' | 'blockedIds' | 'onApplyBlockedIds'>) {
  const { t, brawler } = useTranslation();
  const { resolved: theme } = useTheme();
  const [query, setQuery] = useState('');
  const [classFilter, setClassFilter] = useState<BrawlerClass | 'ALL'>('ALL');
  const blocked = useMemo(() => new Set(blockedIds), [blockedIds]);

  const allBrawlers = useMemo(
    () => [...snapshot.index.brawlerById.values()].sort((a, b) => a.id - b.id),
    [snapshot],
  );
  const filtered = useMemo(() => {
    const q = query.trim();
    return allBrawlers.filter((b) => {
      if (classFilter !== 'ALL' && getClass(snapshot.index, b.id) !== classFilter) return false;
      if (!q) return true;
      return matchScore(q, b.name, brawler(b.name), brawlerSearchNames(b.name)) > 0;
    });
  }, [allBrawlers, brawler, classFilter, query, snapshot.index]);

  /** 与 BP 池同一套稀有度顺序与配色；common 并入 rare，空组不渲染 */
  const sections = useMemo(() => {
    const buckets = new Map<RarityKey, typeof filtered>();
    for (const b of filtered) {
      const raw = rarityOf(b.id);
      const key: RarityKey = raw === 'common' ? 'rare' : raw;
      const arr = buckets.get(key);
      if (arr) arr.push(b);
      else buckets.set(key, [b]);
    }
    const out: { key: RarityKey; color: string; items: typeof filtered }[] = [];
    for (const key of RARITY_ORDER) {
      if (key === 'common') continue;
      const items = buckets.get(key);
      if (!items?.length) continue;
      out.push({ key, color: RARITY_META[key].color, items });
    }
    return out;
  }, [filtered]);

  const toggle = (id: number) => {
    onApplyBlockedIds(
      blocked.has(id) ? blockedIds.filter((x) => x !== id) : [...blockedIds, id],
    );
  };

  return (
    <div className="space-y-3">
      <div className="m3-group">
        <div className="m3-item flex min-h-[64px] items-center gap-3 px-4 py-3.5">
          <span className="min-w-0 flex-1 text-[15px] font-medium text-body">
            {t('settings.blockedSelected', { n: blockedIds.length })}
          </span>
          <button
            type="button"
            disabled={blockedIds.length === 0}
            onClick={() => onApplyBlockedIds([])}
            className="flex h-10 shrink-0 items-center gap-1.5 rounded-[14px] bg-raised px-3 text-[13px] font-medium text-body active:bg-press disabled:opacity-40"
          >
            <Trash2 size={15} />
            {t('settings.blockedClearAll')}
          </button>
        </div>
      </div>

      <label className="flex h-12 items-center gap-2 rounded-[18px] bg-raised px-4">
        <Search size={18} className="shrink-0 text-muted" />
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t('settings.blockedSearch')}
          aria-label={t('settings.blockedSearch')}
          className="h-full min-w-0 flex-1 bg-transparent text-[16px] text-body outline-none placeholder:text-subtle"
        />
      </label>

      {/* 职业筛选：与 BP 池同色同序，只横滑不换行 */}
      <div
        className="no-scrollbar -mx-1 flex items-center gap-1 overflow-x-auto overscroll-x-contain px-1"
        role="group"
        aria-label={t('pool.classFilter')}
      >
        <ClassChip
          label={t('pool.classAll')}
          active={classFilter === 'ALL'}
          color={themeAccent('#38BDF8', theme)}
          accent
          onClick={() => setClassFilter('ALL')}
        />
        {CLASS_ORDER.map((k) => (
          <ClassChip
            key={k}
            label={t(`class.${k}`)}
            active={classFilter === k}
            color={themeAccent(CLASS_COLOR[k], theme)}
            onClick={() => setClassFilter(classFilter === k ? 'ALL' : k)}
          />
        ))}
      </div>

      {sections.length === 0 ? (
        <p className="py-10 text-center text-[13px] text-subtle">
          {t('settings.blockedNoResult')}
        </p>
      ) : (
        sections.map((sec) => (
          <section
            key={sec.key}
            className="rounded-[18px] border px-1.5 pb-1.5 pt-1"
            style={raritySectionStyle(sec.color, theme)}
          >
            <header className="mb-1 flex items-baseline justify-between gap-2">
              <span className="flex items-center gap-1">
                <span
                  className="h-1.5 w-1.5 shrink-0 rounded-full"
                  style={{ backgroundColor: themeAccent(sec.color, theme) }}
                />
                <h3
                  className="text-[11px] font-medium tracking-wide"
                  style={{ color: themeAccent(sec.color, theme) }}
                >
                  {t(`rarity.section.${sec.key}`)}
                </h3>
                <span className="text-[9px] tabular-nums text-subtle">{sec.items.length}</span>
              </span>
            </header>
            <div className="grid grid-cols-5 gap-x-1.5 gap-y-2">
              {sec.items.map((b) => {
                const selected = blocked.has(b.id);
                return (
                  <button
                    key={b.id}
                    type="button"
                    aria-pressed={selected}
                    aria-label={brawler(b.name)}
                    onClick={() => toggle(b.id)}
                    className={`relative flex min-h-[48px] flex-col items-center justify-center gap-0.5 rounded-[12px] border px-0.5 py-1 transition-colors active:bg-press ${
                      selected ? 'border-accent bg-accent-soft' : 'border-transparent'
                    }`}
                  >
                    <Avatar
                      id={b.id}
                      name={b.name}
                      size={44}
                      className={selected ? 'opacity-65' : undefined}
                    />
                    <span className="block w-full truncate text-center text-[9px] leading-tight text-body">
                      {brawler(b.name)}
                    </span>
                    {selected && (
                      <span className="absolute right-0 top-0 flex h-4 w-4 items-center justify-center rounded-full bg-accent text-accent-on">
                        <Check size={11} strokeWidth={3} />
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </section>
        ))
      )}
    </div>
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
      <div className="m3-group">
        <div className="m3-item px-4 py-3.5">
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
      </div>

      <button
        type="button"
        onClick={() => void handlePull()}
        disabled={pulling}
        className="bg-accent text-accent-on mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-[20px] text-[15px] font-medium transition-opacity active:opacity-80 disabled:opacity-60"
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
      <div className="m3-group">
        <ListRow
          icon={<RotateCcw size={22} />}
          title={t('settings.reset')}
          onClick={() => setConfirmReset(true)}
          trailing={<ChevronRight size={20} className="shrink-0 text-faint" />}
        />
        {confirmReset && (
          <div className="m3-item flex min-h-[64px] items-center gap-2 px-4 py-3.5">
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
              className="bg-accent text-accent-on h-10 shrink-0 rounded-[14px] px-3 text-[13px] font-medium active:opacity-80"
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
export const SettingsSubpage = forwardRef<{ requestClose: () => void }, SettingsSubpageProps>(
  function SettingsSubpage(
    {
      page,
      onBack,
      snapshot,
      onPull,
      displayPrefs,
      onDisplayPrefsChange,
      blockedCount,
      blockedIds,
      onApplyBlockedIds,
      onOpenPage,
      onOpenThemeColor,
    },
    ref,
  ) {
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

    /** 返回箭头 / 返回键 / Escape：整块滑出右侧后再让 App 卸载子页 */
    const requestClose = () => {
      if (finished.current) return;
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

    /** App 的返回键 / Escape 走同一条路径，避免绕过退场直接卸载 */
    const closeRef = useRef(requestClose);
    closeRef.current = requestClose;
    useImperativeHandle(ref, () => ({ requestClose: () => closeRef.current() }), []);

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
                onOpenPage={onOpenPage}
              />
            )}
            {page === 'blocked' && (
              <BlockedPage
                snapshot={snapshot}
                blockedIds={blockedIds}
                onApplyBlockedIds={onApplyBlockedIds}
              />
            )}
            {page === 'data' && <DataPage snapshot={snapshot} onPull={onPull} />}
          </div>
          <PageVeil />
        </div>
      </div>
    );
  },
);
