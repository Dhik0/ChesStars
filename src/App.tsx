import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { App as NativeApp } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { Ban as EmptyBanIcon, ClipboardCheck, Flame, Loader2, RefreshCw, Save, Swords } from 'lucide-react';
import AboutView, { AboutSubpage } from './components/AboutView';
import BottomNav, { MAIN_TABS, type MainTab } from './components/BottomNav';
import BrawlerDetail from './components/BrawlerDetail';
import BrawlerTile from './components/BrawlerTile';
import DraftBar from './components/DraftBar';
import HistoryView from './components/HistoryView';
import MapPicker from './components/MapPicker';
import MatchReviewSheet from './components/MatchReviewSheet';
import MatchSaveSheet, { type MatchSaveSheetHandle } from './components/MatchSaveSheet';
import MatchupSheet from './components/MatchupSheet';
import SettingsView, { SettingsSubpage, type SettingsPage } from './components/SettingsView';
import ThemeColorSheet from './components/ThemeColorSheet';
import TopBar from './components/TopBar';
import UpdateBanner from './components/UpdateBanner';
import UpdateDialog from './components/UpdateDialog';
import { APP_VERSION } from './config/app';
import { IS_NATIVE_APP, IS_WEB } from './config/platform';
import { CLASS_COLOR, CLASS_ORDER, type BrawlerClass } from './data/brawlerProfile';
import { useTranslation } from './i18n';
import { loadErrorMessage } from './i18n/format';
import { metaStore, type MetaSnapshot } from './services/metaStore';
import {
  browserPrefsStorage,
  readDisplayPrefs,
  writeBlockedIds,
  writeDisplayPrefs,
  type DisplayPrefs,
} from './services/prefsStore';
import {
  buildMatchFromDraft,
  draftSignature,
  useMatchHistory,
  type MatchRecord,
} from './services/matchHistoryStore';
import { applyWebUpdate, isSwUpdateReady, onSwUpdateReady } from './services/swUpdate';
import {
  checkForUpdate,
  ignoreVersion,
  isVersionIgnored,
  type UpdateInfo,
} from './services/updateChecker';
import { checkWebUpdate, type UpdateCheckOutcome } from './services/webUpdate';
import {
  EMPTY_BAN,
  applyPick,
  bannedIds,
  clearSlot,
  createDraft,
  evaluateBrawler,
  nextSlot,
  recommend,
  resetDraft,
  TEAM_SLOTS,
  type ActiveSlot,
  type Candidate,
  type DraftState,
  type Side,
} from './utils/draftEngine';
import { raritySectionStyle, recommendHeadOf, themeAccent } from './utils/display';
import { backGuardCount, runTopBackGuard } from './utils/backGuards';
import { decideBack, type BackLayer, type BackState } from './utils/backNavigation';
import { useBlockedBrawlers } from './utils/blockedBrawlers';
import { openExternal } from './utils/openExternal';
import { TOP_PICK_COUNT, buildBrawlerPool, rankMap } from './utils/pool';
import { useSwipePager, type SwipeDirection } from './utils/swipeNav';
import { useTheme } from './utils/useTheme';
import { useViewport } from './utils/useViewport';

const LS_MAP = 'brawl.draft.map';

/** 网页端版本检测的启动延迟：避开首屏数据加载，2.5 秒后静默执行 */
const WEB_UPDATE_DELAY_MS = 2500;

/** BP 选人页退出到地图选择的退场时长（与 index.css 的 m3-view-out 一致） */
const BP_SCREEN_EXIT_MS = 180;

/** 「BP 助手」Tab 内的二级页面：首屏是「选择地图」，选完才进 BP 面板 */
type Screen = 'select' | 'draft';

