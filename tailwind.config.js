/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // 电竞高对比配色
        ally: '#3B82F6',
        enemy: '#EF4444',
        ban: '#71717A',
        strong: '#22C55E',
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
