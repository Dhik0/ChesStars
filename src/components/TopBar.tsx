import { ChevronDown, Map as MapIcon } from 'lucide-react';
import { modeColor } from '../data/localization';
import { useTranslation } from '../i18n';
import MapThumb from './MapThumb';
import ModeIcon from './ModeIcon';

interface TopBarProps {
  mapName: string;
  mode: string;
  /** 本图排位样本总数 */
  mapGames: number;
  /** 数据门槛标签，如「传奇 I+」 */
  tierLabel: string;
  /** 数据日期（YYYY-MM-DD），未知时为 null */
  dataDate?: string | null;
  /** 点击整块地图详情 → 返回「选择地图」页换图 */
  onOpenMap: () => void;
  /**
   * 版式：
   *   - `card`（竖屏，默认）：160px 大地图详情卡，**不吸顶**，跟随英雄池一起向上滚走；
   *   - `strip`（横屏）：40px 单行紧凑地图条，固定在左栏顶部。
   */
  variant?: 'card' | 'strip';
}

/**
 * 顶部地图详情卡。
 *
 * 竖屏下它只是英雄池滚动容器里的第一块内容——进图时完整展示，
 * 往下滑就自然滚出视野，把整个上半屏让给英雄池（不再吸顶）。
 * 横屏下退化成单行地图条，省出的高度全给左栏的 Ban / 选角槽。
 *
 * 这里**不再有设置入口**：设置已升级为底部导航的一级页面，顶栏只负责「换地图」。
 */
export default function TopBar({
  mapName,
  mode,
  mapGames,
  tierLabel,
  dataDate = null,
  onOpenMap,
  variant = 'card',
}: TopBarProps) {
  const { t, map: mapLabel, mode: modeLabel, num } = useTranslation();
  const accent = modeColor(mode);

  /* ---------------- 横屏：单行紧凑地图条 ---------------- */
  if (variant === 'strip') {
    return (
      <div className="shrink-0 border-b border-slate-800/70 bg-slate-950/95 px-1.5 pb-1 pt-1 safe-top">
        <button
          type="button"
          onClick={onOpenMap}
          className="flex h-[38px] w-full min-w-0 items-center gap-1.5 rounded-lg border border-slate-800 bg-slate-900/80 px-1 transition-colors active:bg-slate-800"
          aria-label={t('topbar.switchMap')}
        >
          <MapThumb
            mapName={mapName}
            mode={mode}
            variant="cover"
            iconSize={13}
            className="h-[30px] w-[30px] shrink-0 rounded"
          />
          <span className="min-w-0 flex-1 truncate text-[13px] font-bold leading-tight text-slate-50">
            {mapLabel(mapName)}
          </span>
          <span className="h-3.5 w-px shrink-0 bg-slate-700" />
          <ModeIcon mode={mode} size={13} />
          <span
            className="max-w-[68px] shrink-0 truncate text-[10.5px] font-semibold leading-tight"
            style={{ color: accent }}
          >
            {modeLabel(mode)}
          </span>
          <ChevronDown size={12} className="shrink-0 text-slate-500" />
        </button>
      </div>
    );
  }

  /* ---------------- 竖屏：完整详情卡（随列表滚动） ---------------- */
  return (
    <div className="shrink-0 px-2 pb-1.5 pt-1.5 safe-top">
      <div className="relative h-[160px] rounded-xl border border-slate-800 bg-slate-900/80 p-1.5">
        <button
          type="button"
          onClick={onOpenMap}
          className="flex h-full w-full min-w-0 items-stretch gap-2 text-left transition-opacity active:opacity-80"
          aria-label={t('topbar.viewMap')}
        >
          {/* 左侧：整张竖向地图按原比例完整显示 */}
          <MapThumb
            mapName={mapName}
            mode={mode}
            variant="contain"
            iconSize={30}
            className="h-full w-[97px] shrink-0 rounded-lg"
          />

          {/* 右侧：名称 / 模式 / 样本量 / 门槛（底部留出换图按钮的位置） */}
          <span className="flex min-w-0 flex-1 flex-col pb-11 pr-1 pt-0.5">
            <span className="truncate text-[17px] font-bold leading-tight text-slate-50">
              {mapLabel(mapName)}
            </span>
            <span className="mt-0.5 truncate text-[10.5px] leading-tight text-slate-500">
              {mapName}
            </span>

            <span className="mt-1.5 flex items-center gap-1.5">
              <ModeIcon mode={mode} size={15} />
              <span
                className="truncate rounded px-1.5 py-0.5 text-[10.5px] font-semibold leading-tight"
                style={{ backgroundColor: `${accent}22`, color: accent }}
              >
                {modeLabel(mode)}
              </span>
            </span>

            <span className="mt-1.5 flex flex-wrap items-center gap-1">
              <span className="text-[10.5px] font-medium tabular-nums text-slate-300">
                {t('common.games', { n: num(mapGames) })}
              </span>
              <span className="text-[9px] text-slate-600">·</span>
              <span className="rounded bg-slate-800 px-1 py-px text-[9.5px] font-medium leading-tight text-slate-400">
                {tierLabel}
              </span>
              {dataDate && (
                <span
                  className="rounded bg-slate-800/60 px-1 py-px text-[9.5px] font-medium leading-tight tabular-nums text-slate-500"
                  title={t('topbar.dataDate')}
                >
                  {dataDate}
                </span>
              )}
            </span>
          </span>
        </button>

        {/* 换图入口：独立按钮，底色 + 描边 + 36px 热区，读秒时也能一眼看到 */}
        <button
          type="button"
          onClick={onOpenMap}
          className="absolute bottom-2 right-2 flex h-9 items-center gap-1.5 rounded-lg border border-sky-500/45 bg-sky-500/15 px-3 text-[12px] font-semibold text-sky-200 transition-colors active:border-sky-400 active:bg-sky-500/30 active:text-white"
          aria-label={t('topbar.switchMap')}
        >
          <MapIcon size={14} />
          {t('topbar.switchMap')}
        </button>
      </div>
    </div>
  );
}
