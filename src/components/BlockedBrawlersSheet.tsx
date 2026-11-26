import { EyeOff, Trash2, X } from 'lucide-react';
import { useTranslation } from '../i18n';
import Avatar from './Avatar';

interface BlockedBrawlersSheetProps {
  /** 已屏蔽的英雄 ID（按屏蔽顺序） */
  ids: number[];
  /** 查英文原名；数据里已不存在的老 ID 返回 undefined */
  nameOf: (id: number) => string | undefined;
  onUnblock: (id: number) => void;
  onClear: () => void;
  onClose: () => void;
}

/**
 * 「已屏蔽」集中管理弹层。
 *
 * 从筛选栏右侧的胶囊标签进入：列出全部屏蔽英雄，支持逐个解除或一键清空。
 * 只是名单管理，不参与任何算分，也不改 BP 状态。
 */
export default function BlockedBrawlersSheet({
  ids,
  nameOf,
  onUnblock,
  onClear,
  onClose,
}: BlockedBrawlersSheetProps) {
  const { t, brawler } = useTranslation();

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/60 animate-fade-in" onClick={onClose}>
      <div
        className="max-h-dvh-86 w-full max-w-[440px] mx-auto overflow-hidden rounded-t-2xl border-t border-slate-700 bg-slate-900 pb-3 animate-slide-up safe-bottom"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b border-slate-800 px-3 py-2.5">
          <EyeOff size={14} className="shrink-0 text-slate-400" />
          <h2 className="min-w-0 flex-1 truncate text-[14px] font-bold text-white">
            {t('blocked.title')}
          </h2>
          <span className="shrink-0 rounded bg-slate-800 px-1.5 py-0.5 text-[11px] font-semibold tabular-nums text-slate-400">
            {ids.length}
          </span>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-500 active:bg-slate-800"
            aria-label={t('common.close')}
          >
            <X size={16} />
          </button>
        </div>

        {ids.length === 0 ? (
          <p className="px-3 py-8 text-center text-[12px] text-slate-500">{t('blocked.empty')}</p>
        ) : (
          <>
            <ul className="max-h-[52vh] divide-y divide-slate-800/70 overflow-y-auto overscroll-contain px-2 py-1">
              {ids.map((id) => {
                const name = nameOf(id);
                return (
                  <li key={id} className="flex items-center gap-2 py-1.5">
                    <Avatar id={id} name={name ?? ''} size={30} />
                    <span className="min-w-0 flex-1 truncate text-[13px] text-slate-200">
                      {name ? brawler(name) : `#${id}`}
                    </span>
                    <button
                      type="button"
                      onClick={() => onUnblock(id)}
                      className="shrink-0 rounded-md border border-slate-700 px-2 py-1 text-[11px] font-medium text-slate-300 active:bg-slate-800"
                    >
                      {t('blocked.unblockOne')}
                    </button>
                  </li>
                );
              })}
            </ul>
            <div className="px-2 pt-1.5">
              <button
                type="button"
                onClick={onClear}
                className="flex h-9 w-full items-center justify-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800/60 text-[12px] font-semibold text-slate-300 active:bg-slate-800"
              >
                <Trash2 size={13} />
                {t('blocked.clearAll')}
              </button>
            </div>
          </>
        )}

        <p className="px-3 pt-2 text-[10px] leading-relaxed text-slate-500">{t('blocked.hint')}</p>
      </div>
    </div>
  );
}
