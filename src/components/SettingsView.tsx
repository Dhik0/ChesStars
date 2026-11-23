import { useState } from 'react';
import {
  ChevronRight,
  Database,
  Download,
  ExternalLink,
  Github,
  RefreshCw,
  Settings,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { APP_NAME, APP_VERSION, GITHUB_REPO, GITHUB_REPO_URL } from '../config/app';
import type { MetaSnapshot, PullResult } from '../services/metaStore';
import { DEFAULT_REMOTE_URL } from '../services/metaStore';
import { META_CHANNEL_LABEL, META_DOWNLOAD_TIMEOUT_MS } from '../services/metaRemote';
import type { UpdateCheckResult, UpdateInfo } from '../services/updateChecker';
import { mirrorDownloadUrl } from '../services/updateChecker';
import { openExternal } from '../utils/openExternal';

interface SettingsViewProps {
  snapshot: MetaSnapshot;
  onSaveUrl: (url: string) => void;
  onPull: () => Promise<PullResult>;
  onClearCache: () => Promise<void>;
  /** 已发现的新版本（启动检测或手动检测得出）；null = 没有更新 */
  updateInfo: UpdateInfo | null;
  /** 手动检查更新，返回结构化结果供按钮旁反馈 */
  onCheckUpdate: () => Promise<UpdateCheckResult>;
  /** 打开更新弹窗（点顶部横幅） */
  onShowUpdate: () => void;
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

interface CheckMessage {
  tone: 'ok' | 'warn' | 'error';
  text: string;
}

const CHECK_TONE: Record<CheckMessage['tone'], string> = {
  ok: 'bg-strong/10 text-strong',
  warn: 'bg-sky-500/10 text-sky-300',
  error: 'bg-red-500/10 text-red-400',
};

/** 小节标题：一条细线 + 标签，把「数据」与「关于」两块分开 */
function SectionLabel({ children }: { children: string }) {
  return (
    <div className="mb-2 flex items-center gap-2">
      <span className="text-[10px] font-semibold tracking-wide text-slate-500">{children}</span>
      <span className="h-px flex-1 bg-slate-800" />
    </div>
  );
}

/**
 * 设置页（一级页面，由底部导航右侧 Tab 进入）。
 *
 * 原先是藏在顶栏齿轮里的二级抽屉，现在整页展示：数据源状态 / 手动刷新 / 缓存管理 /
 * 版本与开源入口都在一屏里滚动可见，不再有遮罩层，也不再挤占 BP 页。
 */
export default function SettingsView({
  snapshot,
  onSaveUrl,
  onPull,
  onClearCache,
  updateInfo,
  onCheckUpdate,
  onShowUpdate,
}: SettingsViewProps) {
  const [url, setUrl] = useState(snapshot.remoteUrl);
  const [pulling, setPulling] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [checking, setChecking] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [checkMsg, setCheckMsg] = useState<CheckMessage | null>(null);

  /**
   * 下载入口：主按钮走国内加速（镜像前缀 + APK 直链），
   * 拿不到 APK 直链时退到 Release 页面，至少不会出现点了没反应的按钮。
   */
  const apkUrl = updateInfo?.apkUrl ?? null;
  const mirrorUrl = updateInfo ? mirrorDownloadUrl(updateInfo.mirrorPrefixes, apkUrl) : null;
  const primaryDownloadUrl = mirrorUrl ?? apkUrl ?? updateInfo?.htmlUrl ?? null;
  const primaryDownloadLabel = apkUrl ? '国内加速下载' : '前往 Release 页';
  const qqGroupUrl = updateInfo?.qqGroupUrl ?? null;

  const handleSave = () => {
    onSaveUrl(url);
    const trimmed = url.trim();
    setMessage({
      ok: true,
      text:
        !trimmed || trimmed === DEFAULT_REMOTE_URL
          ? '已恢复默认三段式拉取链路（提交 SHA → jsDelivr → Raw）'
          : '地址已保存，下次拉取将只使用该地址',
    });
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

  const handleCheckUpdate = async () => {
    setChecking(true);
    setCheckMsg(null);
    const viaLabel = (via: UpdateCheckResult['via']): string =>
      via === 'manifest' ? '版本清单' : via === 'releases' ? 'Releases API' : '未知通道';
    try {
      const res = await onCheckUpdate();
      if (res.status === 'update' && res.info) {
        setCheckMsg({
          tone: 'warn',
          text: `发现新版本 v${res.info.version}（经${viaLabel(res.via)}），可直接在上方下载`,
        });
      } else if (res.status === 'latest') {
        setCheckMsg({
          tone: 'ok',
          text: `已是最新版本（v${res.current}）· 经${viaLabel(res.via)}检测`,
        });
      } else {
        setCheckMsg({ tone: 'error', text: `检查失败：${res.reason ?? '网络异常'}` });
      }
    } catch (err) {
      setCheckMsg({
        tone: 'error',
        text: `检查失败：${err instanceof Error ? err.message : String(err)}`,
      });
    } finally {
      setChecking(false);
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col bg-slate-950">
      {/* 页头：与选图页同款细边框 + 安全区留白 */}
      <header className="shrink-0 border-b border-slate-800 px-3 pb-2 pt-2 safe-top">
        <h1 className="flex items-center gap-1.5 text-[14px] font-semibold text-slate-100">
          <Settings size={15} className="text-sky-400" />
          设置
        </h1>
        <p className="mt-0.5 text-[10px] leading-tight text-slate-500">
          数据源与版本 · {APP_NAME} v{APP_VERSION}
        </p>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pb-5 pt-3">
        {/*
          新版本提示：留在设置页内，不做全局弹窗。
          一条低调的卡片 + 三个下载出口（国内加速 / GitHub 原链 / QQ 群）。
        */}
        {updateInfo && (
          <div className="mb-3 rounded-lg border border-sky-500/30 bg-sky-500/[0.09] px-2.5 py-2">
            <div className="flex items-start gap-2">
              <Sparkles size={14} className="mt-0.5 shrink-0 text-sky-400" />
              <div className="min-w-0 flex-1 leading-tight">
                <p className="truncate text-[11.5px] font-semibold text-sky-300">
                  发现新版本 v{updateInfo.version}
                </p>
                <p className="text-[10px] text-sky-400/70">当前 v{APP_VERSION}</p>
              </div>
              <button
                type="button"
                onClick={onShowUpdate}
                className="flex shrink-0 items-center gap-0.5 rounded px-1 py-0.5 text-[10px] text-sky-400/80 active:bg-sky-500/15"
              >
                更新说明
                <ChevronRight size={12} />
              </button>
            </div>

            {primaryDownloadUrl && (
              <button
                type="button"
                onClick={() => openExternal(primaryDownloadUrl)}
                className="mt-2 flex h-9 w-full items-center justify-center gap-1.5 rounded-lg bg-sky-600 text-[12.5px] font-semibold text-white transition-colors active:bg-sky-700"
              >
                <Download size={13} />
                {primaryDownloadLabel}
              </button>
            )}

            {(apkUrl || qqGroupUrl) && (
              <div className="mt-1.5 flex items-center justify-center gap-4 text-[10px]">
                {apkUrl && (
                  <button
                    type="button"
                    onClick={() => openExternal(apkUrl)}
                    className="text-slate-400 underline decoration-slate-600 underline-offset-2 active:text-slate-200"
                  >
                    GitHub 原链
                  </button>
                )}
                {qqGroupUrl && (
                  <button
                    type="button"
                    onClick={() => openExternal(qqGroupUrl)}
                    className="text-slate-400 underline decoration-slate-600 underline-offset-2 active:text-slate-200"
                  >
                    QQ 群获取
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        <SectionLabel>数据</SectionLabel>

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
              数据日期{' '}
              <span className="tabular-nums text-slate-300">{snapshot.dataDate ?? '未知'}</span>
            </span>
            <span className="text-slate-500">
              总对局{' '}
              <span className="tabular-nums text-slate-300">
                {snapshot.totalBattles.toLocaleString()}
              </span>
            </span>
            <span className="text-slate-500">
              最低段位 <span className="text-slate-300">{tierLabel(snapshot)}</span>
            </span>
            <span className="text-slate-500">
              地图 <span className="tabular-nums text-slate-300">{snapshot.meta.maps.length}</span>
            </span>
            <span className="text-slate-500">
              英雄{' '}
              <span className="tabular-nums text-slate-300">{snapshot.meta.brawlers.length}</span>
            </span>
            <span className="text-slate-500">
              拉取渠道{' '}
              <span className="text-slate-300">
                {snapshot.remoteChannel
                  ? META_CHANNEL_LABEL[snapshot.remoteChannel]
                  : '尚未连上远程'}
              </span>
            </span>
            {snapshot.dataDateSource === 'header' && (
              <span className="text-[10px] leading-tight text-slate-600">日期取自响应头</span>
            )}
          </div>
          {snapshot.lastError && (
            <p className="mt-1.5 rounded bg-amber-500/10 px-1.5 py-1 text-[10px] leading-snug text-amber-400">
              {snapshot.lastError}
            </p>
          )}
        </div>

        {/* 远程地址 */}
        <label className="mb-1 block text-[11px] font-medium text-slate-400">
          自定义数据地址（留空使用默认三段式链路）
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
          拉取链路（任一成功即停）：GitHub 提交 SHA → jsDelivr 精确版本 → jsDelivr @main →
          GitHub Raw。单段 {Math.round(META_DOWNLOAD_TIMEOUT_MS / 1000)} 秒超时、带防缓存参数，
          手动拉取不受任何冷却限制。启动时静默检查一次，失败不阻塞界面；断网时自动使用本地缓存
          或内置数据，可零延迟打开。
        </p>

        {/* 关于：版本 / 检查更新 / 开源入口 */}
        <div className="mt-4">
          <SectionLabel>关于</SectionLabel>

          <div className="mb-2 flex items-center justify-between rounded-lg border border-slate-800 bg-slate-950/60 px-2.5 py-2">
            <span className="flex items-center gap-1.5 text-[11px] text-slate-400">
              <Database size={13} className="text-slate-500" />
              当前版本
            </span>
            <span className="text-[12px] font-semibold tabular-nums text-slate-200">
              v{APP_VERSION}
            </span>
          </div>

          <button
            type="button"
            onClick={handleCheckUpdate}
            disabled={checking}
            className="mb-1.5 flex h-9 w-full items-center justify-center gap-1.5 rounded-lg border border-slate-800 text-[12px] text-slate-300 active:bg-slate-800 disabled:opacity-60"
          >
            <RefreshCw size={13} className={checking ? 'animate-spin' : ''} />
            {checking ? '正在检查…' : '检查更新'}
          </button>

          {checkMsg && (
            <p
              className={`mb-1.5 rounded-lg px-2 py-1.5 text-[11px] leading-snug ${CHECK_TONE[checkMsg.tone]}`}
            >
              {checkMsg.text}
            </p>
          )}

          <button
            type="button"
            onClick={() => openExternal(GITHUB_REPO_URL)}
            className="flex w-full items-center gap-2 rounded-lg border border-slate-800 bg-slate-950/60 px-2.5 py-2 text-left transition-colors active:bg-slate-800"
          >
            <Github size={16} className="shrink-0 text-slate-300" />
            <span className="min-w-0 flex-1">
              <span className="block text-[12px] font-medium text-slate-200">
                GitHub 开源仓库
              </span>
              <span className="block truncate text-[10px] text-slate-500">
                github.com/{GITHUB_REPO}
              </span>
            </span>
            <ExternalLink size={13} className="shrink-0 text-slate-500" />
          </button>

          <p className="mt-3 text-center text-[10px] leading-relaxed text-slate-700">
            {APP_NAME} v{APP_VERSION} · 开源主页
          </p>
        </div>
      </div>
    </div>
  );
}
