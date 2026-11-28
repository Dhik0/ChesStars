import { useLayoutEffect, useRef, type MutableRefObject, type ReactNode, type RefObject } from 'react';

const WIDTH = 144;
const HEIGHT = 200;
const TAU = Math.PI * 2;
const FALLBACK_HUE = 238;
type Rgb = [number, number, number];
type Hsl = [number, number, number];

const hueAngle = (h: number) => (h + 360) % 360;
const hslCss = ([h, s, l]: Hsl, alpha = 1) => `hsla(${h}, ${s}%, ${l}%, ${alpha})`;

function readRgb(value: string): Rgb | null {
  const hex = /^#([\da-f]{3,4}|[\da-f]{6}|[\da-f]{8})$/i.exec(value);
  if (hex) {
    const full = hex[1].length <= 4 ? hex[1].replace(/./g, '$&$&') : hex[1];
    return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16) / 255) as Rgb;
  }
  const rgb = /^rgba?\((.+)\)$/i.exec(value);
  const srgb = /^color\(srgb\s+(.+)\)$/i.exec(value);
  const channels = (rgb?.[1] ?? srgb?.[1])?.split('/')[0].trim().split(/[\s,]+/).slice(0, 3);
  if (channels?.length !== 3) return null;
  // 只取未预乘的 RGB 通道；自定义色即使透明度为 0，光晕仍取其色相。
  const result = channels.map((channel) =>
    channel.endsWith('%') ? Number(channel.slice(0, -1)) / 100 : Number(channel) / (srgb ? 1 : 255),
  );
  return result.every(Number.isFinite)
    ? (result.map((channel) => Math.max(0, Math.min(1, channel))) as Rgb)
    : null;
}

function toHsl([r, g, b]: Rgb): Hsl {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  const l = (max + min) / 2;
  if (!d) return [0, 0, l * 100];
  const h = max === r ? (g - b) / d : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [hueAngle(h * 60), (d / (1 - Math.abs(2 * l - 1))) * 100, l * 100];
}

function toRgb([h, s, l]: Hsl): Rgb {
  const lightness = l / 100;
  const a = (s / 100) * Math.min(lightness, 1 - lightness);
  const channel = (n: number) => {
    const k = (n + h / 30) % 12;
    return lightness - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
  };
  return [channel(0), channel(8), channel(4)];
}

const mix = (bg: Rgb, fg: Rgb, a: number) => bg.map((v, i) => v + (fg[i] - v) * a) as Rgb;
const LUMA = [0.2126, 0.7152, 0.0722];
const luminance = (rgb: Rgb) => rgb.reduce((sum, n, i) =>
  sum + (n <= 0.04045 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4) * LUMA[i], 0);

function contrastAlpha(background: Rgb, tint: Hsl, text: Hsl, opacity: number, darkInk = false) {
  const tintRgb = toRgb(tint);
  const textRgb = toRgb(text);
  const passes = (alpha: number) => {
    const bg = mix(background, tintRgb, alpha);
    const a = luminance(bg) + 0.05;
    const b = luminance(mix(bg, textRgb, opacity)) + 0.05;
    return (darkInk ? a / b : b / a) >= 4.5;
  };
  if (passes(0)) return 0;
  let low = 0;
  let high = 1;
  for (let i = 0; i < 8; i += 1) {
    const alpha = (low + high) / 2;
    if (passes(alpha)) high = alpha;
    else low = alpha;
  }
  return high;
}

function paletteFor(hue: number, light: boolean): Hsl[] {
  const saturation = light ? [84, 90, 78, 72] : [88, 94, 86, 78];
  const lightness = !light ? [35, 28, 42, 48]
    : hue >= 45 && hue <= 85 ? [48, 46, 55, 60] : [56, 52, 62, 68];
  return [-22, 0, 26, 52].map((offset, i) => [hueAngle(hue + offset), saturation[i], lightness[i]]);
}

const ORBS = [
  { x: 0.16, y: 0.21, radius: 0.58, xPeriod: 15, yPeriod: 12 },
  { x: 0.76, y: 0.12, radius: 0.68, xPeriod: 13, yPeriod: 17 },
  { x: 0.89, y: 0.49, radius: 0.65, xPeriod: 18, yPeriod: 14 },
  { x: 0.21, y: 0.57, radius: 0.63, xPeriod: 16, yPeriod: 15 },
];

interface Props {
  glowRef: RefObject<HTMLDivElement>;
  heroRef: RefObject<HTMLDivElement>;
  scrollVisibility: MutableRefObject<(visible: boolean) => void>;
  covered: boolean;
  children: ReactNode;
}

