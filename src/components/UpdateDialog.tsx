import { Download, Sparkles, X } from 'lucide-react';
import type { UpdateInfo } from '../services/updateChecker';

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
 * 横幅容易被忽略，而弹窗能一次把版本号、更新日志、两个出口说清楚。
 */
export default function UpdateDialog({
  info,
  current,
  onClose,
  onIgnore,
  onDownload,
}: UpdateDialogProps) {
  const published = formatDate(info.publishedAt);

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 px-4 animate-fade-in"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="w-full max-w-[360px] overflow-hidden rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl animate-slide-up"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="update-dialog-title"
      >
        <div className="flex items-start justify-between gap-2 px-3.5 pb-2 pt-3.5">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-sky-500/15 text-sky-400">
              <Sparkles size={16} />
            </span>
            <div className="leading-tight">
              <h2 id="update-dialog-title" className="text-[14px] font-semibold text-slate-100">
                发现新版本
              </h2>
              <p className="text-[10px] text-slate-500">
                当前 v{current}
                {published && <span className="ml-1.5">· 发布于 {published}</span>}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-slate-500 active:bg-slate-800"
            aria-label="关闭"
          >
            <X size={15} />
          </button>
        </div>

        <div className="px-3.5">
          <p className="mb-2 text-[15px] font-bold text-sky-300">v{info.version}</p>

          {info.notes ? (
            <div className="max-h-[36vh] overflow-y-auto overscroll-contain whitespace-pre-line rounded-lg border border-slate-800 bg-slate-950/70 p-2 text-[11px] leading-relaxed text-slate-400">
              {info.notes}
            </div>
          ) : (
            <p className="rounded-lg border border-slate-800 bg-slate-950/70 p-2 text-[11px] leading-relaxed text-slate-500">
              该版本没有填写更新说明，可前往 Release 页面查看详情。
            </p>
          )}
        </div>

        <div className="px-3.5 pb-3.5 pt-2.5">
          <button
            type="button"
            onClick={onDownload}
            className="mb-1.5 flex h-10 w-full items-center justify-center gap-1.5 rounded-lg bg-sky-600 text-[13px] font-semibold text-white transition-colors active:bg-sky-700"
          >
            <Download size={14} />
            前往下载 / 查看 Release
          </button>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={onClose}
              className="h-9 flex-1 rounded-lg border border-slate-700 bg-slate-800/70 text-[12px] font-medium text-slate-300 active:bg-slate-800"
            >
              暂不更新
            </button>
            <button
              type="button"
              onClick={onIgnore}
              className="h-9 flex-1 rounded-lg border border-slate-800 text-[12px] text-slate-500 active:bg-slate-800"
            >
              忽略此版本
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
