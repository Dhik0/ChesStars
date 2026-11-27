import { useEffect, useMemo, useState } from 'react';
import { Check, ChevronDown, Search, X } from 'lucide-react';
import type { MapEntry } from '../types/meta';
import { MODE_ORDER, modeColor } from '../data/localization';
import { mapSearchNames } from '../i18n/gameData';
import { useTranslation } from '../i18n';
import { useBackGuard } from '../utils/backGuards';
import { themeAccent } from '../utils/display';
import { useTheme } from '../utils/useTheme';
import MapThumb from './MapThumb';
import ModeIcon from './ModeIcon';

interface MapPickerProps {
  maps: MapEntry[];
  /** 当前已选地图；作为首屏（尚未选图）时传空串 */
  current: string;
  onSelect: (mapName: string, mode: string) => void;
  /** 从 BP 界面切图进来时传入，用于显示返回按钮；首屏不传 */
  onClose?: () => void;
}

/** 搜索命中片段上色：把匹配到的字符挑出来，长列表里一眼看到为什么这张图被留下 */
function Highlight({ text, query }: { text: string; query: string }) {
  const q = query.trim().toLowerCase();
  if (!q) return <>{text}</>;
  const at = text.toLowerCase().indexOf(q);
  if (at < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, at)}
      <span className="text-brand">{text.slice(at, at + q.length)}</span>
      {text.slice(at + q.length)}
    </>
  );
}

/**
 * 选择地图页。
 *
 * 两种身份：
 *   1. 应用启动首屏（`onClose` 为空）→ 没有关闭按钮，必须先选一张图；
 *   2. 从 BP 顶栏点进来换图（传了 `onClose`）→ 右上角显示返回按钮。
 *
 * 布局是**一二级折叠**：一级按游戏模式分组（图标 + 模式名 + 地图数量 + 展开箭头），
 * 点标题展开该模式下的全部地图；二级是地图网格（缩略图 + 名称）。
 * 默认只展开「当前已选地图」所属的模式——六个模式全摊开会把首屏撑成一条长列表，
 * 想找别的模式反而要滑很久。
 *
 * 搜索保留：输入关键词后自动展开命中的分组并过滤，命中的字符在名称里上色。
 *
 * 它是「BP 助手」这个一级 Tab 下的一个页面（不是浮层）：撑满内容区，
 * 底部由 App 统一挂底部导航栏。内容区独立滚动，横屏矮屏幕下不会溢出截断。
 */