/** 渲染与休眠独立于 React；外层仍由 AboutView 原样处理视差和下拉。 */
export default function AboutMeshGlow({ glowRef, heroRef, scrollVisibility, covered, children }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const setCovered = useRef<(value: boolean) => void>(() => {});

  useLayoutEffect(() => {
    const root = document.documentElement;
    const canvas = canvasRef.current;
    const hero = heroRef.current;
    const mark = hero?.querySelector('svg');
    const title = hero?.querySelector('h1');
    const version = hero?.querySelector('p');
    if (!canvas || !hero || !mark || !title || !version) return;

    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) return;
    const matte = document.createElement('canvas');
    matte.width = WIDTH;
    matte.height = HEIGHT;
    const matteCtx = matte.getContext('2d');
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const orbs = ORBS.map((orb) => ({
      ...orb,
      phase: Math.random() * TAU,
      radius: orb.radius * (0.94 + Math.random() * 0.12),
    }));
    let hue = FALLBACK_HUE;
    let light = false;
    let palette = paletteFor(hue, light);
    let stops: string[][] = [];
    let baseColor = '';
    let themeKey = '';
    let inViewport = true;
    let uncovered = true;
    let scrollVisible = true;
    let frame: number | null = null;
    let lastDraw = 0;
    let elapsed = 0;
    let matteDirty = true;

    // 浅色不叠字区校正，避免流光被暗色横带切断；深色保留原有绘制。
    const paintMatte = () => {
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      if (!matteCtx || !width || !height) return false;
      matteCtx.clearRect(0, 0, WIDTH, HEIGHT);
      if (light) return true;

      const colors = palette.map(toRgb);
      const brightest = [0, 1, 2].map((i) => Math.max(...colors.map((c) => c[i]))) as Rgb;
      const shade: Hsl = [hue, 58, 12];
      const logoInk: Hsl = [hue, 55, 92];
      const versionInk: Hsl = [hue, 45, 80];
      const logoAlpha = contrastAlpha(brightest, shade, logoInk, 1);
      const versionAlpha = contrastAlpha(brightest, shade, versionInk, 0.85);

      // 保持原 92px 图标布局对应的深色校正区域，不因新增方框移动流光颜色。
      const sy = HEIGHT / height;
      const oldMarkSize = 92;
      const layoutShift = (oldMarkSize - (mark.parentElement?.offsetHeight ?? oldMarkSize)) / 2;
      const versionEnd = version.offsetTop + version.offsetHeight + layoutShift;
      const markStart = title.offsetTop + layoutShift - (parseFloat(getComputedStyle(title).marginTop) || 0) - oldMarkSize;
      const band = (top: number, bottom: number, fadeTop: number, fadeBottom: number, color: Hsl, alpha: number) => {
        const span = fadeTop + bottom - top + fadeBottom;
        const gradient = matteCtx.createLinearGradient(0, top - fadeTop, 0, bottom + fadeBottom);
        gradient.addColorStop(0, hslCss(color, 0));
        gradient.addColorStop(fadeTop / span, hslCss(color, alpha));
        gradient.addColorStop(1 - fadeBottom / span, hslCss(color, alpha));
        gradient.addColorStop(1, hslCss(color, 0));
        matteCtx.fillStyle = gradient;
        matteCtx.fillRect(0, top - fadeTop, WIDTH, span);
      };
      band(markStart * sy, versionEnd * sy, 32, 32, shade, Math.max(logoAlpha, versionAlpha));
      const halfInkWidth = Math.min(0.5, (Math.max(oldMarkSize, title.offsetWidth, version.offsetWidth) / 2 + 4) / width);
      const center = matteCtx.createLinearGradient(0, 0, WIDTH, 0);
      center.addColorStop(0, 'transparent');
      center.addColorStop(0.5 - halfInkWidth, '#000');
      center.addColorStop(0.5 + halfInkWidth, '#000');
      center.addColorStop(1, 'transparent');
      matteCtx.globalCompositeOperation = 'destination-in';
      matteCtx.fillStyle = center;
      matteCtx.fillRect(0, 0, WIDTH, HEIGHT);
      matteCtx.globalCompositeOperation = 'source-over';
      return true;
    };

    const draw = () => {
      if (matteDirty) matteDirty = !paintMatte();
      ctx.setTransform(WIDTH, 0, 0, HEIGHT, 0, 0);
      ctx.fillStyle = baseColor;
      ctx.fillRect(0, 0, 1, 1);
      orbs.forEach(({ x, y, phase, radius, xPeriod, yPeriod }, i) => {
        const cx = x + Math.sin(phase + elapsed * TAU / xPeriod) * 0.13;
        const cy = y + Math.cos(phase * 2 + elapsed * TAU / yPeriod) * 0.09;
        const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
        gradient.addColorStop(0, stops[i][0]);
        gradient.addColorStop(0.36, stops[i][1]);
        gradient.addColorStop(1, stops[i][2]);
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, 1, 1);
      });
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      if (matteCtx) ctx.drawImage(matte, 0, 0);
    };

    const syncTheme = () => {
      const primary = getComputedStyle(root).getPropertyValue('--m3-primary').trim();
      const rgb = readRgb(primary) ?? readRgb(getComputedStyle(canvas).color);
      const [h, s] = rgb ? toHsl(rgb) : [FALLBACK_HUE, 0];
      const nextHue = s < 12 ? FALLBACK_HUE : h;
      const theme = root.dataset.theme;
      const key = `${theme}:${nextHue}`;
      if (key === themeKey) return;
      themeKey = key;
      light = theme === 'light';
      hue = nextHue;
      palette = paletteFor(hue, light);
      stops = palette.map((color) => [hslCss(color), hslCss(color, 0.72), hslCss(color, 0)]);
      baseColor = stops[1][0];
      hero.style.setProperty('--about-hero-ink', light ? '#fff' : hslCss([hue, 55, 92]));
      hero.style.setProperty('--about-version-ink', hslCss(light ? [hue, 36, 22] : [hue, 45, 80]));
      matteDirty = true;
      draw();
    };

    const visible = () => inViewport && uncovered && scrollVisible && !document.hidden;
    const canAnimate = () => visible() && !motion.matches;
    const tick = (now: number) => {
      frame = null;
      if (!canAnimate()) return;
      // 漂移足够慢，30 fps 已平顺；停画后的时间不计入相位。
      if (now - lastDraw >= 32) {
        elapsed += Math.min(now - lastDraw, 50) / 1000;
        lastDraw = now;
        draw();
      }
      frame = window.requestAnimationFrame(tick);
    };
    const syncPlayback = () => {
      if (!canAnimate()) {
        if (frame !== null) window.cancelAnimationFrame(frame);
        frame = null;
        if (visible() && matteDirty) draw();
      } else if (frame === null) {
        if (matteDirty) draw();
        lastDraw = performance.now();
        frame = window.requestAnimationFrame(tick);
      }
    };
    scrollVisibility.current = (value) => {
      if (value === scrollVisible) return;
      scrollVisible = value;
      syncPlayback();
    };
    setCovered.current = (value) => {
      uncovered = !value;
      syncPlayback();
    };
    syncTheme();
    const themeObserver = new MutationObserver(syncTheme);
    themeObserver.observe(root, {
      attributes: true,
      attributeFilter: ['style', 'class', 'data-theme', 'data-monet', 'data-accent'],
    });
    const intersection = typeof IntersectionObserver === 'undefined' ? null : new IntersectionObserver(([entry]) => {
      inViewport = entry.isIntersecting;
      syncPlayback();
    });
    intersection?.observe(canvas);
    const layoutKey = () => `${canvas.clientWidth}:${canvas.clientHeight}:${mark.clientHeight}:${title.offsetTop}:${title.offsetWidth}:${version.offsetTop}:${version.offsetHeight}`;
    let lastLayout = layoutKey();
    const resize = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => {
      const nextLayout = layoutKey();
      if (nextLayout === lastLayout) return;
      lastLayout = nextLayout;
      matteDirty = true;
      if (visible()) draw();
    });
    resize?.observe(canvas);
    resize?.observe(hero);
    resize?.observe(mark);
    resize?.observe(title);
    resize?.observe(version);
    document.addEventListener('visibilitychange', syncPlayback);
    motion.addEventListener('change', syncPlayback);
    syncPlayback();

    return () => {
      if (frame !== null) window.cancelAnimationFrame(frame);
      themeObserver.disconnect();
      intersection?.disconnect();
      resize?.disconnect();
      document.removeEventListener('visibilitychange', syncPlayback);
      motion.removeEventListener('change', syncPlayback);
      scrollVisibility.current = () => {};
      setCovered.current = () => {};
    };
  }, [glowRef, heroRef, scrollVisibility]);

  useLayoutEffect(() => setCovered.current(covered), [covered]);

  return (
    <>
      <div
        ref={glowRef}
        aria-hidden
        className="about-hero-glow about-pull-layer absolute inset-x-0 top-0 h-[74dvh] w-full"
        style={{ opacity: 1, willChange: 'opacity, transform' }}
      >
        <canvas ref={canvasRef} width={WIDTH} height={HEIGHT} className="block h-full w-full" />
      </div>
      <div
        ref={heroRef}
        className="about-hero absolute inset-x-0 top-0 flex flex-col items-center justify-center px-6 text-center"
        style={{
          height: '54dvh',
          paddingTop: 'env(safe-area-inset-top, 0px)',
          transform: 'translate3d(0, 0, 0)',
          willChange: 'opacity, transform',
        }}
      >
        {children}
      </div>
    </>
  );
}