/**
 * 职业筛选标签。
 *
 * 窄屏（手机竖屏）下这排标签只横向滚动、绝不换行——一旦换行会把下面的
 * 稀有度分区整体顶下去，英雄池在矮视口里就只剩一条缝。
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

export default function App() {
  const { t, brawler, tier } = useTranslation();
  /** 生效主题：稀有度色块在浅色主题下要按深一档的色相渲染 */
  const { resolved: theme, customAccent, setCustomAccent } = useTheme();
  const [snap, setSnap] = useState<MetaSnapshot | null>(metaStore.getSnapshot());
  /** 首屏加载失败的原因对象（含「超时 / 断网 / 状态码」分类），null = 正常 */
  const [error, setError] = useState<unknown>(null);

  const [draft, setDraft] = useState<DraftState | null>(null);
  /** 一级页面（底部导航）：BP 助手 / 战绩 / 设置 / 关于 */
  const [tab, setTab] = useState<MainTab>('draft');
  /** 上一次切页的方向：只用来给新页面挑一个入场动效（点导航进来时为空 = 淡入） */
  const [swipeDir, setSwipeDir] = useState<SwipeDirection | null>(null);
  /** BP 助手内的二级页面：启动时停在选图页，选定地图后才进 BP */
  const [screen, setScreen] = useState<Screen>('select');
  /** 选图 ↔ BP 的过渡阶段：进场 / 退场都留在 DOM 里播完再换内容 */
  const [screenPhase, setScreenPhase] = useState<'idle' | 'entering' | 'leaving'>('idle');
  const screenRef = useRef<Screen>(screen);
  screenRef.current = screen;
  const screenTimerRef = useRef<number | null>(null);
  /** 设置二级子页的退场入口（返回键 / Escape 也要先播动画再卸载） */
  const settingsSubpageRef = useRef<{ requestClose: () => void } | null>(null);
  /** 「设置」页推入的二级子页（null = 停在设置主界面） */
  const [settingsPage, setSettingsPage] = useState<SettingsPage | null>(null);
  /** 「关于」页推入的二级子页（null = 停在关于主界面） */
  const [aboutPage, setAboutPage] = useState<'credits' | null>(null);
  /** 关于二级子页的退场入口（返回键 / Escape 也要先播动画再卸载） */
  const aboutSubpageRef = useRef<{ requestClose: () => void } | null>(null);
  /** 锚定在「语言」行附近的悬浮选单 */
  const [languageOpen, setLanguageOpen] = useState(false);
  /** 主题色调色盘（设置 → 主题子页 → 主题色） */
  const [themeColorOpen, setThemeColorOpen] = useState(false);
  /** BP 与复盘的展示偏好：只影响入口与推荐栏展示，不碰算分 */
  const [displayPrefs, setDisplayPrefs] = useState<DisplayPrefs>(() =>
    readDisplayPrefs(browserPrefsStorage()),
  );
  /** 撤回栈（最多保留 30 步）。重做已按需求彻底移除 */
  const [history, setHistory] = useState<DraftState[]>([]);
  const [detailId, setDetailId] = useState<number | null>(null);
  /** 长按弹窗：当前查看详细对位的英雄 */
  const [matchupId, setMatchupId] = useState<number | null>(null);
  /** 英雄池的职业筛选（'ALL' = 不筛选）；只影响列表展示，不参与任何算分 */
  const [classFilter, setClassFilter] = useState<BrawlerClass | 'ALL'>('ALL');
  /** 个人「不喜欢 / 屏蔽」名单：只影响选人推荐栏的展示，Ban 推荐与全英雄池照旧 */
  const { ids: blockedIds, blocked: blockedSet, toggle: toggleBlocked } = useBlockedBrawlers();
  /** 屏蔽名单的最新值：批量设置时按它和传入值的差集同步内存状态 */
  const blockedIdsRef = useRef(blockedIds);
  blockedIdsRef.current = blockedIds;
  /** 发现的新版本（null = 没有更新或检查失败） */
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  /** 更新弹窗开关（启动自动检查命中且未被忽略时打开） */
  const [updateOpen, setUpdateOpen] = useState(false);
  /** 远程清单里的 QQ 群链接（与是否有新版本无关）；null = 用打包内置的那份 */
  const [qqGroupUrl, setQqGroupUrl] = useState<string | null>(null);
  /** 网页端：线上 version.json 的版本比当前构建更新时记下版本号（null = 没有更新） */
  const [webVersion, setWebVersion] = useState<string | null>(null);
  /** 网页端：Service Worker 已装好新构建，等用户点「立即更新」 */
  const [swReady, setSwReady] = useState(false);

  /** 底部轻提示（目前只有「再滑一次退出应用」用它），非阻塞、自动消失 */
  const [toast, setToast] = useState<string | null>(null);
  const toastTimerRef = useRef<number | null>(null);

  /* ---------------- 历史对局 ---------------- */

  const {
    records: matches,
    add: addMatchRecord,
    update: updateMatchRecord,
    remove: removeMatchRecord,
  } = useMatchHistory();

  /**
   * 已保存的那一局：`signature` 是保存时的 BP 指纹。
   * 换图 / 改英雄后指纹对不上，按钮自动回到「保存到历史对局」——
   * 这样同一次 BP 不会被重复保存成两条，而新的一局也不会被旧状态卡住。
   */
  const [savedMatch, setSavedMatch] = useState<{ signature: string; id: string } | null>(null);
  /** 保存 / 编辑抽屉（新建时记录来自当前 BP，编辑时来自库里那条） */
  const [matchSheet, setMatchSheet] = useState<{ record: MatchRecord; isNew: boolean } | null>(null);
  /** 抽屉的「存后关」入口：安卓返回键要复用组件内的脏检查，不能直接 setMatchSheet(null) */
  const matchSheetRef = useRef<MatchSaveSheetHandle | null>(null);
  /** 正在复盘的对局 ID（null = 未打开）；记录被删 / 改回待补录时自动失效 */
  const [reviewId, setReviewId] = useState<string | null>(null);

  /** 当前复盘的那条记录；记录被删或改回待补录时视作未打开 */
  const reviewRecord = reviewId === null ? null : matches.find((m) => m.id === reviewId) ?? null;
  const reviewOpen = reviewRecord !== null && reviewRecord.result !== 'pending';

  /* ---------------- 侧滑返回 / 系统返回键 ---------------- */

  /** 上一次「退出提示」的时间戳：双击退出的计时窗口，放 ref 里避免闭包读到旧值 */
  const lastBackAtRef = useRef<number | null>(null);
  /** 返回处理器读取的界面快照，每次渲染同步一次 */
  const backStateRef = useRef<Omit<BackState, 'hasGuard'>>({
    layers: [],
    tab: 'draft',
    screen: 'select',
    hasDraft: false,
    settingsPageOpen: false,
  });

  /**
   * 已打开的模态层，按叠放顺序排列（末尾 = 最顶层）。
   * 更新弹窗 z-60 盖在详情 / 对位抽屉 z-50 之上，所以排在最后。
   */
  const layers: BackLayer[] = [];
  if (reviewOpen) layers.push('review');
  if (matchSheet) layers.push('matchSheet');
  if (matchupId !== null) layers.push('matchup');
  if (detailId !== null) layers.push('detail');
  if (updateOpen && updateInfo !== null) layers.push('update');
  // 语言悬浮选单永远是最顶层：返回键 / Escape 先收它
  if (themeColorOpen) layers.push('themeColor');
  if (languageOpen) layers.push('languageMenu');
  backStateRef.current = {
    layers,
    tab,
    screen,
    hasDraft: draft !== null,
    // 「设置」与「关于」的推入式子页共用这一层优先级（返回栈是冻结文件，不新增层）
    settingsPageOpen: settingsPage !== null || aboutPage !== null,
  };

  /** 弹一条 2 秒后自动消失的底部提示（不拦截点击） */
  const showToast = useCallback((text: string) => {
    if (toastTimerRef.current !== null) window.clearTimeout(toastTimerRef.current);
    setToast(text);
    toastTimerRef.current = window.setTimeout(() => {
      toastTimerRef.current = null;
      setToast(null);
    }, 2000);
  }, []);

  /**
   * 一级页面切换的唯一入口。
   * `direction` 非空表示这次是滑动切页，新页面按方向从对侧推进来；
   * 点底部导航传空，走普通的淡入。
   */
  const goTab = useCallback((next: MainTab, direction: SwipeDirection | null = null) => {
    setSwipeDir(direction);
    setTab(next);
  }, []);

  /**
   * 进 BP：新视图直接挂载并播 280ms 进场动画。
   * 若上一次退场定时器还没走完，先取消——连续点选图 / 返回不会留下半个动画。
   */
  const enterDraft = useCallback(() => {
    if (screenTimerRef.current !== null) {
      window.clearTimeout(screenTimerRef.current);
      screenTimerRef.current = null;
    }
    setScreen('draft');
    screenRef.current = 'draft';
    setScreenPhase('entering');
  }, []);

  /**
   * 退到选图：先让 BP 视图播完退场，再切换内容并给选图页播进场。
   * 定时器本身兼作幂等锁，返回键连按不会连跳两层。
   */
  const leaveDraft = useCallback(() => {
    if (screenRef.current !== 'draft' || screenTimerRef.current !== null) return;
    setScreenPhase('leaving');
    screenTimerRef.current = window.setTimeout(() => {
      screenTimerRef.current = null;
      setScreen('select');
      screenRef.current = 'select';
      setScreenPhase('entering');
    }, BP_SCREEN_EXIT_MS);
  }, []);

  useEffect(
    () => () => {
      if (screenTimerRef.current !== null) window.clearTimeout(screenTimerRef.current);
    },
    [],
  );

  /** 偏好改动：先落盘，再同步给 BP 页；写入失败也不影响本次会话 */
  const handleDisplayPrefsChange = useCallback((next: DisplayPrefs) => {
    writeDisplayPrefs(browserPrefsStorage(), next);
    setDisplayPrefs(next);
  }, []);

  /**
   * 设置页批量勾选屏蔽名单：先整份落盘，再把内存状态对齐到同一份名单。
   * toggle 是函数式更新，同一批次里多次调用也不会互相覆盖。
   */
  const applyBlockedIds = useCallback(
    (next: number[]) => {
      writeBlockedIds(browserPrefsStorage(), next);
      const current = blockedIdsRef.current;
      const target = new Set(next);
      for (const id of current) if (!target.has(id)) toggleBlocked(id);
      for (const id of next) if (!current.includes(id)) toggleBlocked(id);
    },
    [toggleBlocked],
  );

  /* ---------------- 左右滑动切页 ----------------
   * 只有四个一级页面之间可以滑，而且必须让路给下面这些场景：
   *   1. BP 详细选人界面（已选定地图、进入 Ban/Pick 操作态）——选人时手指划过英雄池
   *      太常见了，这里滑一下就翻页会直接毁掉一局 BP；地图选择首页不受影响；
   *   2. 任意弹窗 / 抽屉打开时（复盘、保存、对位、英雄详情、更新说明）；
   *   3. 手指落在屏幕左右 28px 内（安卓全面屏侧滑返回的手势区）；
   *   4. 落在可横向滚动的子容器里（职业筛选标签栏、横向卡片列表）；
   *   5. 竖向位移占优或横向不足 56px（在滚列表 / 只是点了一下）。
   * 前两条在这里判定，后三条由 useSwipePager / decideSwipe 负责。
   */
  const overlayOpen = layers.length > 0;
  const draftLocked = tab === 'draft' && screen === 'draft' && draft !== null;
  const swipeHandlers = useSwipePager({
    enabled: !overlayOpen && !draftLocked && settingsPage === null && aboutPage === null,
    onSwipe: (direction) => {
      const next = MAIN_TABS[MAIN_TABS.indexOf(tab) + (direction === 'next' ? 1 : -1)];
      // 已经在最左 / 最右：不动，页面自己回弹
      if (next) goTab(next, direction);
    },
  });

  /**
   * 返回键总入口：只做决策结果对应的一步，绝不在一次返回里连关两层。
   * 依赖只有稳定的 setter 与 ref，因此注册一次即可，不会因状态变化重新绑定。
   */
  const handleBack = useCallback(() => {
    const decision = decideBack(
      { ...backStateRef.current, hasGuard: backGuardCount() > 0 },
      lastBackAtRef.current,
      Date.now(),
    );
    lastBackAtRef.current = decision.lastBackAt;

    switch (decision.action.type) {
      case 'closeLayer':
        if (decision.action.layer === 'update') setUpdateOpen(false);
        else if (decision.action.layer === 'detail') setDetailId(null);
        else if (decision.action.layer === 'matchSheet') {
          // 与点 × 完全同一条路径：脏数据先落库再关
          if (matchSheetRef.current) matchSheetRef.current.requestClose();
          else setMatchSheet(null);
        } else if (decision.action.layer === 'review') setReviewId(null);
        else if (decision.action.layer === 'languageMenu') setLanguageOpen(false);
        else if (decision.action.layer === 'themeColor') setThemeColorOpen(false);
        else setMatchupId(null);
        break;
      case 'closeSettingsPage':
        // 按当前 Tab 分派：设置页与关于页各自回退自己的子页
        if (backStateRef.current.tab === 'about') {
          if (aboutSubpageRef.current) aboutSubpageRef.current.requestClose();
          else setAboutPage(null);
        } else if (settingsSubpageRef.current) settingsSubpageRef.current.requestClose();
        else setSettingsPage(null);
        break;
      case 'runGuard':
        runTopBackGuard();
        break;
      case 'goMainTab':
        goTab('draft');
        break;
      case 'leaveDraft':
        leaveDraft();
        break;
      case 'showExitHint':
        showToast(t('app.exitHint'));
        break;
      case 'exitApp':
        void NativeApp.exitApp();
        break;
    }
  }, [goTab, leaveDraft, showToast, t]);

  /** 仅在原生壳里接管返回键；桌面浏览器 npm run dev 不注册任何监听 */
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    let disposed = false;
    let listener: { remove: () => Promise<void> } | null = null;
    void NativeApp.addListener('backButton', () => handleBack()).then((h) => {
      if (disposed) void h.remove();
      else listener = h;
    });
    return () => {
      disposed = true;
      if (listener) void listener.remove();
    };
  }, [handleBack]);

  /**
   * Escape 与安卓返回键同一套优先级：先收语言选单，再关设置二级子页。
   * 其它模态层（保存抽屉等）有自己的键盘处理，这里不抢。
   */
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      const state = backStateRef.current;
      const top = state.layers.length > 0 ? state.layers[state.layers.length - 1] : null;
      if (top === 'languageMenu') {
        setLanguageOpen(false);
        event.preventDefault();
        return;
      }
      if (top === 'themeColor') {
        setThemeColorOpen(false);
        event.preventDefault();
        return;
      }
      if (top !== null) return;
      if (state.settingsPageOpen) {
        if (state.tab === 'about') {
          if (aboutSubpageRef.current) aboutSubpageRef.current.requestClose();
          else setAboutPage(null);
        } else if (settingsSubpageRef.current) settingsSubpageRef.current.requestClose();
        else setSettingsPage(null);
        event.preventDefault();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  /** 卸载时清掉未到期的提示定时器 */
  useEffect(
    () => () => {
      if (toastTimerRef.current !== null) window.clearTimeout(toastTimerRef.current);
    },
    [],
  );

  /** 横屏（左右双栏）/ 矮视口（竖屏悬浮小窗） */
  const vp = useViewport();
  const landscape = vp.landscape;

  /** 英雄池滚动容器 + 高优先推荐区（矮视口进 BP 时自动跳到这里） */
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const topSectionRef = useRef<HTMLElement | null>(null);
  const [skipToPool, setSkipToPool] = useState(false);

  /* ---------------- 数据加载 ---------------- */

  useEffect(() => {
    let alive = true;
    const unsub = metaStore.subscribe((s) => {
      if (alive) setSnap(s);
    });
    metaStore
      .init()
      .then((s) => {
        if (alive) {
          setSnap(s);
          setError(null);
        }
      })
      .catch((e: unknown) => {
        if (alive) setError(e);
      });
    return () => {
      alive = false;
      unsub();
    };
  }, []);

  /* ---------------- 新版本检测（静默、非阻塞、仅原生壳） ----------------
   * 启动时后台问一次版本清单：超时 / 限流 / 断网全部静默忽略，
   * 只有真的拿到更高版本才记下来。用户点过「忽略此版本」的不再自动弹窗，
   * 但底部「设置」Tab 上的小圆点照旧保留（用户想装时还能找到入口）。
   *
   * 顺带把清单里的 QQ 群链接记下来：它和「有没有新版本」无关，
   * 远程改了之后，老版本 App 也能立刻换到新群链接。
   */
  useEffect(() => {
    // 纯 Web / PWA 没有安装包可升级：完全跳过 GitHub Release 检查
    if (!IS_NATIVE_APP) return;
    let alive = true;
    void checkForUpdate().then((res) => {
      if (!alive) return;
      if (res.info?.qqGroupUrl) setQqGroupUrl(res.info.qqGroupUrl);
      if (res.status !== 'update' || !res.info) return;
      setUpdateInfo(res.info);
      if (!isVersionIgnored(res.info.version)) setUpdateOpen(true);
    });
    return () => {
      alive = false;
    };
  }, []);

  /* ---------------- 网页端新版本检测（静默、延迟、不阻塞首屏） ----------------
   * 网页没有安装包可下载，问的是同目录的 version.json（构建时由 vite.config.ts 生成）：
   * 线上版本比当前这份 JS 的构建版本高，就说明部署了新版，提示刷新即可。
   * 延迟 2.5 秒再发，避免和首屏数据加载抢带宽；断网 / 404 一律静默忽略。
   */
  useEffect(() => {
    if (!IS_WEB) return;
    let alive = true;
    const timer = window.setTimeout(() => {
      void checkWebUpdate().then((res) => {
        if (!alive) return;
        if (res.status === 'update' && res.version && !isVersionIgnored(res.version)) {
          setWebVersion(res.version);
        }
      });
    }, WEB_UPDATE_DELAY_MS);
    return () => {
      alive = false;
      window.clearTimeout(timer);
    };
  }, []);

  /* Service Worker 装好新构建时同样只提示、不强制刷新：
   * BP 进行中被刷新会丢掉整局进度，什么时候刷新交给用户。 */
  useEffect(() => {
    if (!IS_WEB) return;
    if (isSwUpdateReady()) {
      setSwReady(true);
      return;
    }
    return onSwUpdateReady(() => setSwReady(true));
  }, []);

  /* ---------------- 矮视口进 BP：平滑跳过顶部地图卡 ----------------
   * 等 DraftBar 从「蓝先/红先」变成完整 BP 台、布局稳定后再滚，
   * 双 rAF 保证读到的 offset 是新布局的。
   */
  useEffect(() => {
    if (!skipToPool) return;
    let raf2 = 0;
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => {
        const sc = scrollRef.current;
        const el = topSectionRef.current;
        if (sc && el) {
          const top =
            el.getBoundingClientRect().top - sc.getBoundingClientRect().top + sc.scrollTop - 6;
          sc.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
        }
        setSkipToPool(false);
      });
    });
    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
    };
  }, [skipToPool]);

  /* ---------------- 推荐计算 ---------------- */

  const candidates = useMemo<Candidate[]>(() => {
    if (!snap || !draft) return [];
    return recommend(snap.index, draft, 200, { t, brawler });
  }, [snap, draft, t, brawler]);

  /**
   * 英雄池 = 稀有度分区（全英雄池）。
   *
   * 职业筛选在**建池之前**过滤候选，所以「高优先推荐」是这个职业内部的前 12 名，
   * 而不是把全局前 12 名再筛一遍（那样筛完常常只剩一两个，看着像漏数据）。
   * 角标名次仍然取全局 `ranks`，切到某个职业也能看出它在总榜的位置。
   *
   * 顶部推荐区不在这里取：它还要按个人屏蔽名单过滤 + 顺位补齐，
   * 所以渲染时另算 `topPicks`，这里只用 `sections`。
   */
  const pool = useMemo(() => {
    const list =
      classFilter === 'ALL' ? candidates : candidates.filter((c) => c.cls === classFilter);
    return buildBrawlerPool(list);
  }, [candidates, classFilter]);
  /** 推荐分排名表：卡片角标用全局名次，稀有度分区里也能看出它在总榜的位置 */
  const ranks = useMemo(() => rankMap(candidates), [candidates]);

  /**
   * 当前 BP 的指纹 + 「这一局已经存过了吗」。
   * 记录被删掉时 savedRecord 变 null，按钮自动退回「保存到历史对局」。
   */
  const draftSig = draft ? draftSignature(draft) : '';
  const savedRecord =
    savedMatch && savedMatch.signature === draftSig
      ? matches.find((m) => m.id === savedMatch.id) ?? null
      : null;

  const detailCandidate = useMemo<Candidate | null>(() => {
    if (!snap || !draft || detailId === null) return null;
    return (
      candidates.find((c) => c.id === detailId) ??
      evaluateBrawler(snap.index, draft, detailId, { t, brawler })
    );
  }, [snap, draft, detailId, candidates, t, brawler]);

  /** 槽位只需要英文原名，译名由各组件按当前语言解析 */
  const getBrawler = (id: number): { name: string } | undefined => {
    const ref = snap?.index.brawlerById.get(id);
    return ref ? { name: ref.name } : undefined;
  };

  /* ---------------- 交互 ---------------- */

  /**
   * 所有会改变 BP 结果的操作都走这里，以便支持撤回。
   * 只切换激活槽位（handleActivate）不入栈——那不算一次操作。
   */
  const applyState = (next: DraftState) => {
    if (!draft) return;
    setHistory((h) => [...h.slice(-29), draft]);
    setDraft(next);
  };

  const handleUndo = () => {
    if (!draft || history.length === 0) return;
    const prev = history[history.length - 1]!;
    setHistory((h) => h.slice(0, -1));
    setDraft(prev);
  };

  const handleSelectMap = (mapName: string, mode: string) => {
    localStorage.setItem(LS_MAP, mapName);
    // 从 BP 顶栏进来又选了同一张图：只回到 BP，不打断当前进度
    if (draft && draft.mapName === mapName) {
      enterDraft();
      return;
    }
    // 换图等于开新局：历史清空，先手方回到「未选择」前置态
    setHistory([]);
    setDraft(createDraft(mapName, mode));
    enterDraft();
  };

  const handleActivate = (slot: ActiveSlot) => {
    if (!draft) return;
    setDraft({ ...draft, active: slot });
  };

  const handleClear = (slot: ActiveSlot) => {
    if (!draft) return;
    applyState(clearSlot(draft, slot));
  };

  /** 重置整局：清空 Ban 与双方选人，回到第一手（保留地图与先手方） */
  const handleReset = () => {
    if (!draft) return;
    applyState(resetDraft(draft));
  };

  /**
   * 选择 / 切换先手方。
   * 前置态（firstPick 为 null）第一次选边不入历史——那时还没有可撤回的操作；
   * BP 中途从 Ban 行右侧切边则算一次操作，可撤回。
   */
  const handleChooseFirst = (side: Side) => {
    if (!draft) return;
    if (draft.firstPick === null) {
      setDraft({ ...draft, firstPick: side });
      // 竖屏矮视口：底部 BP 台会顶上来，顺手把地图卡滚走，直接把推荐顶到最上面
      if (!landscape && vp.short) setSkipToPool(true);
      return;
    }
    if (draft.firstPick === side) return;
    const updated: DraftState = { ...draft, firstPick: side };
    applyState({ ...updated, active: nextSlot(updated) ?? updated.active });
  };

  const handlePick = (id: number) => {
    if (!draft) return;
    // 未选先手方时禁止录入（长按看对位不受影响）
    if (!draft.firstPick) return;
    applyState(applyPick(draft, id));
  };

  /**
   * 空 Ban：占满当前 Ban 槽但不锁任何英雄（对面这手没 Ban 到人 / 盲 Ban 撞车时用）。
   * 走同一条 applyState 通道，所以撤回、清空重选都天然可用。
   */
  const handleEmptyBan = () => {
    if (!draft || !draft.firstPick) return;
    applyState(applyPick(draft, EMPTY_BAN));
  };

  /* ---------------- 历史对局：保存 / 编辑 / 复盘 ---------------- */

  /** 打开保存 / 编辑抽屉 */
  const openMatchSheet = (record: MatchRecord, isNew: boolean) => {
    setMatchSheet({ record, isNew });
  };

  /**
   * 打开保存抽屉。
   * 已保存过的这一局直接进编辑态（改比分 / 补战绩），否则从当前 BP 生成新记录。
   */
  const handleOpenSaveSheet = () => {
    if (!draft) return;
    if (savedRecord) {
      openMatchSheet(savedRecord, false);
      return;
    }
    openMatchSheet(buildMatchFromDraft(draft), true);
  };

  /** 落库：新建走 add，编辑只覆盖比分与战绩，不动阵容快照 */
  const persistMatch = (record: MatchRecord) => {
    if (matchSheet?.isNew) {
      addMatchRecord(record);
      setSavedMatch({ signature: draftSig, id: record.id });
      return;
    }
    updateMatchRecord(record.id, {
      result: record.result,
      score: record.score,
      allyStats: record.allyStats,
      enemyStats: record.enemyStats,
    });
  };

  /**
   * 关闭抽屉：× / 遮罩 / Esc / 安卓返回都走这里。
   * `record` 非空就先落库再关（不弹复盘）；为空表示新建局什么都没填，直接关。
   */
  const handleCloseMatchSheet = (record: MatchRecord | null) => {
    if (record) persistMatch(record);
    setMatchSheet(null);
  };

  /** 「保存并复盘」：一步存完直接进评级 */
  const handleSaveAndReview = (record: MatchRecord) => {
    persistMatch(record);
    setMatchSheet(null);
    // 没选比分就没有可复盘的内容：存完直接关，并说明为什么没进复盘
    if (record.result === 'pending') {
      showToast(t('review.pendingHint'));
      return;
    }
    setReviewId(record.id);
  };

  /** 战绩卡片上的「复盘」：待补录先补比分，不硬算一个假评级 */
  const handleOpenReview = (record: MatchRecord) => {
    if (record.result === 'pending') {
      openMatchSheet(record, false);
      showToast(t('review.pendingHint'));
      return;
    }
    setReviewId(record.id);
  };

  /** 删除对局：若删的正是当前 BP 存的那条 / 正在复盘的那条，顺手清掉对应状态 */
  const handleDeleteMatch = (id: string) => {
    removeMatchRecord(id);
    if (savedMatch?.id === id) setSavedMatch(null);
    if (reviewId === id) setReviewId(null);
  };

  /* ---------------- 版本更新 ---------------- */

  /**
   * 手动检查：原生壳问 GitHub 清单（APK 下载引导），网页端问线上 version.json。
   * 两边都收敛成同一种结果，设置页不需要分叉。
   */
  const handleCheckUpdate = async (): Promise<UpdateCheckOutcome> => {
    if (IS_WEB) {
      const res = await checkWebUpdate();
      if (res.status === 'update' && res.version && !isVersionIgnored(res.version)) {
        setWebVersion(res.version);
      }
      return res;
    }

    const res = await checkForUpdate();
    if (res.info?.qqGroupUrl) setQqGroupUrl(res.info.qqGroupUrl);
    if (res.status === 'update' && res.info) setUpdateInfo(res.info);
    else if (res.status === 'latest') setUpdateInfo(null);
    return {
      status: res.status,
      current: res.current,
      version: res.info?.version,
      reason: res.reason,
    };
  };

  const handleDownloadUpdate = () => {
    if (updateInfo) openExternal(updateInfo.htmlUrl);
  };

  const handleIgnoreUpdate = () => {
    if (updateInfo) ignoreVersion(updateInfo.version);
    setUpdateOpen(false);
  };

  /**
   * 导入备份成功后重新载入应用。
   *
   * 备份覆盖的是「战绩 + 主题 + 微染 + 语言」四份存储，它们分别住在
   * useMatchHistory 的组件状态、themeStore 单例和 i18n 上下文里；
   * 逐处热同步比重启一遍更容易漏（还有 data-* 属性、状态栏底色这些副作用）。
   * 数据已经落盘，刷新不会丢任何东西，所以这里用最稳的那条路。
   */
  const handleImportedBackup = useCallback(() => {
    window.setTimeout(() => window.location.reload(), 900);
  }, []);

  /**
   * 更新弹窗是**全局浮层**：它挂在最外层壳上，选图页 / BP 页 / 设置页
   * 三个层级都能看到，启动检测到新版本时不管停在哪一屏都不会漏。
   * 仅原生壳渲染：Web / PWA 不引导下载安卓安装包。
   */
  const updateOverlay =
    IS_NATIVE_APP && updateOpen && updateInfo ? (
      <UpdateDialog
        info={updateInfo}
        current={APP_VERSION}
        onClose={() => setUpdateOpen(false)}
        onIgnore={handleIgnoreUpdate}
        onDownload={handleDownloadUpdate}
      />
    ) : null;

  /**
   * 网页端新版本提示条（仅 Web）。
   *
   * 两个来源合一：线上 version.json 版本更高，或 Service Worker 已装好新构建。
   * 关掉不影响使用，只是本次会话不再提示；带版本号时顺手记进「忽略此版本」，
   * 免得每次打开都弹同一条。
   */
  const webUpdateBanner =
    IS_WEB && (webVersion !== null || swReady) ? (
      <UpdateBanner
        version={webVersion}
        onUpdate={() => void applyWebUpdate()}
        onDismiss={() => {
          if (webVersion) ignoreVersion(webVersion);
          setWebVersion(null);
          setSwReady(false);
        }}
      />
    ) : null;

  /* ---------------- 渲染：加载 / 错误 ---------------- */

  if (error) {
    // 失败原因单独一行小字：超时 / 断网 / 状态码 / 文件损坏，方便用户描述问题
    const failureReason = loadErrorMessage(error, t);
    return (
      <div className="app-frame flex h-dvh w-full justify-center">
        <div className="flex h-dvh w-full max-w-[440px] flex-col items-center justify-center gap-3 bg-app px-6 text-center">
          <p className="text-[13px] font-semibold text-danger">{t('app.loadError')}</p>
          <p className="text-[11px] leading-relaxed text-subtle">{t('app.loadErrorHint')}</p>
          {failureReason && (
            <p className="text-[10.5px] leading-tight text-faint">
              {t('app.loadErrorReason', { reason: failureReason })}
            </p>
          )}
          <button
            type="button"
            onClick={() => {
              setError(null);
              void metaStore
                .init()
                .then(setSnap)
                .catch(setError);
            }}
            className="flex h-9 items-center gap-1.5 rounded-lg bg-raised px-3 text-[12px] text-body active:bg-press"
          >
            <RefreshCw size={13} />
            {t('app.retry')}
          </button>
        </div>
      </div>
    );
  }

  if (!snap) {
    return (
      <div className="app-frame flex h-dvh w-full justify-center">
        <div className="flex h-dvh w-full max-w-[440px] flex-col items-center justify-center gap-2 bg-app">
          <Loader2 size={20} className="animate-spin text-accent" />
          <p className="text-[11px] text-subtle">{t('app.loading')}</p>
        </div>
      </div>
    );
  }

  /* ---------------- 全局浮层 ---------------- */

  const overlays = (
    <>
      {updateOverlay}

      {reviewOpen && reviewRecord && (
        <MatchReviewSheet
          idx={snap.index}
          record={reviewRecord}
          getBrawler={getBrawler}
          onEdit={() => {
            // 先关复盘再开抽屉：改完保存会自动回到复盘并重新算分
            setReviewId(null);
            openMatchSheet(reviewRecord, false);
          }}
          onClose={() => setReviewId(null)}
        />
      )}

      {matchSheet && (
        <MatchSaveSheet
          ref={matchSheetRef}
          record={matchSheet.record}
          isNew={matchSheet.isNew}
          getBrawler={getBrawler}
          onSaveAndReview={handleSaveAndReview}
          onClose={handleCloseMatchSheet}
        />
      )}

      {themeColorOpen && (
        <ThemeColorSheet
          current={customAccent}
          onSave={(accent) => {
            setCustomAccent(accent);
            setThemeColorOpen(false);
          }}
          onClose={() => setThemeColorOpen(false)}
        />
      )}

      {detailCandidate && (
        <BrawlerDetail
          candidate={detailCandidate}
          blocked={blockedSet.has(detailCandidate.id)}
          onToggleBlock={() => toggleBlocked(detailCandidate.id)}
          onClose={() => setDetailId(null)}
        />
      )}

      {matchupId !== null && draft && (
        <MatchupSheet
          idx={snap.index}
          mapName={draft.mapName}
          mode={draft.mode}
          brawlerId={matchupId}
          onClose={() => setMatchupId(null)}
          onOpenBreakdown={() => {
            setDetailId(matchupId);
            setMatchupId(null);
          }}
        />
      )}
    </>
  );

  /* ---------------- 外壳：内容区 + 底部一级导航 ---------------- */

  /**
   * 页面入场动效：滑动切页时新页面从对侧推进来，点导航进来则淡入。
   * `key={tab}` 让切页时整块重新挂载——动效只播一次，也顺手把上一页的滚动位置清零。
   */
  const pageAnim =
    swipeDir === 'next'
      ? 'animate-page-in-next'
      : swipeDir === 'prev'
        ? 'animate-page-in-prev'
        : 'animate-fade-in';

  /** BP 助手内的选图 / 对局互切动效，挂在各自视图根节点上，不与一级切页争用 transform */
  const screenAnim =
    screenPhase === 'leaving'
      ? 'animate-bp-view-out'
      : screenPhase === 'entering'
        ? 'animate-bp-view-in'
        : '';

  /**
   * 最外层壳：外层是主题暗色背景，内层是限宽的「手机面板」。
   *
   * 手机 / 安卓 WebView 上宽度本来就小于 440px，内外两层重合，视觉与以前一致；
   * PC 浏览器打开时自动居中成紧凑的移动端面板，不会被横向拉伸变形。
   *
   * `navVisible` 由各页面决定：
   *   - 选图页 / 战绩页 / 设置页 / 关于页：常驻（都是底部导航的入口，必须可达）；
   *   - BP 页：竖向空间充足时（非矮视口竖屏）常驻，否则让位给英雄网格与 BP 台
   *     ——此时回设置要走顶部地图卡回到选图页，BP 进度不会因此丢失。
   */
  const shell = (content: ReactNode, navVisible: boolean, subpage?: ReactNode) => (
    <div className="app-frame flex h-dvh w-full justify-center">
      <div
        className={`relative flex h-dvh w-full flex-col overflow-hidden bg-app text-body ${
          landscape
            ? // 手机 / 安卓 WebView 横屏：左右双栏要占满整屏，不做限宽
              ''
            : // 竖屏与桌面：大于 440px 时居中成紧凑面板，PC 上不会被横向拉伸
              'sm:max-w-[440px] sm:shadow-2xl sm:shadow-black/60 sm:ring-1 sm:ring-line/70'
        } ${navVisible ? 'has-bottom-nav' : ''} ${webUpdateBanner ? 'has-update-banner' : ''} ${
          tab === 'about' && aboutPage === null ? 'about-main-tab' : ''
        }`}
      >
        {webUpdateBanner}
        {/* 滑动切页的跟手位移直接写在这一层上（见 useSwipePager），不动任何业务状态。
            touch-pan-y 把横向手势留给 JS，否则 WebView 会先抢走 touchmove 并取消手势。 */}
        <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
          <div
            key={tab}
            className={`flex min-h-0 flex-1 flex-col overflow-hidden touch-pan-y ${pageAnim}`}
            {...swipeHandlers}
          >
            {content}
          </div>
        </div>
        {navVisible && (
          <BottomNav tab={tab} onChange={goTab} hasUpdate={updateInfo !== null} />
        )}
        {/* 设置二级子页：整屏覆盖内容区与底栏，仍压在全局模态层之下 */}
        {subpage}
        {overlays}
        {toast && (
          <div
            className={`pointer-events-none fixed inset-x-0 z-[70] flex justify-center ${
              // 抽屉 / 复盘浮层打开时改到顶部：底部会被浮层盖住，压在英雄行上很难看
              matchSheet || reviewOpen
                ? 'top-0 pt-[calc(env(safe-area-inset-top,0px)+14px)]'
                : 'bottom-0 pb-[calc(env(safe-area-inset-bottom,0px)+84px)]'
            }`}
            role="status"
            aria-live="polite"
          >
            <span className="rounded-full bg-raised/95 px-3.5 py-1.5 text-[12px] font-medium text-fg shadow-lg shadow-black/30 ring-1 ring-line animate-fade-in">
              {toast}
            </span>
          </div>
        )}
      </div>
    </div>
  );

  /* ---------------- 一级页面：设置 ---------------- */

  if (tab === 'settings') {
    return shell(
      <SettingsView
        snapshot={snap}
        subpageOpen={settingsPage !== null}
        languageOpen={languageOpen}
        onLanguageOpenChange={setLanguageOpen}
        onOpenPage={setSettingsPage}
        onOpenThemeColor={() => setThemeColorOpen(true)}
      />,
      true,
      settingsPage ? (
        <SettingsSubpage
          key={settingsPage}
          ref={settingsSubpageRef}
          page={settingsPage}
          onBack={() => setSettingsPage(settingsPage === 'blocked' ? 'draft' : null)}
          snapshot={snap}
          onPull={() => metaStore.pullNow()}
          displayPrefs={displayPrefs}
          onDisplayPrefsChange={handleDisplayPrefsChange}
          blockedCount={blockedIds.length}
          blockedIds={blockedIds}
          onApplyBlockedIds={applyBlockedIds}
          onOpenPage={setSettingsPage}
          onOpenThemeColor={() => setThemeColorOpen(true)}
        />
      ) : null,
    );
  }

  /* ---------------- 一级页面：关于 ---------------- */

  if (tab === 'about') {
    return shell(
      <AboutView
        records={matches}
        updateInfo={updateInfo}
        qqGroupUrl={qqGroupUrl}
        subpageOpen={aboutPage !== null}
        onCheckUpdate={handleCheckUpdate}
        onShowUpdate={() => setUpdateOpen(true)}
        onOpenCredits={() => setAboutPage('credits')}
        onImported={handleImportedBackup}
      />,
      true,
      aboutPage === 'credits' ? (
        <AboutSubpage key={aboutPage} ref={aboutSubpageRef} onBack={() => setAboutPage(null)} />
      ) : null,
    );
  }

  /* ---------------- 一级页面：战绩 ---------------- */

  if (tab === 'history') {
    return shell(
      <HistoryView
        records={matches}
        getBrawler={getBrawler}
        onEdit={(record) => openMatchSheet(record, false)}
        onReview={handleOpenReview}
        onDelete={handleDeleteMatch}
        onGoDraft={() => goTab('draft')}
      />,
      true,
    );
  }

  /* ---------------- 一级页面：BP 助手 → 选图 ---------------- */

  // 首屏选图：尚未建局（draft 为 null）时没有返回按钮
  if (!draft || screen === 'select') {
    return shell(
      <div className={`flex h-full min-h-0 flex-col ${screenAnim}`}>
        <MapPicker
          maps={snap.meta.maps}
          current={draft?.mapName ?? ''}
          onSelect={handleSelectMap}
          onClose={draft ? enterDraft : undefined}
        />
      </div>,
      true,
    );
  }

  /* ---------------- 一级页面：BP 助手 → BP 禁选 ---------------- */

  /** 双方各 3 人都选完，BP 结束，不再推荐 */
  const isComplete =
    draft.ally.length === TEAM_SLOTS && draft.enemy.length === TEAM_SLOTS;

  /** 顶栏详情卡：本图样本量 + 数据门槛（如「传奇 I+」） */
  const mapGames = snap.meta.maps.find((m) => m.map_name === draft.mapName)?.total_games ?? 0;
  const tierMin = snap.meta.min_tier;
  const tierText = `${tier(
    snap.meta.tier_audit?.distribution.find((d) => d.tier === tierMin)?.label ?? String(tierMin),
  )}+`;

  /* ---------------- 英雄池 ----------------
   * 竖屏：Top 区 4 列 / 稀有度 5 列（沿用原网格）；
   * 横屏右栏：按栏宽 auto-fill，每行 4~6 个，Top 12 一屏看完。
   */
  const autoFill = { gridTemplateColumns: 'repeat(auto-fill, minmax(60px, 1fr))' } as const;
  const topGridCls = landscape ? 'grid gap-x-1.5 gap-y-2' : 'grid grid-cols-4 gap-x-1.5 gap-y-2';
  const secGridCls = landscape ? 'grid gap-x-1.5 gap-y-2' : 'grid grid-cols-5 gap-x-1.5 gap-y-2';
  const gridStyle = landscape ? autoFill : undefined;

  /** Ban 阶段：当前激活的是哪个 Ban 位（决定推荐按哪一队算） */
  const banPhase = draft.active.kind === 'ban';

  /**
   * 己方选人阶段：只有这一阶段的推荐栏会过滤个人屏蔽。
   * Ban 推荐不过滤（免得因为自己不玩而漏掉高威胁 Ban 位），
   * 敌方「可能会选」也不过滤（那是要预判对面拿什么，跟个人口味无关）。
   */
  const allyPickPhase = draft.active.kind === 'ally';

  /**
   * 顶部推荐区候选：职业筛选 → 己方选人阶段剔除个人屏蔽 → 从后面的高分英雄
   * **顺位补齐**原定数量（`candidates` 已按推荐分降序，直接截断即可）。
   * 纯展示层过滤，算分引擎与排序一行未改。
   */
  const filterBase =
    classFilter === 'ALL' ? candidates : candidates.filter((c) => c.cls === classFilter);
  const topPicks = (
    allyPickPhase && displayPrefs.hideBlocked
      ? filterBase.filter((c) => !blockedSet.has(c.id))
      : filterBase
  ).slice(0, TOP_PICK_COUNT);

  /**
   * 顶部区块标题 / 主题：敌方选角回合切成「敌方可能会选」+ 红色系，
   * 我方选角与 Ban 阶段保持「高优先推荐」+ 蓝色系。
   */
  const head = recommendHeadOf(draft);
  /**
   * 本队已 Ban 的英雄会从推荐里剔除，所以列表里出现的 Ban 英雄都是「对方已 Ban」。
   * 这里刻意不用 useMemo：它位于若干 early return 之后，用 hook 会打乱 hooks 顺序。
   */
  const otherTeamBanned = new Set(banPhase ? bannedIds(draft) : []);

  /**
   * 「空 Ban」入口：放在选人面板最前面，Ban 阶段常驻。
   * 点它 = 这个 Ban 位不 Ban 人（盲 Ban 时对面没被 Ban 到 / 双方撞车都算常见）。
   */
  const emptyBanEntry = banPhase ? (
    <button
      type="button"
      onClick={handleEmptyBan}
      className="mx-1 mb-1.5 flex items-center gap-2 rounded-lg bg-[var(--card-bg)] px-2 py-1.5 text-left transition-colors active:bg-press"
      aria-label={t('pool.emptyBanDesc')}
    >
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-raised/70 text-muted">
        <EmptyBanIcon size={14} />
      </span>
      <span className="min-w-0 flex-1 leading-tight">
        <span className="block text-[12px] font-semibold text-body">
          {t('pool.emptyBanTitle')}
        </span>
        <span className="block text-[10px] text-subtle">{t('pool.emptyBanDesc')}</span>
      </span>
      <span className="shrink-0 text-[10px] text-subtle">{t('pool.emptyBanSkip')}</span>
    </button>
  ) : null;

  const poolContent = isComplete ? (
    <div className="flex h-full flex-col items-center justify-center gap-1.5 px-6 text-center">
      <p className="text-[13px] font-semibold text-body">{t('pool.completeTitle')}</p>
      <p className="text-[11px] leading-relaxed text-subtle">{t('pool.completeDesc')}</p>
      {/*
        6 手选完的落点：把这一局存进历史战绩。
        已经存过的同一局不再重复建记录，按钮切成「已保存 · 查看/编辑战绩」；
        换图或改英雄后指纹变化，自动回到「保存到历史对局」。
      */}
      <button
        type="button"
        onClick={handleOpenSaveSheet}
        className={`mt-1.5 flex h-10 w-full max-w-[260px] items-center justify-center gap-1.5 rounded-lg px-3 text-[12.5px] font-semibold transition-colors ${
          savedRecord
            ? 'border border-line-strong bg-surface/80 text-body active:bg-press'
            : 'bg-accent text-accent-on active:opacity-80'
        }`}
      >
        {savedRecord ? <ClipboardCheck size={14} /> : <Save size={14} />}
        {savedRecord ? t('save.savedCta') : t('save.cta')}
      </button>
    </div>
  ) : (
    <>
      {emptyBanEntry}
      {candidates.length === 0 ? (
        <div className="flex h-full flex-col items-center justify-center gap-1 px-6 text-center">
          <p className="text-[12px] text-subtle">{t('pool.noCandidates')}</p>
        </div>
      ) : (
        <>
          {/* 第一区：高优先推荐 / 敌方可能会选（推荐分前 12 名；有职业筛选时是该职业内的前 12 名；
              己方选人阶段已剔除个人屏蔽的英雄并顺位补齐） */}
          {topPicks.length > 0 && (
          <section
            ref={topSectionRef}
            className="mx-1 mb-1.5 rounded-[18px] bg-[var(--card-bg)] px-1.5 pb-1.5 pt-1"
          >
            <header className="mb-1 flex items-baseline">
              <span className="flex items-center gap-1">
                {head.enemy ? (
                  <Swords size={11} className="shrink-0 text-enemy" />
                ) : (
                  <Flame size={11} className="shrink-0 text-accent" />
                )}
                <h3
                  className={`text-[11px] font-bold tracking-wide ${
                    head.enemy ? 'text-danger' : 'text-accent'
                  }`}
                >
                  {t(head.key)}
                </h3>
                <span
                  className={`text-[9px] tabular-nums ${
                    head.enemy ? 'text-danger/60' : 'text-accent/60'
                  }`}
                >
                  {topPicks.length}
                </span>
              </span>
            </header>
            {/* Top 区比稀有度区更大：实战秒选更好点，也把稀有度分区推到折叠线附近 */}
            <div className={topGridCls} style={gridStyle}>
              {topPicks.map((c) => (
                <BrawlerTile
                  key={`top-${c.id}`}
                  candidate={c}
                  rank={ranks.get(c.id) ?? 0}
                  bannedElsewhere={otherTeamBanned.has(c.id)}
                  blocked={blockedSet.has(c.id)}
                  onPick={() => handlePick(c.id)}
                  onLongPress={() => setMatchupId(c.id)}
                />
              ))}
            </div>
          </section>
          )}

          {/* 职业筛选：标签横向滚动、不换行 */}
          <div
            className="no-scrollbar mx-1 mb-1.5 flex items-center gap-1 overflow-x-auto overscroll-x-contain"
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

          {/* 下方全英雄池：按官方稀有度从低到高分栏，**不剔除**顶部已上榜的英雄 */}
          {pool.sections.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-1 px-6 py-8 text-center">
              <p className="text-[12px] text-subtle">{t('pool.filterEmpty')}</p>
            </div>
          ) : (
          pool.sections.map((sec) => (
            <section
              key={sec.key}
              className="mx-1 mb-1.5 rounded-[18px] border px-1.5 pb-1.5 pt-1"
              style={raritySectionStyle(sec.color, theme)}
            >
              <header className="mb-1 flex items-baseline justify-between gap-2">
                <span className="flex items-center gap-1">
                  <span
                    className="h-1.5 w-1.5 shrink-0 rounded-full"
                    style={{ backgroundColor: themeAccent(sec.color, theme) }}
                  />
                  <h3
                    className="text-[11px] font-bold tracking-wide"
                    style={{ color: themeAccent(sec.color, theme) }}
                  >
                    {t(`rarity.section.${sec.key}`)}
                  </h3>
                  <span className="text-[9px] tabular-nums text-subtle">
                    {sec.items.length}
                  </span>
                </span>
              </header>
              <div className={secGridCls} style={gridStyle}>
                {sec.items.map((c) => (
                  <BrawlerTile
                    key={`${sec.key}-${c.id}`}
                    candidate={c}
                    rank={ranks.get(c.id) ?? 0}
                    bannedElsewhere={otherTeamBanned.has(c.id)}
                    blocked={blockedSet.has(c.id)}
                    onPick={() => handlePick(c.id)}
                    onLongPress={() => setMatchupId(c.id)}
                  />
                ))}
              </div>
            </section>
          ))
          )}
        </>
      )}
    </>
  );

  /* ---------------- 横屏：左战局固定 + 右英雄池通栏 ---------------- */
  if (landscape) {
    return shell(
      <div className={`flex h-full flex-row overflow-hidden ${screenAnim}`}>
        <aside className="flex w-[43%] min-w-[220px] max-w-[350px] shrink-0 flex-col border-r border-line/80 bg-app">
          <TopBar
            variant="strip"
            mapName={draft.mapName}
            mode={draft.mode}
            mapGames={mapGames}
            tierLabel={tierText}
            dataDate={snap.dataDate}
            onOpenMap={leaveDraft}
          />
          <DraftBar
            variant="landscape"
            state={draft}
            idx={snap.index}
            getBrawler={getBrawler}
            onActivate={handleActivate}
            onClear={handleClear}
            onMatchup={setMatchupId}
            onUndo={handleUndo}
            onReset={handleReset}
            onChooseFirst={handleChooseFirst}
            canUndo={history.length > 0}
          />
        </aside>

        {/* 右栏：独立上下滚动，卡片列数随栏宽自适应 */}
        <main
          ref={scrollRef}
          className="min-w-0 flex-1 overflow-y-auto overscroll-contain py-1.5"
        >
          {poolContent}
        </main>
      </div>,
      // 横屏双栏：竖向空间全给 BP 台，底部导航让位（换图 / 设置走顶栏地图条）
      false,
    );
  }

  /* ---------------- 竖屏：地图卡进滚动流 + 底部 BP 台 ---------------- */
  return shell(
    <div className={`flex h-full flex-col overflow-hidden ${screenAnim}`}>
      {/* 地图详情卡是滚动容器里的第一块内容，往下滑就滚走（不吸顶） */}
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-1.5">
        <TopBar
          variant="card"
          mapName={draft.mapName}
          mode={draft.mode}
          mapGames={mapGames}
          tierLabel={tierText}
          dataDate={snap.dataDate}
          onOpenMap={leaveDraft}
        />
        {poolContent}
      </div>

      <DraftBar
        variant="portrait"
        state={draft}
        idx={snap.index}
        getBrawler={getBrawler}
        onActivate={handleActivate}
        onClear={handleClear}
        onMatchup={setMatchupId}
        onUndo={handleUndo}
        onReset={handleReset}
        onChooseFirst={handleChooseFirst}
        canUndo={history.length > 0}
      />
    </div>,
    // 矮视口（悬浮小窗 / 分屏）时底部导航让位，避免把英雄池压成一条缝
    !vp.short,
  );
}
