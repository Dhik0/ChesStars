import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { useTranslation } from '../i18n';
import type { CustomAccent } from '../services/themeStore';
import { useModalFocus } from '../utils/modalFocus';
import { useTheme } from '../utils/useTheme';

/**
 * 调色盘里的可选色阶：每行一个色相，从左到右由浅到深。
 * 取自 HyperOS 主题色的常用色板，全部是中高亮度的粉彩——
 * 微染会把它们掺进整张卡片 9%，过暗或过饱和都会让卡片糊成一块。
 */
const SWATCH_ROWS: readonly (readonly [number, number, number])[][] = [
  [
    [136, 232, 216],
    [92, 205, 190],
    [54, 172, 162],
    [34, 135, 133],
    [26, 100, 103],
  ],
  [
    [147, 197, 253],
    [96, 165, 250],
    [62, 130, 226],
    [42, 97, 183],
    [32, 70, 140],
  ],
  [
    [196, 181, 253],
    [161, 135, 244],
    [126, 100, 220],
    [96, 71, 180],
    [70, 51, 140],
  ],
  [
    [252, 211, 154],
    [246, 173, 85],
    [224, 141, 52],
    [183, 108, 37],
    [138, 79, 28],
  ],
  [
    [249, 180, 205],
    [246, 135, 179],
    [222, 100, 150],
    [183, 70, 118],
    [140, 50, 88],
  ],
  [
    [179, 182, 190],
    [138, 142, 153],
    [104, 108, 121],
    [76, 79, 91],
    [52, 54, 64],
  ],
];

/** 退场动画时长：必须 > CSS 的 185ms，动画播完才卸载 DOM */
const CLOSE_MS = 190;

interface ThemeColorSheetProps {
  current: CustomAccent;
  onSave: (accent: CustomAccent) => void;
  onClose: () => void;
}

/** 把调色盘选中的色相（固定 alpha=1 的三个通道）套用当前透明度 */
function withAlpha(base: CustomAccent, a: number): CustomAccent {
  return { ...base, a };
}

type PendingAction = 'close' | 'save';

/**
 * 主题色调色盘：从底部推入的模态抽屉。
 *
 * 交互对应范本 app：顶部一条预览带显示当前色 + 透明度，
 * 中间是色相 × 明度的平涂色板，底部是透明度滑块与取消 / 保存。
 * 保存前只改本地草稿色，取消不写盘；保存时交回 themeStore 统一落盘并开启微染。
 *
 * 双态挂载：关闭先进入 closing 态播 185ms 退场，190ms 后才调外部 onClose/onSave。
 * Escape 在 document 捕获阶段拦下，避免 App 的 window 监听直接卸载组件导致动画被跳过。
 */
