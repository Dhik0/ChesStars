import { useEffect, useMemo, useRef, useState } from 'react';
import { Flame, Loader2, RefreshCw } from 'lucide-react';
import BrawlerDetail from './components/BrawlerDetail';
import BrawlerTile from './components/BrawlerTile';
import DraftBar from './components/DraftBar';
import MapPicker from './components/MapPicker';
import MatchupSheet from './components/MatchupSheet';
import SettingsSheet from './components/SettingsSheet';
import TopBar from './components/TopBar';
import { brawlerCN } from './data/localization';
import { metaStore, type MetaSnapshot } from './services/metaStore';
import {
  applyPick,
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
import { buildBrawlerPool, rankMap } from './utils/pool';
import { useViewport } from './utils/useViewport';

const LS_MAP = 'brawl.draft.map';

/** 首屏是「选择地图」，选完才进 BP 面板 */
type Screen = 'select' | 'draft';

export default function App() {
  const [snap, setSnap] = useState<MetaSnapshot | null>(metaStore.getSnapshot());
  const [error, setError] = useState<string | null>(null);

  const [draft, setDraft] = useState<DraftState | null>(null);
  /** 当前页面：启动时停在选图页，选定地图后才进 BP */
  const [screen, setScreen] = useState<Screen>('select');
  /** 撤回栈（最多保留 30 步）。重做已按需求彻底移除 */
  const [history, setHistory] = useState<DraftState[]>([]);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [detailId, setDetailId] = useState<number | null>(null);
  /** 长按弹窗：当前查看详细对位的英雄 */
  const [matchupId, setMatchupId] = useState<number | null>(null);

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

  // 首屏选图：尚未建局（draft 为 null）时没有返回按钮
  if (screen === 'select' || !draft) {
    return (
      <MapPicker
        maps={snap.meta.maps}
        current={draft?.mapName ?? ''}
        onSelect={handleSelectMap}
        onClose={draft ? () => setScreen('draft') : undefined}
      />
    );
  }

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

  const poolContent = isComplete ? (
    <div className="flex h-full flex-col items-center justify-center gap-1.5 px-6 text-center">
      <p className="text-[13px] font-semibold text-slate-300">本局 BP 已完成</p>
      <p className="text-[11px] leading-relaxed text-slate-500">
        点击任一槽位可清空重选，或点「重置」重开本局
      </p>
    </div>
  ) : candidates.length === 0 ? (
    <div className="flex h-full flex-col items-center justify-center gap-1 px-6 text-center">
      <p className="text-[12px] text-slate-500">没有可用英雄（已全部 Ban 完 / 选完）</p>
    </div>
  ) : (
    <>
      {/* 第一区：高优先推荐（推荐分前 12 名，实战秒选） */}
      <section
        ref={topSectionRef}
        className="mx-1 mb-1.5 rounded-lg border border-sky-500/30 bg-sky-500/[0.07] px-1.5 pb-1.5 pt-1"
      >
        <header className="mb-1 flex items-baseline justify-between gap-2">
          <span className="flex items-center gap-1">
            <Flame size={11} className="shrink-0 text-sky-400" />
            <h3 className="text-[11px] font-bold tracking-wide text-sky-300">高优先推荐</h3>
            <span className="text-[9px] tabular-nums text-sky-400/60">{pool.top.length}</span>
          </span>
          <span className="shrink-0 text-[9px] text-slate-500">
            {draft.firstPick ? '点按填入 · 长按看对位' : '长按看对位'}
          </span>
        </header>
        {/* Top 区比稀有度区更大：实战秒选更好点，也把稀有度分区推到折叠线附近 */}
        <div className={topGridCls} style={gridStyle}>
          {pool.top.map((c) => (
            <BrawlerTile
              key={c.id}
              candidate={c}
              rank={ranks.get(c.id) ?? 0}
              onPick={() => handlePick(c.id)}
              onLongPress={() => setMatchupId(c.id)}
            />
          ))}
        </div>
      </section>

      {/* 其余：按官方稀有度从低到高分栏，去重后不重复出现 */}
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
              <span className="text-[9px] tabular-nums text-slate-500">{sec.items.length}</span>
            </span>
          </header>
          <div className={secGridCls} style={gridStyle}>
            {sec.items.map((c) => (
              <BrawlerTile
                key={c.id}
                candidate={c}
                rank={ranks.get(c.id) ?? 0}
                onPick={() => handlePick(c.id)}
                onLongPress={() => setMatchupId(c.id)}
              />
            ))}
          </div>
        </section>
      ))}
    </>
  );

  const overlays = (
    <>
      {settingsOpen && (
        <SettingsSheet
          snapshot={snap}
          onClose={() => setSettingsOpen(false)}
          onSaveUrl={(u) => metaStore.setRemoteUrl(u)}
          onPull={() => metaStore.pullNow()}
          onClearCache={() => metaStore.clearCache()}
        />
      )}

      {detailCandidate && (
        <BrawlerDetail candidate={detailCandidate} onClose={() => setDetailId(null)} />
      )}

      {matchupId !== null && (
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

  /* ---------------- 横屏：左战局固定 + 右英雄池通栏 ---------------- */
  if (landscape) {
    return (
      <div className="flex h-dvh flex-row overflow-hidden bg-slate-950 text-slate-200">
        <aside className="flex w-[43%] min-w-[220px] max-w-[350px] shrink-0 flex-col border-r border-slate-800/80 bg-slate-950">
          <TopBar
            variant="strip"
            mapName={draft.mapName}
            mode={draft.mode}
            mapGames={mapGames}
            tierLabel={tierLabel}
            warnings={warnings}
            onOpenMap={() => setScreen('select')}
            onOpenSettings={() => setSettingsOpen(true)}
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

        {overlays}
      </div>
    );
  }

  /* ---------------- 竖屏：地图卡进滚动流 + 底部 BP 台 ---------------- */
  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-slate-950 text-slate-200">
      {/* 地图详情卡是滚动容器里的第一块内容，往下滑就滚走（不吸顶） */}
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-1.5">
        <TopBar
          variant="card"
          mapName={draft.mapName}
          mode={draft.mode}
          mapGames={mapGames}
          tierLabel={tierLabel}
          warnings={warnings}
          onOpenMap={() => setScreen('select')}
          onOpenSettings={() => setSettingsOpen(true)}
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

      {overlays}
    </div>
  );
}
