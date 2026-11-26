import { Sparkles, X } from 'lucide-react';
import { useTranslation } from '../i18n';

interface UpdateBannerProps {
  /** 远端版本号；null = 只知道「新版本已就绪」（版本号没变，Service Worker 换了新构建） */
  version: string | null;
  onUpdate: () => void;
  onDismiss: () => void;
}

/**
 * 网页端「发现新版本」提示条（仅 Web 渲染，原生壳走 UpdateDialog）。
 *
 * 刻意做成一条不抢眼的细条而不是弹窗：BP 进行中弹窗会挡住英雄池，
 * 而刷新时机本来就该由用户决定——不点就一直留着，点了才刷新。
 */
export default function UpdateBanner({ version, onUpdate, onDismiss }: UpdateBannerProps) {
  const { t } = useTranslation();

  return (
    <div className="shrink-0 border-b border-sky-500/25 bg-sky-500/[0.08] safe-top-banner">
      <div className="flex items-center gap-2 px-3 py-1.5">
        <Sparkles size={12} className="shrink-0 text-sky-400" />
        <button
          type="button"
          onClick={onUpdate}
          className="min-w-0 flex-1 truncate text-left text-[11.5px] font-medium text-sky-300 active:text-sky-200"
        >
          {version ? t('update.banner', { v: version }) : t('update.bannerReady')}
        </button>
        <button
          type="button"
          onClick={onUpdate}
          className="shrink-0 rounded-md bg-sky-600 px-2 py-1 text-[10.5px] font-semibold text-white active:bg-sky-700"
        >
          {t('update.bannerAction')}
        </button>
        <button
          type="button"
          onClick={onDismiss}
          aria-label={t('update.bannerDismiss')}
          className="shrink-0 rounded p-0.5 text-slate-500 active:bg-slate-800 active:text-slate-300"
        >
          <X size={12} />
        </button>
      </div>
    </div>
  );
}
