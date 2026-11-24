import { useMemo, useState } from 'react';
import { Check, Search, X } from 'lucide-react';
import type { MapEntry } from '../types/meta';
import { mapCN, MODE_LOCALE, MODE_ORDER, modeColor } from '../data/localization';
import { useBackGuard } from '../utils/backGuards';
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

/**
 * 选择地图页。
 *
 * 两种身份：
 *   1. 应用启动首屏（`onClose` 为空）→ 没有关闭按钮，必须先选一张图；
 *   2. 从 BP 顶栏点进来换图（传了 `onClose`）→ 右上角显示返回按钮。
 *
 * 布局：按 6 个模式分组，每组竖屏两列、横屏三到四列自适应网格，
 * 卡片内左侧是地图缩略图。分组头放大模式图标 + 标题，滑动时能一眼认出模式。
 *
 * 它是「BP 助手」这个一级 Tab 下的一个页面（不是浮层）：撑满内容区，
 * 底部由 App 统一挂底部导航栏。
 */
export default function MapPicker({ maps, current, onSelect, onClose }: MapPickerProps) {
  const [query, setQuery] = useState('');

  /** 搜索框有内容时，系统返回键先清空搜索，而不是直接离开选图页 */
  useBackGuard(query !== '', () => setQuery(''));

  const grouped = useMemo(() => {
    const q = query.trim().toLowerCase();
    const matched = maps.filter((m) => {
      if (!q) return true;
      return m.map_name.toLowerCase().includes(q) || mapCN(m.map_name).includes(q);
    });
    return MODE_ORDER.map((mode) => ({
      mode,
      items: matched.filter((m) => m.mode === mode),
    })).filter((g) => g.items.length > 0);
  }, [maps, query]);

  const hitCount = grouped.reduce((n, g) => n + g.items.length, 0);

  return (
    <div className="flex h-full min-h-0 flex-col bg-slate-950 animate-fade-in">
      <div className="shrink-0 border-b border-slate-800 px-2 pb-2 pt-2 safe-top">
        {/* 竖屏：标题一行 + 搜索一行；横屏：标题 / 搜索 / 关闭 同一行，省出的高度全给地图网格 */}
        <div className="grid grid-flow-row-dense grid-cols-[minmax(0,1fr)_auto] items-center gap-2 landscape:grid-cols-[auto_minmax(0,1fr)_auto] landscape:gap-3">
          <div className="min-w-0 landscape:flex landscape:items-baseline landscape:gap-2">
            <h2 className="text-[14px] font-semibold text-slate-100">选择地图</h2>
            <p className="truncate text-[10px] text-slate-500">
              {query ? `匹配 ${hitCount} 张` : `共 ${maps.length} 张 · 点选后进入 BP`}
            </p>
          </div>
          <div className="relative col-span-2 landscape:col-span-1 landscape:col-start-2 landscape:row-start-1">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="搜地图（中文 / 英文）"
              className="h-9 w-full rounded-lg border border-slate-800 bg-slate-900 pl-8 pr-8 text-[13px] text-slate-100 placeholder:text-slate-600 focus:border-slate-600 focus:outline-none"
              spellCheck={false}
              autoComplete="off"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery('')}
                className="absolute right-1.5 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded text-slate-500 active:bg-slate-800"
                aria-label="清空"
              >
                <X size={13} />
              </button>
            )}
          </div>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-400 active:bg-slate-800 landscape:col-start-3 landscape:row-start-1"
              aria-label="返回"
            >
              <X size={16} />
            </button>
          )}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 py-2">
        {grouped.length === 0 && (
          <p className="py-10 text-center text-[12px] text-slate-500">没有匹配的地图</p>
        )}
        {grouped.map(({ mode, items }) => {
          const accent = modeColor(mode);
          return (
            <section key={mode} className="mb-4">
              {/* 分组头：放大模式图标与标题 + 主题色底条，滑动时一眼认模式 */}
              <div
                className="mb-2 flex items-center gap-2 rounded-md border-l-[3px] px-2 py-1.5"
                style={{ borderColor: accent, backgroundColor: `${accent}14` }}
              >
                <ModeIcon mode={mode} size={28} />
                <h3
                  className="text-[19px] font-bold leading-none tracking-wide"
                  style={{ color: accent }}
                >
                  {MODE_LOCALE[mode].cn}
                </h3>
                <span className="ml-auto rounded bg-slate-950/50 px-1.5 py-0.5 text-[11px] font-semibold tabular-nums text-slate-400">
                  {items.length}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-1.5 landscape:grid-cols-3 landscape:min-[900px]:grid-cols-4">
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
                          : 'border-slate-800 bg-slate-900/70 active:bg-slate-800'
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
                          <span className="truncate text-[13px] font-semibold leading-tight text-slate-100">
                            {mapCN(m.map_name)}
                          </span>
                          {active && <Check size={11} className="shrink-0 text-sky-400" />}
                        </span>
                        <span className="mt-0.5 flex items-baseline justify-between gap-1">
                          <span className="truncate text-[9.5px] leading-tight text-slate-500">
                            {m.map_name}
                          </span>
                          <span className="shrink-0 text-[9.5px] leading-tight text-slate-600">
                            {m.total_games} 场
                          </span>
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
