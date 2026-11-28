import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type ChangeEvent,
  type ReactNode,
} from 'react';
import {
  ArrowLeft,
  ChevronRight,
  Download,
  ExternalLink,
  FileText,
  Github,
  MessageCircle,
  RefreshCw,
  Sparkles,
  Upload,
  Users,
} from 'lucide-react';
import AboutMeshGlow from './AboutMeshGlow';
import { PageVeil } from './PageHeader';
import {
  APP_NAME,
  APP_VERSION,
  DEVELOPER_AVATAR,
  DEVELOPER_HANDLE,
  DEVELOPER_NAME,
  DEVELOPER_URL,
  DISCORD_INVITE_URL,
  GITHUB_REPO_URL,
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
import { SWIPE_BACK_EASE, SWIPE_BACK_MS, useSwipeBack } from '../utils/useSwipeBack';
import { useTheme } from '../utils/useTheme';

/** 前景卡片从首屏约 52% 处开始，首屏只露出开发者与 Discord 入口。 */
const CONTENT_TOP = '52dvh';

/** 更新日志：直接落到 Release 列表页（不是某一版，用户想往回翻） */
const RELEASES_URL = `${GITHUB_REPO_URL}/releases`;

/**
 * ChesStars 标记：把 `favicon.svg` 的白色线稿转成亮度遮罩，再整块填当前色。
 *
 * 原始 SVG 自带一块纯黑底，直接当图片用会在主题氛围光上压出一块黑方块；
 * 转成遮罩后黑色部分自然变透明，只剩单色线稿；颜色继承当前 Hero 配色。
 */
function ChesMark() {
  return (
    <svg
      viewBox="0 0 1024 1024"
      aria-hidden
      className="h-[56px] w-[56px]"
    >
      <defs>
        <mask
          id="about-ches-mark"
          maskUnits="userSpaceOnUse"
          x="0"
          y="0"
          width="1024"
          height="1024"
        >
          <path
            d="M386.019 804.906V512C386.019 474.866 399.292 439.252 422.918 412.994C446.544 386.736 478.588 371.984 512 371.984C545.412 371.984 577.456 386.736 601.082 412.994C624.708 439.252 637.981 474.866 637.981 512V804.906"
            fill="none"
            stroke="white"
            strokeWidth="44"
            strokeLinecap="square"
            strokeLinejoin="round"
          />
          <path
            d="M512 163V909"
            fill="none"
            stroke="white"
            strokeWidth="44"
            strokeLinecap="square"
            strokeLinejoin="round"
          />
          <path
            d="M386.019 219.094V512C386.019 549.134 399.292 584.748 422.918 611.006C446.544 637.264 478.588 652.016 512 652.016C545.412 652.016 577.456 637.264 601.082 611.006C624.708 584.748 637.981 549.134 637.981 512V219.094"
            fill="none"
            stroke="white"
            strokeWidth="44"
            strokeLinecap="square"
            strokeLinejoin="round"
          />
          <path
            d="M115 588C379.667 466.667 644.333 466.667 909 588"
            fill="none"
            stroke="white"
            strokeWidth="44"
            strokeLinecap="square"
            strokeLinejoin="round"
          />
          {/* 六边形外圈留空（原图是黑底）→ 挖出透明缝，线稿不糊成一团 */}
          <path
            d="M512 326L641.401 380.478L695 512L641.401 643.522L512 698L382.599 643.522L329 512L382.599 380.478L512 326Z"
            fill="black"
          />
          <path
            d="M512 372L615.238 413.005L658 512L615.238 610.995L512 652L408.762 610.995L366 512L408.762 413.005L512 372Z"
            fill="white"
          />
          {/* 五官同样挖空，透出背后的光晕 */}
          <path
            d="M529 502.39C532.555 511.188 539.796 518.077 549.13 521.543C558.464 525.008 569.128 524.765 578.774 520.868C588.42 516.97 596.259 509.738 600.567 500.761C604.874 491.784 605.297 481.798 601.743 473L529 502.39Z"
            fill="black"
          />
          <path d="M512 532L495 560H529L512 532Z" fill="black" />
          <path
            d="M457 533C476.33 533 492 517.33 492 498C492 478.67 476.33 463 457 463C437.67 463 422 478.67 422 498C422 517.33 437.67 533 457 533Z"
            fill="black"
          />
        </mask>
      </defs>
      <rect width="1024" height="1024" fill="currentColor" mask="url(#about-ches-mark)" />
    </svg>
  );
}

/**
 * 「引用」子页列出的项目与数据源。
 *
 * 只写项目当前真实使用的依赖与数据来源，名称与官网地址都按官方口径填，
 * 不编造作者或仓库路径——这类页面一旦写错，比不写更糟。
 */
const CREDITS: ReadonlyArray<{ name: string; url: string }> = [
  { name: 'BrawlAPI', url: 'https://brawlapi.com' },
  { name: 'Brawlify', url: 'https://brawlify.com' },
  { name: 'React', url: 'https://react.dev' },
  { name: 'Capacitor', url: 'https://capacitorjs.com' },
  { name: 'Tailwind CSS', url: 'https://tailwindcss.com' },
  { name: 'Vite', url: 'https://vite.dev' },
  { name: 'TypeScript', url: 'https://www.typescriptlang.org' },
  { name: 'Lucide', url: 'https://lucide.dev' },
];

interface AboutViewProps {
  /** 导出备份时打包的战绩 */
  records: MatchRecord[];
  /** 已发现的新版本；null = 没有更新 */
  updateInfo: UpdateInfo | null;
  /** 远程清单里的 QQ 群链接；null = 用打包内置的 version.json */
  qqGroupUrl: string | null;
  /** 有子页推入时，底层主界面微微左移 */
  subpageOpen: boolean;
  onCheckUpdate: () => Promise<UpdateCheckOutcome>;
  /** 打开更新说明弹窗 */
  onShowUpdate: () => void;
  /** 推入「引用」二级子页 */
  onOpenCredits: () => void;
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

/**
 * 列表行标尺（DESIGN.md 第 3 节）：min-h 64px、16/14 内距、
 * 22px 左侧图标、17px 主字 / 13px 副字。行间不画分割线，靠卡片缝隙分隔。
 */
const ROW_BASE = 'flex w-full min-h-[64px] items-center gap-3.5 px-4 py-3.5 text-left';

/** 分组：小标题独立置于分段卡片组上方 10px，组内每行独立成卡 */
function Group({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section className="mb-7">
      <h2 className="section-label">{label}</h2>
      <div className="m3-group">{children}</div>
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
  icon?: ReactNode;
  title: string;
  subtitle?: string;
  onClick: () => void;
  trailing?: ReactNode;
}) {
  return (
    <button type="button" onClick={onClick} className={`m3-item ${ROW_BASE}`}>
      {icon ? <span className="list-icon">{icon}</span> : null}
      <span className="min-w-0 flex-1">
        <span className="list-title truncate">{title}</span>
        {subtitle ? <span className="list-subtitle truncate">{subtitle}</span> : null}
      </span>
      {trailing ?? <ChevronRight size={20} className="shrink-0 text-faint" />}
    </button>
  );
}

/**
 * 「关于」一级页面（底部导航第四个 Tab）。
 *
 * 顶部是一层滚动驱动的层叠 Hero：流体光晕与图标 / 名称 / 版本号
 * 都钉在视口顶部，列表整体压在上层，向上滚动时直接从 Hero 上平滑掠过。
 * 下面按开发者 / 讨论 / 应用与数据 / 项目分四组大圆角卡片。
 *
 * 滚动行为：Hero 与氛围光随滚动距离渐隐 + 轻微视差，全部由 rAF 直写 transform /
 * opacity，不经过 state；关于主 Tab 由 App 隐藏顶部通用遮罩，让氛围光从屏幕顶边铺开。
 *
 * 这里的「检查更新 / 仓库 / 社群」等文案直接复用 settings.* 词条——
 * 它们已经从设置页整体搬到这里，没必要在词库里存两份一模一样的句子。
 */
export default function AboutView({
  records,
  updateInfo,
  qqGroupUrl,
  subpageOpen,
  onCheckUpdate,
  onShowUpdate,
  onOpenCredits,
  onImported,
}: AboutViewProps) {
  const { t, lang } = useTranslation();
  const { mode, monetEnabled, accentColor } = useTheme();

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const heroRef = useRef<HTMLDivElement | null>(null);
  const glowRef = useRef<HTMLDivElement | null>(null);
  const meshScrollVisibility = useRef<(visible: boolean) => void>(() => {});
  const foregroundRef = useRef<HTMLDivElement | null>(null);
  const rafRef = useRef(0);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const [checking, setChecking] = useState(false);
  const [checkMsg, setCheckMsg] = useState<Notice | null>(null);
  const [backupMsg, setBackupMsg] = useState<Notice | null>(null);
  /** GitHub 头像拉不到（离线 / 被墙）时退回首字母，不留一个破图 */
  const [avatarOk, setAvatarOk] = useState(true);

  /**
   * 滚动视差与顶部拉伸均直接写入合成层属性，不经 setState。
   * 滚动回调只登记 rAF；下拉手势在滚动顶端阻尼跟手，松手由 CSS Emphasized 曲线回弹。
   * 减弱动态效果时保留滚动淡出，但不做上移、缩放或下拉拉伸。
   */
  useEffect(() => {
    const scroller = scrollRef.current;
    if (!scroller) return;

    const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    let reduced = motionQuery.matches;
    let touchStartY: number | null = null;
    let touchStartedAtTop = false;
    let touchDelta = 0;
    let pullActive = false;

    const setPull = (distance: number, dragging: boolean) => {
      const foreground = foregroundRef.current;
      const glow = glowRef.current;
      if (!foreground || !glow) return;

      const dy = reduced ? 0 : Math.min(180, Math.max(0, distance));
      foreground.classList.toggle('about-pull-active', dragging && !reduced);
      glow.classList.toggle('about-pull-active', dragging && !reduced);
      foreground.style.transform = `translate3d(0, ${dy}px, 0)`;
      const glowHeight = Math.max(1, glow.clientHeight);
      glow.style.transform = `scaleY(${1 + dy / glowHeight})`;
      pullActive = dy > 0;
    };

    const paint = () => {
      const scrollTop = scroller.scrollTop;
      const p = Math.min(1, Math.max(0, Math.max(0, scrollTop) / 280));

      const hero = heroRef.current;
      if (hero) {
        const fadeP = Math.max(0, (p - 0.18) / 0.82);
        hero.style.opacity = String(Math.max(0, 1 - Math.pow(fadeP, 1.35)));
        hero.style.transform = reduced
          ? 'none'
          : `translate3d(0, ${-p * 12}px, 0) scale(${1 - p * 0.08})`;
      }

      // 氛围光：上滑时渐隐；原生 WebKit 负 scrollTop 也并入下拉阻尼。
      const glow = glowRef.current;
      if (glow) glow.style.opacity = String(Math.max(0, 1 - Math.pow(p, 1.1)));
      meshScrollVisibility.current(p < 1);

      if (touchStartY !== null && touchStartedAtTop && !reduced) {
        const nativePull = scrollTop < 0 ? -scrollTop * 0.42 : 0;
        const gesturePull = touchDelta * 0.42;
        if (nativePull > 0 || gesturePull > 0 || pullActive) {
          setPull(Math.max(nativePull, gesturePull), true);
        }
      }
    };

    const requestPaint = () => {
      if (rafRef.current) return;
      rafRef.current = window.requestAnimationFrame(() => {
        rafRef.current = 0;
        paint();
      });
    };

    const onTouchStart = (event: TouchEvent) => {
      if (!event.touches.length) return;
      touchStartY = event.touches[0].clientY;
      touchStartedAtTop = scroller.scrollTop <= 0;
      touchDelta = 0;
    };

    const onTouchMove = (event: TouchEvent) => {
      if (reduced || touchStartY === null || !touchStartedAtTop || !event.touches.length) return;
      const delta = event.touches[0].clientY - touchStartY;
      if (delta > 0 && scroller.scrollTop <= 0) {
        event.preventDefault();
        touchDelta = delta;
        requestPaint();
      } else if (delta <= 0 && touchDelta > 0) {
        touchDelta = 0;
        requestPaint();
      }
    };

    const releasePull = () => {
      const hadPull = pullActive || touchDelta > 0;
      touchStartY = null;
      touchStartedAtTop = false;
      touchDelta = 0;
      if (hadPull) setPull(0, false);
      else {
        foregroundRef.current?.classList.remove('about-pull-active');
        glowRef.current?.classList.remove('about-pull-active');
      }
    };

    const onMotionChange = () => {
      reduced = motionQuery.matches;
      if (reduced) releasePull();
      paint();
    };

    paint();
    scroller.addEventListener('scroll', requestPaint, { passive: true });
    scroller.addEventListener('touchstart', onTouchStart, { passive: true });
    scroller.addEventListener('touchmove', onTouchMove, { passive: false });
    scroller.addEventListener('touchend', releasePull, { passive: true });
    scroller.addEventListener('touchcancel', releasePull, { passive: true });
    motionQuery.addEventListener('change', onMotionChange);

    return () => {
      scroller.removeEventListener('scroll', requestPaint);
      scroller.removeEventListener('touchstart', onTouchStart);
      scroller.removeEventListener('touchmove', onTouchMove);
      scroller.removeEventListener('touchend', releasePull);
      scroller.removeEventListener('touchcancel', releasePull);
      motionQuery.removeEventListener('change', onMotionChange);
      if (rafRef.current) window.cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
      const foreground = foregroundRef.current;
      const glow = glowRef.current;
      foreground?.classList.remove('about-pull-active');
      glow?.classList.remove('about-pull-active');
      if (foreground) foreground.style.transform = 'translate3d(0, 0, 0)';
      if (glow) glow.style.transform = 'scaleY(1)';
    };
  }, []);

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
      // 备份格式里的 darkPalette 是旧版字段：纯黑档写 oled，其余深色一律写 dark
      prefs: {
        themeMode: mode,
        darkPalette: mode === 'oled' ? 'oled' : 'dark',
        monetEnabled,
        accentColor,
        lang,
      },
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
    <div
      className={`relative flex h-full min-h-0 flex-col bg-app ${
        subpageOpen ? 'settings-underlay' : ''
      }`}
    >
      <div
        ref={scrollRef}
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain"
      >
        {/*
          滞留舞台：高度 0 的 sticky 容器，两个绝对定位子层（氛围光 / Hero）不参与
          列表排版，滚动时钉在视口顶部，只靠 transform / opacity 变化，不触发 React 重绘。
        */}
        <div className="pointer-events-none sticky top-0 z-0 h-0">
          <AboutMeshGlow
            glowRef={glowRef}
            heroRef={heroRef}
            scrollVisibility={meshScrollVisibility}
            covered={subpageOpen}
          >
            <div className="about-hero-icon flex h-[84px] w-[84px] shrink-0 items-center justify-center rounded-[24px]">
              <ChesMark />
            </div>
            <h1 className="mt-4 text-[30px] font-medium tracking-tight">{APP_NAME}</h1>
            <p className="about-hero-version mt-1.5 text-[13px]">v{APP_VERSION}</p>
          </AboutMeshGlow>
        </div>

        <div
          ref={foregroundRef}
          className="about-foreground about-pull-layer relative z-10 px-4 pb-8"
          style={{ paddingTop: CONTENT_TOP, willChange: 'transform' }}
        >
          {/* 开发者 */}
          <Group label={t('about.sectionDeveloper')}>
            <button
              type="button"
              onClick={() => openExternal(DEVELOPER_URL)}
              className={`m3-item ${ROW_BASE}`}
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
              onClick={() => openExternal(DISCORD_INVITE_URL)}
              trailing={<ExternalLink size={22} className="shrink-0 text-faint" />}
            />
            {showQq && qqLink && (
              <Row
                icon={<Users size={22} />}
                title={t('settings.qq')}
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
              onClick={handleExport}
              trailing={<ChevronRight size={22} className="shrink-0 text-faint" />}
            />
            <Row
              icon={<Upload size={22} />}
              title={t('about.backupImport')}
              onClick={() => fileRef.current?.click()}
              trailing={<ChevronRight size={22} className="shrink-0 text-faint" />}
            />
            <Row
              icon={<RefreshCw size={22} className={checking ? 'animate-spin' : ''} />}
              title={checking ? t('settings.checking') : t('settings.checkUpdate')}
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
            <div className="m3-group mb-7">
              <div className="m3-item px-4 py-3.5">
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
                  className="bg-accent text-accent-on mt-2 flex h-9 w-full items-center justify-center gap-1.5 rounded-[14px] text-[12.5px] font-medium transition-opacity active:opacity-80"
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
            </div>
          )}

          {/* 项目：仓库 / 更新日志走外部浏览器，「引用」推入二级子页 */}
          <Group label={t('about.sectionProject')}>
            <Row
              icon={<Github size={22} />}
              title={t('settings.github')}
              onClick={() => openExternal(GITHUB_REPO_URL)}
              trailing={<ExternalLink size={22} className="shrink-0 text-faint" />}
            />
            <Row
              icon={<FileText size={22} />}
              title={t('about.changelog')}
              onClick={() => openExternal(RELEASES_URL)}
              trailing={<ExternalLink size={22} className="shrink-0 text-faint" />}
            />
            <Row
              icon={<Sparkles size={22} />}
              title={t('about.credits')}
              onClick={onOpenCredits}
              trailing={<ChevronRight size={22} className="shrink-0 text-faint" />}
            />
          </Group>

          {/* 合规兜底：英雄头像与（可选的）Fan Kit 音效都属于 Supercell 的玩家内容 */}
          <p className="px-2 text-center text-[9.5px] leading-relaxed text-faint">
            {t('settings.disclaimer')}
          </p>
        </div>
      </div>

      {/* 主 Tab 的遮罩由 App 的 about-main-tab 样式隐藏；子页仍保留自己的 PageVeil。 */}
      <div aria-hidden className="page-veil" style={{ opacity: 0 }} />

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

/* ------------------------------------------------------------------ *
 * 二级子页：引用
 * ------------------------------------------------------------------ */

/**
 * 推入式「引用」子页：整屏从右侧滑入，底层关于页左移压暗（与设置二级子页同一套）。
 * 返回箭头 / 跟手右滑 / 系统返回键都走同一条 260ms 曲线，动画播完才让 App 卸载 DOM。
 */
export const AboutSubpage = forwardRef<{ requestClose: () => void }, { onBack: () => void }>(
  function AboutSubpage({ onBack }, ref) {
    const { t } = useTranslation();
    const pageRef = useRef<HTMLDivElement | null>(null);
    const scrimRef = useRef<HTMLDivElement | null>(null);
    const closeTimer = useRef<number | null>(null);
    const finished = useRef(false);

    const commitClose = useCallback(() => {
      if (finished.current) return;
      finished.current = true;
      onBack();
    }, [onBack]);

    useEffect(
      () => () => {
        if (closeTimer.current !== null) window.clearTimeout(closeTimer.current);
      },
      [],
    );

    /** 返回箭头 / 返回键 / Escape：整块滑出右侧后再让 App 卸载子页 */
    const requestClose = () => {
      if (finished.current) return;
      const pageEl = pageRef.current;
      const scrim = scrimRef.current;
      const easing = `transform ${SWIPE_BACK_MS}ms ${SWIPE_BACK_EASE}`;
      if (pageEl) {
        pageEl.style.animation = 'none';
        pageEl.style.transition = easing;
        pageEl.style.transform = 'translate3d(100%, 0, 0)';
      }
      if (scrim) {
        scrim.style.transition = `opacity ${SWIPE_BACK_MS}ms ${SWIPE_BACK_EASE}`;
        scrim.style.opacity = '0';
      }
      closeTimer.current = window.setTimeout(commitClose, SWIPE_BACK_MS);
    };

    /** App 的返回键 / Escape 走同一条路径，避免绕过退场直接卸载 */
    const closeRef = useRef(requestClose);
    closeRef.current = requestClose;
    useImperativeHandle(ref, () => ({ requestClose: () => closeRef.current() }), []);

    const swipeHandlers = useSwipeBack({
      enabled: true,
      pageRef,
      scrimRef,
      onBack: commitClose,
    });

    return (
      <div className="absolute inset-0 z-40">
        <div
          ref={scrimRef}
          className="absolute inset-0 bg-black/45"
          style={{ opacity: 1 }}
          onClick={requestClose}
          aria-hidden
        />
        <div
          ref={pageRef}
          className="absolute inset-0 flex flex-col bg-app animate-subpage-in"
          style={{ touchAction: 'pan-y' }}
          {...swipeHandlers}
        >
          <header className="subpage-head">
            <button
              type="button"
              onClick={requestClose}
              className="subpage-back"
              aria-label={t('picker.back')}
            >
              <ArrowLeft size={22} strokeWidth={2.2} />
            </button>
            <h1 className="page-title font-medium">{t('about.credits')}</h1>
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-8">
            {/* 顶部说明卡：单独一张 20px 圆角卡，只讲一句致谢 */}
            <div className="m3-group mb-7">
              <div className="m3-item px-4 py-3.5">
                <p className="text-[13.5px] leading-relaxed text-muted">
                  {t('about.creditsIntro')}
                </p>
              </div>
            </div>

            {/* 引用项目：分段组合卡片，点一行去对应官网 / 仓库 */}
            <Group label={t('about.creditsSection')}>
              {CREDITS.map((item) => (
                <Row
                  key={item.url}
                  title={item.name}
                  subtitle={item.url.replace(/^https?:\/\//, '')}
                  onClick={() => openExternal(item.url)}
                  trailing={<ExternalLink size={20} className="shrink-0 text-faint" />}
                />
              ))}
            </Group>
          </div>

          <PageVeil />
        </div>
      </div>
    );
  },
);
