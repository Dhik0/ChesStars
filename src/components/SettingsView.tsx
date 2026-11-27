import { useState, type ReactNode } from 'react';
import {
  ChevronRight,
  Database,
  Download,
  ExternalLink,
  Github,
  MessageCircle,
  RefreshCw,
  Settings,
  Sparkles,
  Users,
} from 'lucide-react';
import LanguageAccordion from './LanguageAccordion';
import { APP_NAME, APP_VERSION, DISCORD_INVITE_URL, GITHUB_REPO, GITHUB_REPO_URL, QQ_GROUP_ID } from '../config/app';
import { bundledQqGroupUrl } from '../config/bundledManifest';
import { IS_NATIVE_APP, IS_WEB } from '../config/platform';
import { useTranslation } from '../i18n';
import { pullMessage } from '../i18n/format';
import type { MetaSnapshot, PullResult } from '../services/metaStore';
import type { UpdateInfo } from '../services/updateChecker';
import { mirrorDownloadUrl } from '../services/updateChecker';
import type { UpdateCheckOutcome } from '../services/webUpdate';
import type { DarkPalette, ThemeMode } from '../services/themeStore';
import { openExternal } from '../utils/openExternal';
import { useTheme } from '../utils/useTheme';

interface SettingsViewProps {
  snapshot: MetaSnapshot;
  onPull: () => Promise<PullResult>;
  /** 已发现的新版本（启动检测或手动检测得出）；null = 没有更新 */
  updateInfo: UpdateInfo | null;
  /** 远程清单里的 QQ 群链接；null = 用打包内置的 version.json */
  qqGroupUrl: string | null;
  /** 手动检查更新（原生壳问 GitHub 清单，网页端问线上 version.json），返回统一结果 */
  onCheckUpdate: () => Promise<UpdateCheckOutcome>;
  /** 打开更新说明弹窗 */
  onShowUpdate: () => void;
}

const SOURCE_KEY: Record<MetaSnapshot['source'], string> = {
  builtin: 'settings.sourceBuiltin',
  cache: 'settings.sourceCache',
  remote: 'settings.sourceRemote',
};

const SOURCE_STYLE: Record<MetaSnapshot['source'], string> = {
  builtin: 'bg-press/60 text-body',
  cache: 'bg-sky-500/20 text-brand',
  remote: 'bg-strong/20 text-strong',
};

/**
 * 外观模式的三段式选择：深色 / 浅色 / 跟随系统。
 * 顺序固定——「深色」是默认值，放第一位，用户不用滑到后面找。
 */
const THEME_MODES: ReadonlyArray<{ key: ThemeMode; labelKey: string }> = [
  { key: 'dark', labelKey: 'settings.themeDark' },
  { key: 'light', labelKey: 'settings.themeLight' },
  { key: 'system', labelKey: 'settings.themeSystem' },
];

/** 深色主题色：色标颜色与 index.css 里各主题的 `--c-app` 一致 */
const DARK_PALETTES: ReadonlyArray<{ key: DarkPalette; labelKey: string; swatch: string }> = [
  { key: 'oled', labelKey: 'settings.paletteOled', swatch: '#000000' },
  { key: 'navy', labelKey: 'settings.paletteNavy', swatch: '#020617' },
];

interface CheckMessage {
  tone: 'ok' | 'warn' | 'error';
  text: string;
}

const CHECK_TONE: Record<CheckMessage['tone'], string> = {
  ok: 'bg-strong/10 text-strong',
  warn: 'bg-sky-500/10 text-brand',
  error: 'bg-red-500/10 text-danger',
};

/** 小节标题：一条细线 + 标签，把「数据」与「关于」两块分开 */
function SectionLabel({ children }: { children: string }) {
  return (
    <div className="mb-2 flex items-center gap-2">
      <span className="text-[10px] font-semibold tracking-wide text-subtle">{children}</span>
      <span className="h-px flex-1 bg-line" />
    </div>
  );
}

/** 「关于」区的行式入口：图标 + 标题 + 小字 + 外链箭头 */
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
      className="flex w-full items-center gap-2 rounded-lg border border-line bg-surface px-2.5 py-2 text-left shadow-card transition-colors active:bg-press"
    >
      <span className="shrink-0 text-body">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-[12px] font-medium text-body">{title}</span>
        <span className="block truncate text-[10px] text-subtle">{subtitle}</span>
      </span>
      <ExternalLink size={13} className="shrink-0 text-subtle" />
    </button>
  );
}