export default function ThemeColorSheet({ current, onSave, onClose }: ThemeColorSheetProps) {
  const { t } = useTranslation();
  const dialogRef = useRef<HTMLDivElement>(null);
  useModalFocus(dialogRef);
  const { monetEnabled } = useTheme();

  const [draft, setDraft] = useState<CustomAccent>(current);
  const [closing, setClosing] = useState(false);
  const finished = useRef(false);
  const closeTimer = useRef<number | null>(null);
  const pending = useRef<PendingAction>('close');
  // 定时器回调读得到最新草稿：保存时用户可能刚调完透明度
  const draftRef = useRef(draft);
  draftRef.current = draft;

  const commit = useCallback(() => {
    if (finished.current) return;
    finished.current = true;
    if (pending.current === 'save') onSave(draftRef.current);
    else onClose();
  }, [onSave, onClose]);

  const requestClose = useCallback(
    (action: PendingAction) => {
      if (finished.current || closeTimer.current !== null) return;
      pending.current = action;
      setClosing(true);
      closeTimer.current = window.setTimeout(commit, CLOSE_MS);
    },
    [commit],
  );

  useEffect(
    () => () => {
      if (closeTimer.current !== null) window.clearTimeout(closeTimer.current);
    },
    [],
  );

  // Escape 优先于 App 的 window 监听：捕获阶段拦下，走同一条退场流程
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      requestClose('close');
    };
    document.addEventListener('keydown', onKeyDown, true);
    return () => document.removeEventListener('keydown', onKeyDown, true);
  }, [requestClose]);

  // 关闭 Monet 时一并收起调色盘：检测 monetEnabled 的下降沿
  const wasMonet = useRef(monetEnabled);
  useEffect(() => {
    if (wasMonet.current && !monetEnabled) requestClose('close');
    wasMonet.current = monetEnabled;
  }, [monetEnabled, requestClose]);

  const selectSwatch = (rgb: readonly [number, number, number]) => {
    setDraft((prev) => ({ r: rgb[0], g: rgb[1], b: rgb[2], a: prev.a }));
  };

  const previewRgb = `${draft.r} ${draft.g} ${draft.b}`;
  const motion = closing ? 'theme-color-out' : 'theme-color-in';
  const scrimMotion = closing ? 'theme-color-scrim-out' : 'theme-color-scrim-in';

  return (
    <div className={`fixed inset-0 z-50 flex items-end scrim ${scrimMotion}`} onClick={() => requestClose('close')}>
      <div
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={t('settings.themeColorTitle')}
        className={`mx-auto w-full max-w-[440px] rounded-t-2xl border-t border-line-strong bg-surface pb-3 shadow-card safe-bottom ${motion}`}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="py-3 text-center text-[15px] font-medium text-fg">
          {t('settings.themeColorTitle')}
        </h2>

        {/* 预览带：棋盘格底 + 当前色，透明度低时能看到下面的格子 */}
        <div className="px-4">
          <div className="theme-alpha-checker h-11 overflow-hidden rounded-[14px]">
            <div
              className="h-full w-full"
              style={{ backgroundColor: `rgb(${previewRgb} / ${draft.a})` }}
            />
          </div>
        </div>

        {/* 色板：6 行 × 5 列平涂色块，选中项加一圈中性描边 */}
        <div className="px-4 pt-3">
          <div className="grid grid-cols-5 gap-2">
            {SWATCH_ROWS.flatMap((row, rowIndex) =>
              row.map((rgb, colIndex) => {
                const active = draft.r === rgb[0] && draft.g === rgb[1] && draft.b === rgb[2];
                return (
                  <button
                    key={`${rowIndex}-${colIndex}`}
                    type="button"
                    onClick={() => selectSwatch(rgb)}
                    aria-label={t('settings.themeColorSwatch', { n: rowIndex * 5 + colIndex + 1 })}
                    aria-pressed={active}
                    className={`theme-swatch h-10 rounded-[10px] ${
                      active ? 'ring-2 ring-fg ring-offset-2 ring-offset-surface' : ''
                    }`}
                    style={{ backgroundColor: `rgb(${rgb[0]} ${rgb[1]} ${rgb[2]})` }}
                  />
                );
              }),
            )}
          </div>
        </div>

        {/* 透明度：轨道底色跟随当前色，从透明过渡到实心 */}
        <div className="px-4 pt-4">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[13px] text-body">{t('settings.themeColorOpacity')}</span>
            <span className="text-[12px] tabular-nums text-muted">{Math.round(draft.a * 100)}%</span>
          </div>
          <input
            type="range"
            min={0}
            max={100}
            step={1}
            value={Math.round(draft.a * 100)}
            onChange={(e) => setDraft(withAlpha(draft, Number(e.target.value) / 100))}
            aria-label={t('settings.themeColorOpacity')}
            className="theme-alpha-range h-8 w-full"
            style={{ '--range-color': previewRgb } as CSSProperties}
          />
        </div>

        <div className="flex gap-2.5 px-4 pt-3">
          <button
            type="button"
            onClick={() => requestClose('close')}
            className="h-11 flex-1 rounded-[16px] border border-line-strong bg-raised text-[14px] font-medium text-body active:bg-press"
          >
            {t('settings.themeColorCancel')}
          </button>
          <button
            type="button"
            onClick={() => requestClose('save')}
            className="bg-accent text-accent-on h-11 flex-[1.4] rounded-[16px] text-[14px] font-medium active:opacity-80"
          >
            {t('settings.themeColorSave')}
          </button>
        </div>
      </div>
    </div>
  );
}