export default function MapPicker({ maps, current, onSelect, onClose }: MapPickerProps) {
  const { t, map: mapLabel, mode: modeLabel } = useTranslation();
  const { resolved: theme } = useTheme();
  const [query, setQuery] = useState('');

  /** 搜索框有内容时，系统返回键先清空搜索，而不是直接离开选图页 */
  useBackGuard(query !== '', () => setQuery(''));

  const grouped = useMemo(() => {
    const q = query.trim().toLowerCase();
    // 同时匹配英文原名与三种语言译名：换到英文界面后仍能按中文习惯找图
    const matched = maps.filter(
      (m) => !q || mapSearchNames(m.map_name).some((name) => name.toLowerCase().includes(q)),
    );
    return MODE_ORDER.map((mode) => ({
      mode,
      items: matched.filter((m) => m.mode === mode),
    })).filter((g) => g.items.length > 0);
  }, [maps, query]);

  const searching = query.trim().length > 0;
  const hitCount = grouped.reduce((n, g) => n + g.items.length, 0);

  /**
   * 展开状态（多开，非手风琴）：用户可以同时摊开几个模式对比着看。
   * 初始只展开当前地图所属模式；首屏还没选图时展开第一个有地图的模式，避免整页空白。
   */
  const [openModes, setOpenModes] = useState<Set<string>>(() => {
    const initial = new Set<string>();
    const currentMode = current ? maps.find((m) => m.map_name === current)?.mode : undefined;
    if (currentMode) initial.add(currentMode);
    else {
      const first = MODE_ORDER.find((mode) => maps.some((m) => m.mode === mode));
      if (first) initial.add(first);
    }
    return initial;
  });

  /** 搜索时自动展开所有命中分组（用户随后手动收起的不再强行打开） */
  useEffect(() => {
    if (!searching) return;
    setOpenModes((prev) => {
      let changed = false;
      const next = new Set(prev);
      for (const g of grouped) {
        if (!next.has(g.mode)) {
          next.add(g.mode);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [searching, grouped]);

  const toggleMode = (mode: string) => {
    setOpenModes((prev) => {
      const next = new Set(prev);
      if (next.has(mode)) next.delete(mode);
      else next.add(mode);
      return next;
    });
  };

  return (
    <div className="flex h-full min-h-0 flex-col bg-app animate-fade-in">
      <div className="shrink-0 border-b border-line px-2 pb-2 pt-2 safe-top">
        {/* 竖屏：标题一行 + 搜索一行；横屏：标题 / 搜索 / 关闭 同一行，省出的高度全给地图列表 */}
        <div className="grid grid-flow-row-dense grid-cols-[minmax(0,1fr)_auto] items-center gap-2 landscape:grid-cols-[auto_minmax(0,1fr)_auto] landscape:gap-3">
          <div className="min-w-0 landscape:flex landscape:items-baseline landscape:gap-2">
            <h2 className="text-[14px] font-semibold text-fg">{t('picker.title')}</h2>
            <p className="truncate text-[10px] text-subtle">
              {searching
                ? t('picker.matched', { n: hitCount })
                : t('picker.total', { n: maps.length })}
            </p>
          </div>
          <div className="relative col-span-2 landscape:col-span-1 landscape:col-start-2 landscape:row-start-1">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-subtle" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('picker.search')}
              className="h-9 w-full rounded-lg border border-line bg-raised pl-8 pr-8 text-[13px] text-fg placeholder:text-faint focus:border-line-strong focus:outline-none"
              spellCheck={false}
              autoComplete="off"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery('')}
                className="absolute right-1.5 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded text-subtle active:bg-press"
                aria-label={t('picker.clear')}
              >
                <X size={13} />
              </button>
            )}
          </div>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted active:bg-press landscape:col-start-3 landscape:row-start-1"
              aria-label={t('picker.back')}
            >
              <X size={16} />
            </button>
          )}
        </div>
      </div>

      {/* 内容区独立滚动：折叠后列表可能仍然很长，横屏矮屏幕也只滚这一块 */}
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 py-2">
        {grouped.length === 0 && (
          <p className="py-10 text-center text-[12px] text-subtle">{t('picker.empty')}</p>
        )}
        {grouped.map(({ mode, items }) => {
          const accent = themeAccent(modeColor(mode), theme);
          const open = openModes.has(mode);
          return (
            <section key={mode} className="mb-2.5">
              {/* 一级：模式标题整行可点，展开 / 收起该模式下的地图 */}
              <button
                type="button"
                onClick={() => toggleMode(mode)}
                aria-expanded={open}
                aria-controls={`map-group-${mode}`}
                className="flex w-full items-center gap-2 rounded-md border-l-[3px] px-2 py-1.5 text-left transition-colors active:bg-press/60"
                style={{ borderColor: accent, backgroundColor: `${accent}14` }}
              >
                <ModeIcon mode={mode} size={26} />
                <h3
                  className="min-w-0 truncate text-[17px] font-bold leading-none tracking-wide"
                  style={{ color: accent }}
                >
                  {modeLabel(mode)}
                </h3>
                <span className="ml-auto shrink-0 rounded bg-app/50 px-1.5 py-0.5 text-[11px] font-semibold tabular-nums text-muted">
                  {items.length}
                </span>
                <ChevronDown
                  size={16}
                  className={`shrink-0 text-subtle transition-transform duration-150 ${
                    open ? 'rotate-180' : ''
                  }`}
                />
              </button>

              {/* 二级：地图网格（缩略图 + 名称），当前已选地图高亮 */}
              {open && (
                <div
                  id={`map-group-${mode}`}
                  className="mt-2 grid grid-cols-2 gap-1.5 landscape:grid-cols-3 landscape:min-[900px]:grid-cols-4"
                >
                  {items.map((m) => {
                    const active = m.map_name === current;
                    return (
                      <button
                        key={m.map_name}
                        type="button"
                        onClick={() => onSelect(m.map_name, m.mode)}
                        className={`flex flex-col overflow-hidden rounded-lg border text-left transition-colors ${
                          active
                            ? 'border-sky-500/70 bg-sky-500/10'
                            : 'border-line bg-surface/70 shadow-card active:bg-press'
                        }`}
                      >
                        {/* 上图：整张竖向地图按原比例完整显示，不裁切；横屏压矮一点少滚动 */}
                        <MapThumb
                          mapName={m.map_name}
                          mode={m.mode}
                          variant="contain"
                          iconSize={22}
                          className="h-[152px] w-full landscape:h-[112px]"
                        />
                        {/* 下文 */}
                        <div className="w-full px-1.5 pb-1.5 pt-1">
                          <span className="flex items-center gap-1">
                            <span className="truncate text-[13px] font-semibold leading-tight text-fg">
                              <Highlight text={mapLabel(m.map_name)} query={query} />
                            </span>
                            {active && <Check size={11} className="shrink-0 text-brand" />}
                          </span>
                          <span className="mt-0.5 flex items-baseline justify-between gap-1">
                            <span className="truncate text-[9.5px] leading-tight text-subtle">
                              <Highlight text={m.map_name} query={query} />
                            </span>
                            <span className="shrink-0 text-[9.5px] leading-tight text-faint">
                              {t('common.games', { n: m.total_games })}
                            </span>
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}
