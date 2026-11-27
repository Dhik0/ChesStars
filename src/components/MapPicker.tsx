import { useState } from 'react';
import { Check, ChevronDown, X } from 'lucide-react';
import type { MapEntry } from '../types/meta';
import { MODE_ORDER, modeColor } from '../data/localization';
import { useTranslation } from '../i18n';
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
 * 它是「BP 助手」这个一级 Tab 下的一个页面（不是浮层）：撑满内容区，
 * 底部由 App 统一挂底部导航栏。内容区独立滚动，横屏矮屏幕下不会溢出截断。
 */
export default function MapPicker({ maps, current, onSelect, onClose }: MapPickerProps) {
  const { t, map: mapLabel, mode: modeLabel } = useTranslation();
  const { resolved: theme } = useTheme();

  const grouped = MODE_ORDER.map((mode) => ({
    mode,
    items: maps.filter((m) => m.mode === mode),
  })).filter((g) => g.items.length > 0);

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
        <div className="flex items-center gap-2">
          <div className="min-w-0 flex items-baseline gap-2">
            <h2 className="shrink-0 text-[14px] font-semibold text-fg">{t('picker.title')}</h2>
            <p className="truncate text-[10px] text-subtle">
              {t('picker.total', { n: maps.length })}
            </p>
          </div>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="ml-auto flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted active:bg-press"
              aria-label={t('picker.back')}
            >
              <X size={16} />
            </button>
          )}
        </div>
      </div>

      {/* 内容区独立滚动：折叠后列表可能仍然很长，横屏矮屏幕也只滚这一块 */}
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 py-2">
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
                className="flex w-full items-center gap-2 rounded-[14px] border-l-[3px] px-2 py-1.5 text-left transition-colors active:bg-press/60"
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
                        className={`flex flex-col overflow-hidden rounded-[18px] border text-left transition-colors ${
                          active
                            ? 'border-accent/70 bg-accent-soft'
                            : 'border-line bg-card/70 shadow-card active:bg-press'
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
                              {mapLabel(m.map_name)}
                            </span>
                            {active && <Check size={11} className="shrink-0 text-accent" />}
                          </span>
                          <span className="mt-0.5 flex items-baseline justify-between gap-1">
                            <span className="truncate text-[9.5px] leading-tight text-subtle">
                              {m.map_name}
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
