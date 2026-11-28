import { useEffect, useRef, useState } from 'react';
import { Download, Sparkles, X } from 'lucide-react';
import { useTranslation } from '../i18n';
import { mirrorDownloadUrl, type UpdateInfo } from '../services/updateChecker';
import { useModalFocus } from '../utils/modalFocus';
import { openExternal } from '../utils/openExternal';

/** 与 index.css 的 m3-dialog-out 一致：退场播完再通知外层卸载 */
const DIALOG_EXIT_MS = 180;

interface UpdateDialogProps {
  info: UpdateInfo;
  /** 当前版本号，用于「v1.1.0 → v1.2.0」对比 */
  current: string;
  /** 暂不更新：只关闭弹窗，下次启动还会提示 */
  onClose: () => void;
  /** 忽略此版本：写入本地，同一版本不再自动弹出 */
  onIgnore: () => void;
  /** 前往下载：系统浏览器打开 Release 页 */
  onDownload: () => void;
}

function formatDate(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')}`;
}

/**
 * 新版本提示弹窗。
 *
 * 用居中弹窗而不是底部横幅：更新是「需要用户决策一次」的事件，
 * 横幅容易被忽略，而弹窗能一次把版本号、更新日志和下载入口说清楚。
 *
 * 按钮层级固定：主按钮永远是 GitHub Release 页（全宽高亮），
 * 国内镜像只作为简中界面里的小字备用入口，其余语言完全不渲染。
 */
export default function UpdateDialog({
  info,
  current,
  onClose,
  onIgnore,
  onDownload,
}: UpdateDialogProps) {
  const { t, lang } = useTranslation();
  const published = formatDate(info.publishedAt);
  const dialogRef = useRef<HTMLDivElement>(null);
  useModalFocus(dialogRef);
  const [closing, setClosing] = useState(false);
  const finished = useRef(false);
  const closeTimer = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (closeTimer.current !== null) window.clearTimeout(closeTimer.current);
    },
    [],
  );

  /** 关闭 / 忽略都先播退场，再让外层卸载；finished 保证只消费一次 */
  const beginClose = (action: () => void) => {
    if (finished.current) return;
    finished.current = true;
    setClosing(true);
    closeTimer.current = window.setTimeout(() => {
      action();
      closeTimer.current = null;
    }, DIALOG_EXIT_MS);
  };

  /**
   * 备用下载入口：只有简中界面才出现。
   * 繁中 / 英文用户的主入口就是 GitHub Release 页，界面上不留任何镜像痕迹。
   */
  const mirrorUrl =
    lang === 'zh-CN' ? mirrorDownloadUrl(info.mirrorPrefixes, info.apkUrl) : null;

  return (
    <div
      className={`fixed inset-0 z-[60] flex items-center justify-center scrim-strong px-4 ${
        closing ? 'm3-scrim-out' : 'm3-scrim-in'
      }`}
      onClick={() => beginClose(onClose)}
      role="presentation"
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        className={`w-full max-w-[360px] overflow-hidden rounded-2xl border border-line-strong bg-surface shadow-2xl ${
          closing ? 'm3-dialog-out' : 'm3-dialog-in'
        }`}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="update-dialog-title"
      >
        <div className="flex items-start justify-between gap-2 px-3.5 pb-2 pt-3.5">
          <div className="flex items-center gap-2">
            <span className="bg-accent-soft flex h-8 w-8 items-center justify-center rounded-[14px] text-accent">
              <Sparkles size={16} />
            </span>
            <div className="leading-tight">
              <h2 id="update-dialog-title" className="text-[14px] font-semibold text-fg">
                {t('update.title')}
              </h2>
              <p className="text-[10px] text-subtle">
                {t('update.current', { v: current })}
                {published && (
                  <span className="ml-1.5">{t('update.published', { d: published })}</span>
                )}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => beginClose(onClose)}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-subtle active:bg-press"
            aria-label={t('common.close')}
          >
            <X size={15} />
          </button>
        </div>

        <div className="px-3.5">
          <p className="mb-2 text-[15px] font-bold text-accent">v{info.version}</p>

          {info.notes ? (
            <div className="max-h-[36vh] overflow-y-auto overscroll-contain whitespace-pre-line rounded-lg border border-line bg-app/70 p-2 text-[11px] leading-relaxed text-muted">
              {info.notes}
            </div>
          ) : (
            <p className="rounded-lg border border-line bg-app/70 p-2 text-[11px] leading-relaxed text-subtle">
              {t('update.noNotes')}
            </p>
          )}
        </div>

        <div className="px-3.5 pb-3.5 pt-2.5">
          {/* 主按钮：GitHub Release 页（全宽高亮），走系统浏览器打开 */}
          <button
            type="button"
            onClick={onDownload}
            className="bg-accent text-accent-on flex h-11 w-full items-center justify-center gap-1.5 rounded-[16px] text-[13px] font-semibold transition-opacity active:opacity-80"
          >
            <Download size={14} />
            {t('update.downloadGithub')}
          </button>

          {mirrorUrl && (
            <div className="mt-2 text-center">
              <button
                type="button"
                onClick={() => openExternal(mirrorUrl)}
                className="text-[10.5px] text-muted underline decoration-slate-600 underline-offset-2 active:text-fg"
              >
                {t('update.mirror')}
              </button>
            </div>
          )}

          <div className="mt-2.5 flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => beginClose(onClose)}
              className="h-9 flex-1 rounded-lg border border-line text-[12px] text-muted active:bg-press"
            >
              {t('update.later')}
            </button>
            <button
              type="button"
              onClick={() => beginClose(onIgnore)}
              className="h-9 shrink-0 rounded-lg px-2.5 text-[11px] text-faint active:bg-press"
            >
              {t('update.ignore')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
