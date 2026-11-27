/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        /*
         * 语义色板：全部指向 index.css 里的 `--c-*` 变量，
         * 由 `<html data-theme="oled | navy | light">` 切换取值。
         * 用 `rgb(var(--x) / <alpha-value>)` 是为了保留 `/60` 这类透明度写法。
         */
        app: 'rgb(var(--c-app) / <alpha-value>)',
        surface: 'rgb(var(--c-surface) / <alpha-value>)',
        raised: 'rgb(var(--c-raised) / <alpha-value>)',
        press: 'rgb(var(--c-press) / <alpha-value>)',
        line: 'rgb(var(--c-line) / <alpha-value>)',
        'line-strong': 'rgb(var(--c-line-strong) / <alpha-value>)',

        fg: 'rgb(var(--c-fg) / <alpha-value>)',
        body: 'rgb(var(--c-body) / <alpha-value>)',
        muted: 'rgb(var(--c-muted) / <alpha-value>)',
        subtle: 'rgb(var(--c-subtle) / <alpha-value>)',
        faint: 'rgb(var(--c-faint) / <alpha-value>)',

        brand: 'rgb(var(--c-brand) / <alpha-value>)',
        gold: 'rgb(var(--c-gold) / <alpha-value>)',
        brilliant: 'rgb(var(--c-brilliant) / <alpha-value>)',
        mark: 'rgb(var(--c-mark) / <alpha-value>)',

        // 电竞高对比配色（阵营色随主题走，浅色下会压深一档）
        ally: 'rgb(var(--c-ally) / <alpha-value>)',
        enemy: 'rgb(var(--c-enemy) / <alpha-value>)',
        ban: '#71717A',
        strong: 'rgb(var(--c-strong) / <alpha-value>)',
        danger: 'rgb(var(--c-danger) / <alpha-value>)',
        ink: '#0B0F19',
      },
      fontFamily: {
        sans: [
          '-apple-system',
          'BlinkMacSystemFont',
          '"Segoe UI"',
          '"PingFang SC"',
          '"Hiragino Sans GB"',
          '"Microsoft YaHei"',
          'sans-serif',
        ],
      },
      keyframes: {
        'slide-up': {
          '0%': { transform: 'translateY(12px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        'fade-in': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        // 复盘评级角标揭晓：先弹大再回弹到位，配合 350ms 的逐个节奏
        'grade-pop': {
          '0%': { transform: 'scale(0.4) rotate(-10deg)', opacity: '0' },
          '60%': { transform: 'scale(1.14) rotate(3deg)', opacity: '1' },
          '100%': { transform: 'scale(1) rotate(0deg)', opacity: '1' },
        },
        /*
         * `!!` 妙手联动特效。只用 transform / opacity / box-shadow 三件套，
         * 全程走合成层，不会触发重排；配合 index.css 里的 reduced-motion 关停。
         */
        'brilliant-sweep': {
          '0%': { transform: 'translateX(-130%) skewX(-18deg)', opacity: '0' },
          '12%': { opacity: '0.9' },
          '70%': { opacity: '0.55' },
          '100%': { transform: 'translateX(240%) skewX(-18deg)', opacity: '0' },
        },
        'brilliant-ring': {
          '0%': { transform: 'scale(0.85)', opacity: '0.95' },
          '70%': { opacity: '0.35' },
          '100%': { transform: 'scale(2.3)', opacity: '0' },
        },
        'brilliant-flash': {
          '0%': { opacity: '0.85' },
          '100%': { opacity: '0' },
        },
        // 顶部高光播报条：淡入 → 停留 → 淡出，2s 一轮
        'banner-life': {
          '0%': { opacity: '0', transform: 'translateY(-6px)' },
          '10%': { opacity: '1', transform: 'translateY(0)' },
          '85%': { opacity: '1' },
          '100%': { opacity: '0' },
        },
      },
      animation: {
        'slide-up': 'slide-up 160ms ease-out',
        'fade-in': 'fade-in 120ms ease-out',
        'grade-pop': 'grade-pop 340ms cubic-bezier(0.2, 0.9, 0.3, 1.35) both',
        'brilliant-sweep': 'brilliant-sweep 900ms cubic-bezier(0.22, 0.61, 0.36, 1) both',
        'brilliant-ring': 'brilliant-ring 850ms ease-out both',
        'brilliant-flash': 'brilliant-flash 520ms ease-out both',
        'banner-life': 'banner-life 2s ease-out both',
      },
    },
  },
  plugins: [],
};
