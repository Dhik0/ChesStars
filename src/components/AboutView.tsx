import { useCallback, useEffect, useRef, useState, type ChangeEvent, type ReactNode } from 'react';
import {
  ChevronDown,
  ChevronRight,
  Download,
  ExternalLink,
  FileText,
  Github,
  MessageCircle,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Upload,
  Users,
} from 'lucide-react';
import {
  APP_NAME,
  APP_VERSION,
  DEVELOPER_AVATAR,
  DEVELOPER_HANDLE,
  DEVELOPER_NAME,
  DEVELOPER_URL,
  DISCORD_INVITE_URL,
  GITHUB_REPO,
  GITHUB_REPO_URL,
  GITHUB_RELEASES_PAGE,
  QQ_GROUP_ID,
} from '../config/app';
import { bundledQqGroupUrl } from '../config/bundledManifest';
import { IS_WEB } from '../config/platform';
import { useTranslation } from '../i18n';
import {
  applyBackup,
  backupFileName,
  buildBackup,
  parseBackup,
} from '../services/backupStore';
import type { MatchRecord } from '../services/matchHistoryStore';
import { mirrorDownloadUrl, type UpdateInfo } from '../services/updateChecker';
import type { UpdateCheckOutcome } from '../services/webUpdate';
import { openExternal } from '../utils/openExternal';
import { useTheme } from '../utils/useTheme';

/** Hero 渐隐完成的滚动距离：拉长一点，滚起来是平滑淡出而不是一下子抽走 */
const HERO_FADE_PX = 220;

/** 应用图标：走 public 目录，与 PWA 清单同一张，避免两套图 */
const APP_ICON = `${import.meta.env.BASE_URL}icons/icon-192.png`;

interface AboutViewProps {
  /** 导出备份时打包的战绩 */
  records: MatchRecord[];
  /** 已发现的新版本；null = 没有更新 */
  updateInfo: UpdateInfo | null;
  /** 远程清单里的 QQ 群链接；null = 用打包内置的 version.json */
  qqGroupUrl: string | null;
  onCheckUpdate: () => Promise<UpdateCheckOutcome>;
  /** 打开更新说明弹窗 */
  onShowUpdate: () => void;
  /** 导入成功：App 负责重新载入（偏好与战绩都已换成备份里的） */
  onImported: () => void;
}

interface Notice {
  tone: 'ok' | 'warn' | 'error';
  text: string;
}

const NOTICE_TONE: Record<Notice['tone'], string> = {
  ok: 'bg-strong/10 text-strong',
  warn: 'bg-amber-500/10 text-gold',
  error: 'bg-red-500/10 text-danger',
};

/**
 * 导出 JSON 文件。
 *
 * 原生壳（安卓 WebView）里 `<a download>` 不一定被接管，所以先问系统分享：
 * 能分享就走系统面板（用户可存进「文件」或发给别人），不能分享再退回浏览器下载。
 * 两条路都失败时抛错，由调用方提示「导出失败」——绝不假装成功。
 */
