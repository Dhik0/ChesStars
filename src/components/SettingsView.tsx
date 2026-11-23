import { useState, type ReactNode } from 'react';
import {
  ChevronRight,
  Database,
  Download,
  ExternalLink,
  Github,
  RefreshCw,
  Settings,
  Sparkles,
  Users,
} from 'lucide-react';
import { APP_NAME, APP_VERSION, GITHUB_REPO, GITHUB_REPO_URL } from '../config/app';
import { bundledQqGroupUrl } from '../config/bundledManifest';
import type { MetaSnapshot, PullResult } from '../services/metaStore';
import type { UpdateCheckResult, UpdateInfo } from '../services/updateChecker';
import { mirrorDownloadUrl } from '../services/updateChecker';
import { openExternal } from '../utils/openExternal';

interface SettingsViewProps {
  snapshot: MetaSnapshot;
  onPull: () => Promise<PullResult>;
  /** 已发现的新版本（启动检测或手动检测得出）；null = 没有更新 */
  updateInfo: UpdateInfo | null;
  /** 远程清单里的 QQ 群链接；null = 用打包内置的 version.json */
  qqGroupUrl: string | null;
  /** 手动检查更新，返回结构化结果供按钮旁反馈 */
  onCheckUpdate: () => Promise<UpdateCheckResult>;
  /** 打开更新说明弹窗 */
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

/** 「关于」区的行式入口：图标 + 标题 + 小字 + 外链箭头（开源仓库 / QQ 群共用） */
function LinkRow({
  icon,
  title,
  subtitle,
  onClick,
}: {
  icon: ReactNode;
  title: string;
  subtitle: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-2 rounded-lg border border-slate-800 bg-slate-950/60 px-2.5 py-2 text-left transition-colors active:bg-slate-800"
    >
      <span className="shrink-0 text-slate-300">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-[12px] font-medium text-slate-200">{title}</span>
        <span className="block truncate text-[10px] text-slate-500">{subtitle}</span>
      </span>
      <ExternalLink size={13} className="shrink-0 text-slate-500" />
    </button>
  );
}

/**
 * 设置页（一级页面，由底部导航右侧 Tab 进入）。
 *
 * 面向普通用户：只讲「数据是哪天的、能不能更新、去哪下载」，
 * 算法细节与网络链路一律不在这里展示（见 .workbuddy-ai/memory/MEMORY.md 的长期规范）。
 */
export default function SettingsView({
  snapshot,
  onPull,
  updateInfo,
  qqGroupUrl,
  onCheckUpdate,
  onShowUpdate,
}: SettingsViewProps) {
  const [pulling, setPulling] = useState(false);
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
  const primaryDownloadLabel = apkUrl ? '下载' : '前往 Release 页';

  /** QQ 群：远程清单优先，没有就用打包内置的 version.json（非空即常驻） */
  const qqLink = qqGroupUrl ?? bundledQqGroupUrl;

  const handlePull = async () => {
    setPulling(true);
    setMessage(null);
    const res = await onPull();
    setMessage({ ok: res.ok, text: res.message });
    setPulling(false);
  };

  const handleCheckUpdate = async () => {
    setChecking(true);
    setCheckMsg(null);
    try {
      const res = await onCheckUpdate();
      if (res.status === 'update' && res.info) {
        setCheckMsg({ tone: 'warn', text: `发现新版本 v${res.info.version}，可在上方下载` });
      } else if (res.status === 'latest') {
        setCheckMsg({ tone: 'ok', text: `已是最新版本（v${res.current}）` });
      } else {
        setCheckMsg({ tone: 'error', text: '检查失败，请检查网络后重试' });
      }
    } catch {
      setCheckMsg({ tone: 'error', text: '检查失败，请检查网络后重试' });
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
          {APP_NAME} v{APP_VERSION}
        </p>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pb-5 pt-3">
        {/*
          新版本提示：留在设置页内，不做全局弹窗。
          主按钮走国内加速，「GitHub 直连」作为次级入口并标注适用前提。
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

            {apkUrl && (
              <div className="mt-1.5 text-center">
                <button
                  type="button"
                  onClick={() => openExternal(apkUrl)}
                  className="text-[10px] text-slate-400 underline decoration-slate-600 underline-offset-2 active:text-slate-200"
                >
                  GitHub 直连
                </button>
                <p className="mt-0.5 text-[9.5px] leading-snug text-amber-400/70">
                  如果没有加速器，请不要选择此选项
                </p>
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
          </div>
        </div>

        {/* 唯一的数据操作：强制拉一次最新数据 */}
        <button
          type="button"
          onClick={handlePull}
          disabled={pulling}
          className="flex h-10 w-full items-center justify-center gap-1.5 rounded-lg bg-sky-600 text-[13px] font-semibold text-white transition-colors active:bg-sky-700 disabled:opacity-60"
        >
          {pulling ? <RefreshCw size={14} className="animate-spin" /> : <Download size={14} />}
          {pulling ? '正在拉取…' : '立即拉取最新数据'}
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

        {/* 关于：版本 / 检查更新 / 开源仓库 / QQ 群 */}
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

          <LinkRow
            icon={<Github size={16} />}
            title="GitHub 开源仓库"
            subtitle={`github.com/${GITHUB_REPO}`}
            onClick={() => openExternal(GITHUB_REPO_URL)}
          />

          {qqLink && (
            <div className="mt-1.5">
              <LinkRow
                icon={<Users size={16} />}
                title="QQ 交流群"
                subtitle="如果无法更新，请进入 QQ 群获取更新"
                onClick={() => openExternal(qqLink)}
              />
            </div>
          )}

          <p className="mt-3 text-center text-[10px] leading-relaxed text-slate-700">
            {APP_NAME} v{APP_VERSION}
          </p>
        </div>
      </div>
    </div>
  );
}
