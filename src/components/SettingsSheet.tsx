import { useState } from 'react';
import { Database, Download, RefreshCw, Trash2, X } from 'lucide-react';
import type { MetaSnapshot, PullResult } from '../services/metaStore';
import { DEFAULT_REMOTE_URL } from '../services/metaStore';

interface SettingsSheetProps {
  snapshot: MetaSnapshot;
  onClose: () => void;
  onSaveUrl: (url: string) => void;
  onPull: () => Promise<PullResult>;
  onClearCache: () => Promise<void>;
}

const SOURCE_LABEL: Record<MetaSnapshot['source'], string> = {
  builtin: '内置数据',
  cache: '本地缓存',
  remote: '远程更新',
};

const SOURCE_STYLE: Record<MetaSnapshot['source'], string> = {
  builtin: 'bg-slate-700/60 text-slate-300',
  cache: 'bg-sky-500/20 text-sky-300',
  remote: 'bg-strong/20 text-strong',
};

function formatTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

/**
 * 段位门槛的可读文案：后端 tier_audit 里带中文标签时优先用它（如「传奇 I+」），
 * 否则退回数值段位。
 */
function tierLabel(snapshot: MetaSnapshot): string {
  const min = snapshot.meta.min_tier;
  const hit = snapshot.meta.tier_audit?.distribution.find((d) => d.tier === min);
  return hit?.label ? `${hit.label}+` : String(min);
}

/** 设置弹窗：远程数据源配置 + 手动刷新 + 缓存管理 */
export default function SettingsSheet({
  snapshot,
  onClose,
  onSaveUrl,
  onPull,
  onClearCache,
}: SettingsSheetProps) {
  const [url, setUrl] = useState(snapshot.remoteUrl);
  const [pulling, setPulling] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const handleSave = () => {
    onSaveUrl(url);
    setMessage({ ok: true, text: '地址已保存，下次检查将使用新地址' });
  };

  const handlePull = async () => {
    setPulling(true);
    setMessage(null);
    const res = await onPull();
    setMessage({ ok: res.ok, text: res.message });
    setPulling(false);
  };

  const handleClear = async () => {
    setClearing(true);
    setMessage(null);
    try {
      await onClearCache();
      setMessage({ ok: true, text: '已清除缓存，回退到内置数据' });
    } catch (err) {
      setMessage({ ok: false, text: err instanceof Error ? err.message : String(err) });
    } finally {
      setClearing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/60 animate-fade-in" onClick={onClose}>
      <div
        className="max-h-dvh-88 w-full overflow-y-auto overscroll-contain rounded-t-2xl border-t border-slate-700 bg-slate-900 animate-slide-up safe-bottom"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 flex items-center justify-between border-b border-slate-800 bg-slate-900/95 px-3 py-2.5 backdrop-blur">
          <h2 className="flex items-center gap-1.5 text-[14px] font-semibold text-slate-100">
            <Database size={14} className="text-sky-400" />
            数据与设置
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 active:bg-slate-800"
            aria-label="关闭"
          >
            <X size={16} />
          </button>
        </div>

        <div className="px-3 py-3">
          {/* 当前数据状态 */}
          <div className="mb-3 rounded-lg border border-slate-800 bg-slate-950/60 p-2.5">
            <div className="mb-1.5 flex items-center gap-1.5">
              <span
                className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${SOURCE_STYLE[snapshot.source]}`}
              >
                {SOURCE_LABEL[snapshot.source]}
              </span>
              <span className="text-[10px] text-slate-500">
                更新于 {formatTime(snapshot.updatedAt)}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-x-2 gap-y-1 text-[11px]">
              <span className="text-slate-500">
                总对局 <span className="tabular-nums text-slate-300">{snapshot.totalBattles.toLocaleString()}</span>
              </span>
              <span className="text-slate-500">
                最低段位 <span className="text-slate-300">{tierLabel(snapshot)}</span>
              </span>
              <span className="text-slate-500">
                地图 <span className="tabular-nums text-slate-300">{snapshot.meta.maps.length}</span>
              </span>
              <span className="text-slate-500">
                英雄 <span className="tabular-nums text-slate-300">{snapshot.meta.brawlers.length}</span>
              </span>
            </div>
            {snapshot.lastError && (
              <p className="mt-1.5 rounded bg-amber-500/10 px-1.5 py-1 text-[10px] leading-snug text-amber-400">
                {snapshot.lastError}
              </p>
            )}
          </div>

          {/* 远程地址 */}
          <label className="mb-1 block text-[11px] font-medium text-slate-400">
            远程数据地址（brawl_meta.json）
          </label>
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            spellCheck={false}
            placeholder={DEFAULT_REMOTE_URL}
            className="mb-1.5 h-9 w-full rounded-lg border border-slate-800 bg-slate-950 px-2 text-[11px] text-slate-200 placeholder:text-slate-600 focus:border-sky-600 focus:outline-none"
          />
          <div className="mb-3 flex gap-1.5">
            <button
              type="button"
              onClick={handleSave}
              className="h-8 flex-1 rounded-lg border border-slate-700 bg-slate-800 text-[12px] font-medium text-slate-200 active:bg-slate-700"
            >
              保存地址
            </button>
            <button
              type="button"
              onClick={() => setUrl(DEFAULT_REMOTE_URL)}
              className="h-8 rounded-lg border border-slate-800 px-2 text-[11px] text-slate-400 active:bg-slate-800"
            >
              恢复默认
            </button>
          </div>

          {/* 操作按钮 */}
          <button
            type="button"
            onClick={handlePull}
            disabled={pulling}
            className="mb-1.5 flex h-10 w-full items-center justify-center gap-1.5 rounded-lg bg-sky-600 text-[13px] font-semibold text-white transition-colors active:bg-sky-700 disabled:opacity-60"
          >
            {pulling ? <RefreshCw size={14} className="animate-spin" /> : <Download size={14} />}
            {pulling ? '正在拉取…' : '立即拉取最新数据'}
          </button>

          <button
            type="button"
            onClick={handleClear}
            disabled={clearing}
            className="flex h-9 w-full items-center justify-center gap-1.5 rounded-lg border border-slate-800 text-[12px] text-slate-400 active:bg-slate-800 disabled:opacity-60"
          >
            <Trash2 size={13} />
            {clearing ? '正在清除…' : '清除本地缓存（回退内置数据）'}
          </button>

          {message && (
            <p
              className={`mt-2 rounded-lg px-2 py-1.5 text-[11px] leading-snug ${
                message.ok ? 'bg-strong/10 text-strong' : 'bg-red-500/10 text-red-400'
              }`}
            >
              {message.text}
            </p>
          )}

          <p className="mt-3 text-[10px] leading-relaxed text-slate-600">
            启动时会静默检查远程更新（5 秒超时自动放弃，不阻塞界面）。断网时自动使用本地缓存或内置数据，可零延迟打开。
          </p>

          <p className="mt-4 text-center text-[10px] text-slate-700">ChesStars 1.0</p>
        </div>
      </div>
    </div>
  );
}