async function saveJsonFile(fileName: string, text: string): Promise<void> {
  const file = new File([text], fileName, { type: 'application/json' });
  const nav = navigator as Navigator & { canShare?: (data: ShareData) => boolean };
  if (typeof nav.canShare === 'function' && nav.canShare({ files: [file] }) && nav.share) {
    await nav.share({ files: [file], title: fileName });
    return;
  }
  const url = URL.createObjectURL(file);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.rel = 'noopener';
  document.body.appendChild(link);
  link.click();
  link.remove();
  // 立刻 revoke 会让部分浏览器来不及读，留 10 秒再释放
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** 分组：强调色小标题独立置于卡片上方 10px，卡片本身不带外描边 */
function Group({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section className="mb-7">
      <h2 className="section-label">{label}</h2>
      <div className="list-card">{children}</div>
    </section>
  );
}

/** 卡片内的一行入口：64px 舒展行高 + 22px 线性图标 */
function Row({
  icon,
  title,
  subtitle,
  onClick,
  trailing,
}: {
  icon: ReactNode;
  title: string;
  subtitle?: string;
  onClick: () => void;
  trailing?: ReactNode;
}) {
  return (
    <button type="button" onClick={onClick} className="list-row">
      <span className="list-icon">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="list-title truncate">{title}</span>
        {subtitle ? <span className="list-subtitle truncate">{subtitle}</span> : null}
      </span>
      {trailing ?? <ChevronRight size={20} className="shrink-0 text-faint" />}
    </button>
  );
}

/** 可展开的长文本行（引用致谢 / 隐私政策）：展开后就在卡片里往下撑开 */
function ExpanderRow({
  icon,
  title,
  subtitle,
  body,
  open,
  onToggle,
}: {
  icon: ReactNode;
  title: string;
  subtitle: string;
  body: string;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <div>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="list-row"
      >
        <span className="list-icon">{icon}</span>
        <span className="min-w-0 flex-1">
          <span className="list-title truncate">{title}</span>
          <span className="list-subtitle truncate">{subtitle}</span>
        </span>
        <ChevronDown
          size={20}
          className={`shrink-0 text-faint transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
        />
      </button>
      <div
        aria-hidden={!open}
        className={`grid transition-all duration-200 ease-out ${
          open ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
        }`}
      >
        <div className="overflow-hidden">
          <p className="px-5 pb-5 text-[13px] leading-relaxed text-subtle">{body}</p>
        </div>
      </div>
    </div>
  );
}

/**
 * 「关于」一级页面（底部导航第四个 Tab）。
 *
 * 参考 Material 3 / HyperOS 的关于页：顶部一块渐变 Hero，下面按
 * 开发者 / 讨论 / 应用与数据 / 项目 分四组大圆角卡片。
 *
 * 滚动行为：Hero 的渐变光晕、图标与标题随滚动距离渐隐并轻微视差；
 * 顶部常驻一层与底色同色的渐隐遮罩，列表滚上来时分组标题不会和状态栏时间叠在一起。
 *
 * 这里的「检查更新 / 仓库 / 社群」等文案直接复用 settings.* 词条——
 * 它们已经从设置页整体搬到这里，没必要在词库里存两份一模一样的句子。
 */
export default function AboutView({
  records,
  updateInfo,
  qqGroupUrl,
  onCheckUpdate,
  onShowUpdate,
  onImported,
}: AboutViewProps) {
  const { t, lang } = useTranslation();
  const { mode, darkPalette, monetEnabled, accentColor } = useTheme();

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const heroRef = useRef<HTMLDivElement | null>(null);
  const veilRef = useRef<HTMLDivElement | null>(null);
  const rafRef = useRef(0);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const [checking, setChecking] = useState(false);
  const [checkMsg, setCheckMsg] = useState<Notice | null>(null);
  const [backupMsg, setBackupMsg] = useState<Notice | null>(null);
  const [panel, setPanel] = useState<'credits' | 'privacy' | null>(null);
  /** GitHub 头像拉不到（离线 / 被墙）时退回首字母，不留一个破图 */
  const [avatarOk, setAvatarOk] = useState(true);

  /**
   * 滚动渐隐：位移直接写 style，不走 state。
   * 这个页面本身不重，但滚动里 setState 会让整棵树每帧重渲染，掉帧非常明显。
   */
  const handleScroll = useCallback(() => {
    if (rafRef.current) return;
    rafRef.current = window.requestAnimationFrame(() => {
      rafRef.current = 0;
      const scroller = scrollRef.current;
      if (!scroller) return;
      const top = Math.max(0, scroller.scrollTop);
      const progress = Math.min(1, top / HERO_FADE_PX);
      const hero = heroRef.current;
      if (hero) {
        hero.style.opacity = String(1 - progress * 0.95);
        // 视差：Hero 比内容滚得慢一点，渐隐时不会「整块被抽走」
        hero.style.transform = `translate3d(0, ${top * 0.16}px, 0)`;
      }
      const veil = veilRef.current;
      if (veil) veil.style.opacity = String(0.82 + progress * 0.18);
    });
  }, []);

  useEffect(
    () => () => {
      if (rafRef.current) window.cancelAnimationFrame(rafRef.current);
    },
    [],
  );

  /** QQ 群：远程清单优先，没有就用打包内置的 version.json */
  const qqLink = qqGroupUrl ?? bundledQqGroupUrl;
  const showQq = lang === 'zh-CN' && Boolean(qqLink);

  /** 国内镜像下载入口：只有简中界面才渲染（与设置页原口径一致） */
  const mirrorUrl =
    lang === 'zh-CN' && updateInfo
      ? mirrorDownloadUrl(updateInfo.mirrorPrefixes, updateInfo.apkUrl)
      : null;

  const handleCheckUpdate = async () => {
    setChecking(true);
    setCheckMsg(null);
    try {
      const res = await onCheckUpdate();
      if (res.status === 'update' && res.version) {
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

  const handleExport = () => {
    const file = buildBackup({
      records,
      prefs: { themeMode: mode, darkPalette, monetEnabled, accentColor, lang },
      appVersion: APP_VERSION,
    });
    void saveJsonFile(backupFileName(), JSON.stringify(file, null, 2))
      .then(() =>
        setBackupMsg({
          tone: 'ok',
          text: t('about.backupExported', { n: file.records.length }),
        }),
      )
      .catch(() => setBackupMsg({ tone: 'error', text: t('about.backupFailed') }));
  };

  const handleImport = async (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const file = input.files?.[0];
    // 清空 value：同一个文件连续导入两次也要能触发 change
    input.value = '';
    if (!file) return;

    let raw: string;
    try {
      raw = await file.text();
    } catch {
      setBackupMsg({ tone: 'error', text: t('about.backupInvalid') });
      return;
    }

    const parsed = parseBackup(raw);
    if (!parsed.ok) {
      setBackupMsg({
        tone: 'error',
        text: parsed.reason === 'version' ? t('about.backupNewer') : t('about.backupInvalid'),
      });
      return;
    }

    if (!applyBackup(parsed.file, window.localStorage)) {
      setBackupMsg({ tone: 'error', text: t('about.backupFailed') });
      return;
    }

    setBackupMsg({
      tone: 'ok',
      text: t('about.backupImported', { n: parsed.file.records.length }),
    });
    onImported();
  };

  return (
    <div className="relative flex h-full min-h-0 flex-col bg-app">
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain"
      >
        {/* Hero：安全区留白 + 径向光晕，滚动时整体渐隐并轻微下移（视差） */}
        <div
          ref={heroRef}
          className="relative pb-10 text-center"
          style={{
            paddingTop: 'calc(env(safe-area-inset-top, 0px) + 48px)',
            willChange: 'opacity, transform',
          }}
        >
          {/* 两层径向渐变：深海蓝垫底 + 主题色光晕，往下自然融进纯黑底板 */}
          <div className="about-hero-glow pointer-events-none absolute inset-0" aria-hidden />
          <div className="relative">
            <img
              src={APP_ICON}
              alt=""
              draggable={false}
              className="mx-auto h-[88px] w-[88px] rounded-[24px] shadow-[0_16px_38px_-12px_rgba(0,0,0,0.7)]"
            />
            <h1 className="mt-5 text-[30px] font-bold tracking-tight text-fg">{APP_NAME}</h1>
            <p className="mt-1.5 text-[13px] text-muted">
              {t('about.tagline')} · v{APP_VERSION}
            </p>
          </div>
        </div>

        <div className="px-4 pb-8">
          {/* 开发者 */}
          <Group label={t('about.sectionDeveloper')}>
            <button
              type="button"
              onClick={() => openExternal(DEVELOPER_URL)}
              className="list-row"
            >
              <span className="relative flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-[16px] bg-accent-soft">
                {/* 首字母常驻当底：头像拉不到（离线 / 被墙）时不会留一个空白方块 */}
                <span className="text-[17px] font-semibold text-accent">
                  {DEVELOPER_NAME.slice(0, 1).toUpperCase()}
                </span>
                {avatarOk && (
                  <img
                    src={DEVELOPER_AVATAR}
                    alt=""
                    className="absolute inset-0 h-full w-full object-cover"
                    onError={() => setAvatarOk(false)}
                  />
                )}
              </span>
              <span className="min-w-0 flex-1">
                <span className="list-title truncate">{DEVELOPER_NAME}</span>
                <span className="list-subtitle truncate">{t('about.role')}</span>
                <span className="mt-0.5 block truncate text-[12px] tabular-nums text-faint">
                  @{DEVELOPER_HANDLE}
                </span>
              </span>
              <ExternalLink size={20} className="shrink-0 text-faint" />
            </button>
          </Group>

          {/* 讨论：Discord 全语言常驻，QQ 群只对简中开放 */}
          <Group label={t('about.sectionCommunity')}>
            <Row
              icon={<MessageCircle size={22} />}
              title={t('settings.discord')}
              subtitle={t('settings.discordHint')}
              onClick={() => openExternal(DISCORD_INVITE_URL)}
              trailing={<ExternalLink size={22} className="shrink-0 text-faint" />}
            />
            {showQq && qqLink && (
              <Row
                icon={<Users size={22} />}
                title={t('settings.qq')}
                subtitle={t('settings.qqHint', { id: QQ_GROUP_ID })}
                onClick={() => openExternal(qqLink)}
                trailing={<ExternalLink size={22} className="shrink-0 text-faint" />}
              />
            )}
          </Group>

          {/* 应用与数据 */}
          <Group label={t('about.sectionApp')}>
            <Row
              icon={<Download size={22} />}
              title={t('about.backupExport')}
              subtitle={t('about.backupExportHint')}
              onClick={handleExport}
              trailing={<ChevronRight size={22} className="shrink-0 text-faint" />}
            />
            <Row
              icon={<Upload size={22} />}
              title={t('about.backupImport')}
              subtitle={t('about.backupImportHint')}
              onClick={() => fileRef.current?.click()}
              trailing={<ChevronRight size={22} className="shrink-0 text-faint" />}
            />
            <Row
              icon={<RefreshCw size={22} className={checking ? 'animate-spin' : ''} />}
              title={checking ? t('settings.checking') : t('settings.checkUpdate')}
              subtitle={`${t('settings.currentVersion')} v${APP_VERSION}`}
              onClick={() => {
                if (!checking) void handleCheckUpdate();
              }}
              trailing={
                updateInfo ? (
                  <span className="shrink-0 rounded-full bg-accent-soft px-2 py-0.5 text-[9.5px] font-semibold text-accent">
                    v{updateInfo.version}
                  </span>
                ) : (
                  <ChevronRight size={22} className="shrink-0 text-faint" />
                )
              }
            />
          </Group>

          {backupMsg && (
            <p
              className={`-mt-3 mb-4 rounded-[14px] px-3 py-2 text-[11px] leading-snug ${NOTICE_TONE[backupMsg.tone]}`}
            >
              {backupMsg.text}
            </p>
          )}

          {checkMsg && (
            <p
              className={`-mt-3 mb-4 rounded-[14px] px-3 py-2 text-[11px] leading-snug ${NOTICE_TONE[checkMsg.tone]}`}
            >
              {checkMsg.text}
            </p>
          )}

          {/* 新版本：原生壳才有安装包可下载，Web / PWA 走顶部提示条 */}
          {updateInfo && (
            <div className="card mb-7 px-5 py-4">
              <div className="flex items-start gap-2">
                <Sparkles size={14} className="mt-0.5 shrink-0 text-accent" />
                <div className="min-w-0 flex-1 leading-tight">
                  <p className="truncate text-[11.5px] font-semibold text-accent">
                    {t('settings.newVersion', { v: updateInfo.version })}
                  </p>
                  <p className="text-[10px] text-subtle">
                    {t('update.current', { v: APP_VERSION })}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={onShowUpdate}
                  className="flex shrink-0 items-center gap-0.5 rounded px-1 py-0.5 text-[10px] text-accent active:bg-press/40"
                >
                  {t('settings.updateNotes')}
                  <ChevronRight size={12} />
                </button>
              </div>

              <button
                type="button"
                onClick={() => openExternal(updateInfo.htmlUrl)}
                className="bg-accent text-accent-on mt-2 flex h-9 w-full items-center justify-center gap-1.5 rounded-[14px] text-[12.5px] font-semibold transition-opacity active:opacity-80"
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

          {/* 项目 */}
          <Group label={t('about.sectionProject')}>
            <Row
              icon={<Github size={22} />}
              title={t('settings.github')}
              subtitle={`github.com/${GITHUB_REPO}`}
              onClick={() => openExternal(GITHUB_REPO_URL)}
              trailing={<ExternalLink size={22} className="shrink-0 text-faint" />}
            />
            <Row
              icon={<FileText size={22} />}
              title={t('about.changelog')}
              subtitle={t('about.changelogHint')}
              onClick={() => openExternal(GITHUB_RELEASES_PAGE)}
              trailing={<ExternalLink size={22} className="shrink-0 text-faint" />}
            />
            <ExpanderRow
              icon={<Sparkles size={22} />}
              title={t('about.credits')}
              subtitle={t('about.creditsHint')}
              body={t('about.creditsBody')}
              open={panel === 'credits'}
              onToggle={() => setPanel(panel === 'credits' ? null : 'credits')}
            />
            <ExpanderRow
              icon={<ShieldCheck size={22} />}
              title={t('about.privacy')}
              subtitle={t('about.privacyHint')}
              body={t('about.privacyBody')}
              open={panel === 'privacy'}
              onToggle={() => setPanel(panel === 'privacy' ? null : 'privacy')}
            />
          </Group>

          {/* 合规兜底：英雄头像与（可选的）Fan Kit 音效都属于 Supercell 的玩家内容 */}
          <p className="px-2 text-center text-[9.5px] leading-relaxed text-faint">
            {t('settings.disclaimer')}
          </p>
        </div>
      </div>

      {/*
        顶部渐隐遮罩：高度只吃掉安全区，列表滚上来时分组标题在这一段淡出，
        不会和状态栏的时间叠在一起。滚动越深越不透明。
      */}
      <div ref={veilRef} aria-hidden className="page-veil" style={{ opacity: 0.82 }} />

      <input
        ref={fileRef}
        type="file"
        accept="application/json,.json"
        className="hidden"
        onChange={(event) => void handleImport(event)}
      />
    </div>
  );
}