/**
 * 设置页（一级页面，由底部导航右侧 Tab 进入）。
 *
 * 面向普通用户：只讲「数据是哪天的、能不能更新、去哪下载、怎么换语言」，
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
  const { t, lang, num, tier } = useTranslation();
  const { mode, darkPalette, setMode, setDarkPalette } = useTheme();
  const [pulling, setPulling] = useState(false);
  const [checking, setChecking] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [checkMsg, setCheckMsg] = useState<CheckMessage | null>(null);

  /**
   * 国内镜像下载入口：只有简中界面才渲染。
   * 繁中 / 英文用户看不到任何镜像相关元素，主入口统一是 GitHub Release 页。
   */
  const mirrorUrl =
    lang === 'zh-CN' && updateInfo
      ? mirrorDownloadUrl(updateInfo.mirrorPrefixes, updateInfo.apkUrl)
      : null;

  /** QQ 群：远程清单优先，没有就用打包内置的 version.json（非空即常驻） */
  const qqLink = qqGroupUrl ?? bundledQqGroupUrl;

  /** 数据时间：按当前语言格式化，避免英文界面里出现「2026/11/24 22:18」的中文顺序 */
  const formatTime = (iso: string): string => {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleString(lang, {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
  };

  /** 段位门槛：后端 tier_audit 里带段位标签时优先用它（如「传奇 I」），否则退回数值 */
  const tierText = (() => {
    const min = snapshot.meta.min_tier;
    const hit = snapshot.meta.tier_audit?.distribution.find((d) => d.tier === min);
    return hit?.label ? `${tier(hit.label)}+` : String(min);
  })();

  const handlePull = async () => {
    setPulling(true);
    setMessage(null);
    const res = await onPull();
    setMessage({ ok: res.ok, text: pullMessage(res, t, num) });
    setPulling(false);
  };

  const handleCheckUpdate = async () => {
    setChecking(true);
    setCheckMsg(null);
    try {
      const res = await onCheckUpdate();
      if (res.status === 'update' && res.version) {
        // 网页端没有安装包，「去上方下载」会误导，换成「点顶部提示条」
        setCheckMsg({
          tone: 'warn',
          text: t(IS_WEB ? 'settings.checkFoundWeb' : 'settings.checkFound', { v: res.version }),
        });
      } else if (res.status === 'latest') {
        setCheckMsg({ tone: 'ok', text: t('settings.checkLatest', { v: res.current }) });
      } else {
        setCheckMsg({ tone: 'error', text: t('settings.checkFailed') });
      }
    } catch {
      setCheckMsg({ tone: 'error', text: t('settings.checkFailed') });
    } finally {
      setChecking(false);
    }
  };

  /** 社区入口分流：简中主推 QQ 群 + Discord；英文与繁中只推 Discord */
  const showQq = lang === 'zh-CN';

  return (
    <div className="flex h-full min-h-0 flex-col bg-app">
      {/* 页头：与选图页同款细边框 + 安全区留白 */}
      <header className="shrink-0 border-b border-line px-3 pb-2 pt-2 safe-top">
        <h1 className="flex items-center gap-1.5 text-[14px] font-semibold text-fg">
          <Settings size={15} className="text-brand" />
          {t('settings.title')}
        </h1>
        <p className="mt-0.5 text-[10px] leading-tight text-subtle">
          {APP_NAME} v{APP_VERSION}
        </p>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pb-5 pt-3">
        {/*
          外观与主题：放在最顶部——它是「整页长什么样」的开关，
          比数据与版本信息更常被翻。
          深色主题色只影响两套深色；浅色模式下列表整体置灰并给出原因。
        */}
        <SectionLabel>{t('settings.sectionAppearance')}</SectionLabel>

        <div className="mb-3 rounded-lg border border-line bg-surface p-2.5 shadow-card">
          <span className="block text-[11.5px] font-semibold text-fg">
            {t('settings.themeMode')}
          </span>

          <div
            className="mt-1.5 grid grid-cols-3 gap-1 rounded-lg bg-app/70 p-0.5"
            role="radiogroup"
            aria-label={t('settings.themeMode')}
          >
            {THEME_MODES.map(({ key, labelKey }) => {
              const active = mode === key;
              return (
                <button
                  key={key}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => setMode(key)}
                  className={`flex h-8 items-center justify-center rounded-md text-[11.5px] transition-colors ${
                    active
                      ? 'bg-raised font-semibold text-fg'
                      : 'text-muted active:bg-press'
                  }`}
                >
                  {t(labelKey)}
                </button>
              );
            })}
          </div>

          <div className="mt-2.5 flex items-baseline justify-between gap-2">
            <span className="text-[11.5px] font-semibold text-fg">
              {t('settings.darkPalette')}
            </span>
            {mode === 'light' && (
              <span className="text-[9.5px] leading-none text-subtle">
                {t('settings.paletteOnlyDark')}
              </span>
            )}
          </div>

          <div className="mt-1.5 grid grid-cols-2 gap-1.5">
            {DARK_PALETTES.map(({ key, labelKey, swatch }) => {
              const active = darkPalette === key;
              const disabled = mode === 'light';
              return (
                <button
                  key={key}
                  type="button"
                  aria-pressed={active}
                  aria-label={t(labelKey)}
                  disabled={disabled}
                  onClick={() => setDarkPalette(key)}
                  className={`flex h-9 items-center gap-1.5 rounded-lg border px-2 text-[11px] transition-colors ${
                    active && !disabled
                      ? 'border-brand/60 bg-brand/10 font-semibold text-fg'
                      : 'border-line bg-app/50 text-muted active:bg-press'
                  } ${disabled ? 'cursor-not-allowed' : ''}`}
                >
                  {/* 色标始终满色：它本身就是「这个主题长什么样」的样本，不跟着置灰 */}
                  <span
                    className="h-3.5 w-3.5 shrink-0 rounded-full ring-1 ring-line-strong"
                    style={{ backgroundColor: swatch }}
                    aria-hidden
                  />
                  <span className={`min-w-0 truncate ${disabled ? 'opacity-50' : ''}`}>
                    {t(labelKey)}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* 语言：切换后立即全局生效并记住选择 */}
        <LanguageAccordion />

        {/*
          新版本提示：留在设置页内，不做全局弹窗。
          主入口固定为 GitHub Release 页；国内镜像只对简中用户显示，且只做小字备用入口。
          仅原生壳渲染——Web / PWA 用户不该看到安卓安装包下载引导。
        */}
        {IS_NATIVE_APP && updateInfo && (
          <div className="mb-3 rounded-lg border border-sky-500/30 bg-sky-500/[0.09] px-2.5 py-2">
            <div className="flex items-start gap-2">
              <Sparkles size={14} className="mt-0.5 shrink-0 text-brand" />
              <div className="min-w-0 flex-1 leading-tight">
                <p className="truncate text-[11.5px] font-semibold text-brand">
                  {t('settings.newVersion', { v: updateInfo.version })}
                </p>
                <p className="text-[10px] text-brand/70">
                  {t('update.current', { v: APP_VERSION })}
                </p>
              </div>
              <button
                type="button"
                onClick={onShowUpdate}
                className="flex shrink-0 items-center gap-0.5 rounded px-1 py-0.5 text-[10px] text-brand/80 active:bg-sky-500/15"
              >
                {t('settings.updateNotes')}
                <ChevronRight size={12} />
              </button>
            </div>

            <button
              type="button"
              onClick={() => openExternal(updateInfo.htmlUrl)}
              className="mt-2 flex h-9 w-full items-center justify-center gap-1.5 rounded-lg bg-sky-600 text-[12.5px] font-semibold text-white transition-colors active:bg-sky-700"
            >
              <Download size={13} />
              {t('update.downloadGithub')}
            </button>

            {mirrorUrl && (
              <div className="mt-1.5 text-center">
                <button
                  type="button"
                  onClick={() => openExternal(mirrorUrl)}
                  className="text-[10px] text-muted underline decoration-line-strong underline-offset-2 active:text-fg"
                >
                  {t('update.mirror')}
                </button>
              </div>
            )}
          </div>
        )}

        <SectionLabel>{t('settings.sectionData')}</SectionLabel>

        {/* 当前数据状态 */}
        <div className="mb-3 rounded-lg border border-line bg-surface p-2.5 shadow-card">
          <div className="mb-1.5 flex items-center gap-1.5">
            <span
              className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${SOURCE_STYLE[snapshot.source]}`}
            >
              {t(SOURCE_KEY[snapshot.source])}
            </span>
            <span className="text-[10px] text-subtle">
              {t('settings.updatedAt', { time: formatTime(snapshot.updatedAt) })}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-x-2 gap-y-1 text-[11px]">
            <span className="text-subtle">
              {t('settings.dataDate')}{' '}
              <span className="tabular-nums text-body">
                {snapshot.dataDate ?? t('settings.unknown')}
              </span>
            </span>
            <span className="text-subtle">
              {t('settings.totalBattles')}{' '}
              <span className="tabular-nums text-body">{num(snapshot.totalBattles)}</span>
            </span>
            <span className="text-subtle">
              {t('settings.minTier')} <span className="text-body">{tierText}</span>
            </span>
            <span className="text-subtle">
              {t('settings.maps')}{' '}
              <span className="tabular-nums text-body">{snapshot.meta.maps.length}</span>
            </span>
            <span className="text-subtle">
              {t('settings.brawlers')}{' '}
              <span className="tabular-nums text-body">{snapshot.meta.brawlers.length}</span>
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
          {pulling ? t('settings.pulling') : t('settings.pull')}
        </button>

        {message && (
          <p
            className={`mt-2 rounded-lg px-2 py-1.5 text-[11px] leading-snug ${
              message.ok ? 'bg-strong/10 text-strong' : 'bg-red-500/10 text-danger'
            }`}
          >
            {message.text}
          </p>
        )}

        {/* 关于：版本 / 检查更新 / 开源仓库 / 社区 */}
        <div className="mt-4">
          <SectionLabel>{t('settings.sectionAbout')}</SectionLabel>

          <div className="mb-2 flex items-center justify-between rounded-lg border border-line bg-surface px-2.5 py-2 shadow-card">
            <span className="flex items-center gap-1.5 text-[11px] text-muted">
              <Database size={13} className="text-subtle" />
              {t('settings.currentVersion')}
            </span>
            <span className="text-[12px] font-semibold tabular-nums text-body">
              v{APP_VERSION}
            </span>
          </div>

          {/*
            检查更新：原生壳查的是 APK 版本，网页端查的是线上 version.json，
            两者都走同一个按钮与同一套反馈文案。
          */}
          <button
            type="button"
            onClick={handleCheckUpdate}
            disabled={checking}
            className="mb-1.5 flex h-9 w-full items-center justify-center gap-1.5 rounded-lg border border-line text-[12px] text-body active:bg-press disabled:opacity-60"
          >
            <RefreshCw size={13} className={checking ? 'animate-spin' : ''} />
            {checking ? t('settings.checking') : t('settings.checkUpdate')}
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
            title={t('settings.github')}
            subtitle={`github.com/${GITHUB_REPO}`}
            onClick={() => openExternal(GITHUB_REPO_URL)}
          />

          {/* 合规兜底：英雄头像与（可选的）Fan Kit 音效都属于 Supercell 的玩家内容 */}
          <p className="mt-2 px-0.5 text-[9.5px] leading-relaxed text-faint">
            {t('settings.disclaimer')}
          </p>
        </div>

        <div className="mt-4">
          <SectionLabel>{t('settings.sectionCommunity')}</SectionLabel>

          {showQq && qqLink && (
            <div className="mb-1.5">
              <LinkRow
                icon={<Users size={16} />}
                title={t('settings.qq')}
                subtitle={t('settings.qqHint', { id: QQ_GROUP_ID })}
                onClick={() => openExternal(qqLink)}
              />
            </div>
          )}

          <LinkRow
            icon={<MessageCircle size={16} />}
            title={t('settings.discord')}
            subtitle={t('settings.discordHint')}
            onClick={() => openExternal(DISCORD_INVITE_URL)}
          />

          <p className="mt-3 text-center text-[10px] leading-relaxed text-faint">
            {APP_NAME} v{APP_VERSION}
          </p>
        </div>
      </div>
    </div>
  );
}
