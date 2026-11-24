import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { App as NativeApp } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { Ban as EmptyBanIcon, Flame, Loader2, RefreshCw, Swords } from 'lucide-react';
import BottomNav, { type MainTab } from './components/BottomNav';
import BrawlerDetail from './components/BrawlerDetail';
import BrawlerTile from './components/BrawlerTile';
import DraftBar from './components/DraftBar';
import MapPicker from './components/MapPicker';
import MatchupSheet from './components/MatchupSheet';
import SettingsView from './components/SettingsView';
import TopBar from './components/TopBar';
import UpdateDialog from './components/UpdateDialog';
import { APP_VERSION } from './config/app';
import { brawlerCN } from './data/localization';
import { metaStore, type MetaSnapshot } from './services/metaStore';
import {
  checkForUpdate,
  ignoreVersion,
  isVersionIgnored,
  type UpdateCheckResult,
  type UpdateInfo,
} from './services/updateChecker';
import {
  EMPTY_BAN,
  applyPick,
  bannedIds,
  clearSlot,
  createDraft,
  detectCompWarnings,
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
import { recommendHeadOf } from './utils/display';
import { backGuardCount, runTopBackGuard } from './utils/backGuards';
import { decideBack, type BackLayer, type BackState } from './utils/backNavigation';
import { openExternal } from './utils/openExternal';
import { buildBrawlerPool, rankMap } from './utils/pool';
import { useViewport } from './utils/useViewport';

const LS_MAP = 'brawl.draft.map';

/** 「BP 助手」Tab 内的二级页面：首屏是「选择地图」，选完才进 BP 面板 */
type Screen = 'select' | 'draft';

export default function App() {
  const [snap, setSnap] = useState<MetaSnapshot | null>(metaStore.getSnapshot());
  const [error, setError] = useState<string | null>(null);

  const [draft, setDraft] = useState<DraftState | null>(null);
  /** 一级页面（底部导航）：左侧选图 + BP 主流程 / 右侧设置 */
  const [tab, setTab] = useState<MainTab>('draft');
  /** BP 助手内的二级页面：启动时停在选图页，选定地图后才进 BP */
  const [screen, setScreen] = useState<Screen>('select');
  /** 撤回栈（最多保留 30 步）。重做已按需求彻底移除 */
  const [history, setHistory] = useState<DraftState[]>([]);
  const [detailId, setDetailId] = useState<number | null>(null);
  /** 长按弹窗：当前查看详细对位的英雄 */
  const [matchupId, setMatchupId] = useState<number | null>(null);
  /** 发现的新版本（null = 没有更新或检查失败） */
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  /** 更新弹窗开关（启动自动检查命中且未被忽略时打开） */
  const [updateOpen, setUpdateOpen] = useState(false);
  /** 远程清单里的 QQ 群链接（与是否有新版本无关）；null = 用打包内置的那份 */
  const [qqGroupUrl, setQqGroupUrl] = useState<string | null>(null);

  /** 底部轻提示（目前只有「再滑一次退出应用」用它），非阻塞、自动消失 */
  const [toast, setToast] = useState<string | null>(null);
  const toastTimerRef = useRef<number | null>(null);

  /* ---------------- 侧滑返回 / 系统返回键 ---------------- */

  /** 上一次「退出提示」的时间戳：双击退出的计时窗口，放 ref 里避免闭包读到旧值 */
  const lastBackAtRef = useRef<number | null>(null);
  /** 返回处理器读取的界面快照，每次渲染同步一次 */
  const backStateRef = useRef<Omit<BackState, 'hasGuard'>>({
    layers: [],
    tab: 'draft',
    screen: 'select',
    hasDraft: false,
  });

  /**
   * 已打开的模态层，按叠放顺序排列（末尾 = 最顶层）。
   * 更新弹窗 z-60 盖在详情 / 对位抽屉 z-50 之上，所以排在最后。
   */
  const layers: BackLayer[] = [];
  if (matchupId !== null) layers.push('matchup');
  if (detailId !== null) layers.push('detail');
  if (updateOpen && updateInfo !== null) layers.push('update');
  backStateRef.current = { layers, tab, screen, hasDraft: draft !== null };

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
        else setMatchupId(null);
        break;
      case 'runGuard':
        runTopBackGuard();
        break;
      case 'goMainTab':
        setTab('draft');
        break;
      case 'leaveDraft':
        setScreen('select');
        break;
      case 'showExitHint':
        showToast('再滑一次退出应用');
        break;
      case 'exitApp':
        void NativeApp.exitApp();
        break;
    }
  }, [showToast]);

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
        if (alive) setError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      alive = false;
      unsub();
    };
  }, []);

  /* ---------------- 新版本检测（静默、非阻塞） ----------------
   * 启动时后台问一次版本清单：超时 / 限流 / 断网全部静默忽略，
   * 只有真的拿到更高版本才记下来。用户点过「忽略此版本」的不再自动弹窗，
   * 但底部「设置」Tab 上的小圆点照旧保留（用户想装时还能找到入口）。
   *
   * 顺带把清单里的 QQ 群链接记下来：它和「有没有新版本」无关，
   * 远程改了之后，老版本 App 也能立刻换到新群链接。
   */
  useEffect(() => {
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
    return recommend(snap.index, draft, 200);
  }, [snap, draft]);

  /** 英雄池 = Top 推荐 + 稀有度分区（搜索/筛选栏已移除） */
  const pool = useMemo(() => buildBrawlerPool(candidates), [candidates]);
  /** 推荐分排名表：卡片角标用全局名次，稀有度分区里也能看出它在总榜的位置 */
  const ranks = useMemo(() => rankMap(candidates), [candidates]);

  const warnings = useMemo(
    () => (snap && draft ? detectCompWarnings(snap.index, draft) : []),
    [snap, draft],
  );

  const detailCandidate = useMemo<Candidate | null>(() => {
    if (!snap || !draft || detailId === null) return null;
    return (
      candidates.find((c) => c.id === detailId) ??
      evaluateBrawler(snap.index, draft, detailId)
    );
  }, [snap, draft, detailId, candidates]);

  const getBrawler = (id: number): { name: string; cn: string } | undefined => {
    const ref = snap?.index.brawlerById.get(id);
    return ref ? { name: ref.name, cn: brawlerCN(ref.name) } : undefined;
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
      setScreen('draft');
      return;
    }
    // 换图等于开新局：历史清空，先手方回到「未选择」前置态
    setHistory([]);
    setDraft(createDraft(mapName, mode));
    setScreen('draft');
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

  /* ---------------- 版本更新 ---------------- */

  /** 手动检查：结果交给设置页反馈，同时刷新红点与横幅 */
  const handleCheckUpdate = async (): Promise<UpdateCheckResult> => {
    const res = await checkForUpdate();
    if (res.info?.qqGroupUrl) setQqGroupUrl(res.info.qqGroupUrl);
    if (res.status === 'update' && res.info) setUpdateInfo(res.info);
    else if (res.status === 'latest') setUpdateInfo(null);
    return res;
  };

  const handleDownloadUpdate = () => {
    if (updateInfo) openExternal(updateInfo.htmlUrl);
  };

  const handleIgnoreUpdate = () => {
    if (updateInfo) ignoreVersion(updateInfo.version);
    setUpdateOpen(false);
  };

  /**
   * 更新弹窗是**全局浮层**：它挂在最外层壳上，选图页 / BP 页 / 设置页
   * 三个层级都能看到，启动检测到新版本时不管停在哪一屏都不会漏。
   */
  const updateOverlay =
    updateOpen && updateInfo ? (
      <UpdateDialog
        info={updateInfo}
        current={APP_VERSION}
        onClose={() => setUpdateOpen(false)}
        onIgnore={handleIgnoreUpdate}
        onDownload={handleDownloadUpdate}
      />
    ) : null;

  /* ---------------- 渲染：加载 / 错误 ---------------- */

  if (error) {
    return (
      <div className="flex h-dvh flex-col items-center justify-center gap-3 bg-slate-950 px-6 text-center">
        <p className="text-[13px] font-semibold text-red-400">数据加载失败</p>
        <p className="text-[11px] leading-relaxed text-slate-500">{error}</p>
        <button
          type="button"
          onClick={() => {
            setError(null);
            void metaStore.init().then(setSnap);
          }}
          className="flex h-9 items-center gap-1.5 rounded-lg bg-slate-800 px-3 text-[12px] text-slate-200 active:bg-slate-700"
        >
          <RefreshCw size={13} />
          重试
        </button>
      </div>
    );
  }

  if (!snap) {
    return (
      <div className="flex h-dvh flex-col items-center justify-center gap-2 bg-slate-950">
        <Loader2 size={20} className="animate-spin text-sky-500" />
        <p className="text-[11px] text-slate-500">正在载入英雄数据…</p>
      </div>
    );
  }

  /* ---------------- 全局浮层 ---------------- */

  const overlays = (
    <>
      {updateOverlay}

      {detailCandidate && (
        <BrawlerDetail candidate={detailCandidate} onClose={() => setDetailId(null)} />
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
   * `navVisible` 由各页面决定：
   *   - 选图页 / 设置页：常驻（设置是这里的唯一入口，必须可达）；
   *   - BP 页：竖向空间充足时（非矮视口竖屏）常驻，否则让位给英雄网格与 BP 台
   *     ——此时回设置要走顶部地图卡回到选图页，BP 进度不会因此丢失。
   */
  const shell = (content: ReactNode, navVisible: boolean) => (
    <div
      className={`flex h-dvh flex-col overflow-hidden bg-slate-950 text-slate-200 ${
        navVisible ? 'has-bottom-nav' : ''
      }`}
    >
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">{content}</div>
      {navVisible && (
        <BottomNav tab={tab} onChange={setTab} hasUpdate={updateInfo !== null} />
      )}
      {overlays}
      {toast && (
        <div
          className="pointer-events-none fixed inset-x-0 bottom-0 z-[70] flex justify-center pb-[calc(env(safe-area-inset-bottom,0px)+84px)]"
          role="status"
          aria-live="polite"
        >
          <span className="rounded-full bg-slate-800/95 px-3.5 py-1.5 text-[12px] font-medium text-slate-100 shadow-lg shadow-black/50 ring-1 ring-white/10 animate-fade-in">
            {toast}
          </span>
        </div>
      )}
    </div>
  );

  /* ---------------- 一级页面：设置 ---------------- */

  if (tab === 'settings') {
    return shell(
      <SettingsView
        snapshot={snap}
        onPull={() => metaStore.pullNow()}
        updateInfo={updateInfo}
        qqGroupUrl={qqGroupUrl}
        onCheckUpdate={handleCheckUpdate}
        onShowUpdate={() => setUpdateOpen(true)}
      />,
      true,
    );
  }

  /* ---------------- 一级页面：BP 助手 → 选图 ---------------- */

  // 首屏选图：尚未建局（draft 为 null）时没有返回按钮
  if (!draft || screen === 'select') {
    return shell(
      <MapPicker
        maps={snap.meta.maps}
        current={draft?.mapName ?? ''}
        onSelect={handleSelectMap}
        onClose={draft ? () => setScreen('draft') : undefined}
      />,
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
  const tierLabel = `${
    snap.meta.tier_audit?.distribution.find((d) => d.tier === tierMin)?.label ?? `段位 ${tierMin}`
  }+`;

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
      className="mx-1 mb-1.5 flex items-center gap-2 rounded-lg border border-dashed border-slate-600/70 bg-slate-900/60 px-2 py-1.5 text-left transition-colors active:bg-slate-800"
      aria-label="空 Ban：本槽位不 Ban 任何英雄"
    >
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-slate-600/80 bg-slate-950/70 text-slate-400">
        <EmptyBanIcon size={14} />
      </span>
      <span className="min-w-0 flex-1 leading-tight">
        <span className="block text-[12px] font-semibold text-slate-200">空 Ban</span>
        <span className="block text-[10px] text-slate-500">
          本槽位不 Ban 英雄 · 可重复使用
        </span>
      </span>
      <span className="shrink-0 text-[10px] text-slate-500">跳过</span>
    </button>
  ) : null;

  const poolContent = isComplete ? (
    <div className="flex h-full flex-col items-center justify-center gap-1.5 px-6 text-center">
      <p className="text-[13px] font-semibold text-slate-300">本局 BP 已完成</p>
      <p className="text-[11px] leading-relaxed text-slate-500">
        点击任一槽位可清空重选，或点「重置」重开本局
      </p>
    </div>
  ) : (
    <>
      {emptyBanEntry}
      {candidates.length === 0 ? (
        <div className="flex h-full flex-col items-center justify-center gap-1 px-6 text-center">
          <p className="text-[12px] text-slate-500">没有可用英雄（已全部 Ban 完 / 选完）</p>
        </div>
      ) : (
        <>
          {/* 第一区：高优先推荐 / 敌方可能会选（推荐分前 12 名） */}
          <section
            ref={topSectionRef}
            className={`mx-1 mb-1.5 rounded-lg border px-1.5 pb-1.5 pt-1 ${
              head.enemy
                ? 'border-enemy/40 bg-enemy/[0.08]'
                : 'border-sky-500/30 bg-sky-500/[0.07]'
            }`}
          >
            <header className="mb-1 flex items-baseline justify-between gap-2">
              <span className="flex items-center gap-1">
                {head.enemy ? (
                  <Swords size={11} className="shrink-0 text-enemy" />
                ) : (
                  <Flame size={11} className="shrink-0 text-sky-400" />
                )}
                <h3
                  className={`text-[11px] font-bold tracking-wide ${
                    head.enemy ? 'text-red-400' : 'text-sky-300'
                  }`}
                >
                  {head.title}
                </h3>
                <span
                  className={`text-[9px] tabular-nums ${
                    head.enemy ? 'text-red-400/60' : 'text-sky-400/60'
                  }`}
                >
                  {pool.top.length}
                </span>
              </span>
              <span className="shrink-0 text-[9px] text-slate-500">
                {draft.firstPick ? '点按填入 · 长按看对位' : '长按看对位'}
              </span>
            </header>
            {/* Top 区比稀有度区更大：实战秒选更好点，也把稀有度分区推到折叠线附近 */}
            <div className={topGridCls} style={gridStyle}>
              {pool.top.map((c) => (
                <BrawlerTile
                  key={`top-${c.id}`}
                  candidate={c}
                  rank={ranks.get(c.id) ?? 0}
                  bannedElsewhere={otherTeamBanned.has(c.id)}
                  onPick={() => handlePick(c.id)}
                  onLongPress={() => setMatchupId(c.id)}
                />
              ))}
            </div>
          </section>

          {/* 下方全英雄池：按官方稀有度从低到高分栏，**不剔除**顶部已上榜的英雄 */}
          {pool.sections.map((sec) => (
            <section
              key={sec.key}
              className="mx-1 mb-1.5 rounded-lg border px-1.5 pb-1.5 pt-1"
              style={{ backgroundColor: `${sec.color}1A`, borderColor: `${sec.color}33` }}
            >
              <header className="mb-1 flex items-baseline justify-between gap-2">
                <span className="flex items-center gap-1">
                  <span
                    className="h-1.5 w-1.5 shrink-0 rounded-full"
                    style={{ backgroundColor: sec.color }}
                  />
                  <h3 className="text-[11px] font-bold tracking-wide" style={{ color: sec.color }}>
                    {sec.label}
                  </h3>
                  <span className="text-[9px] tabular-nums text-slate-500">
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
                    onPick={() => handlePick(c.id)}
                    onLongPress={() => setMatchupId(c.id)}
                  />
                ))}
              </div>
            </section>
          ))}
        </>
      )}
    </>
  );

  /* ---------------- 横屏：左战局固定 + 右英雄池通栏 ---------------- */
  if (landscape) {
    return shell(
      <div className="flex h-full flex-row overflow-hidden">
        <aside className="flex w-[43%] min-w-[220px] max-w-[350px] shrink-0 flex-col border-r border-slate-800/80 bg-slate-950">
          <TopBar
            variant="strip"
            mapName={draft.mapName}
            mode={draft.mode}
            mapGames={mapGames}
            tierLabel={tierLabel}
            dataDate={snap.dataDate}
            warnings={warnings}
            onOpenMap={() => setScreen('select')}
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
    <div className="flex h-full flex-col overflow-hidden">
      {/* 地图详情卡是滚动容器里的第一块内容，往下滑就滚走（不吸顶） */}
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-1.5">
        <TopBar
          variant="card"
          mapName={draft.mapName}
          mode={draft.mode}
          mapGames={mapGames}
          tierLabel={tierLabel}
          dataDate={snap.dataDate}
          warnings={warnings}
          onOpenMap={() => setScreen('select')}
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
