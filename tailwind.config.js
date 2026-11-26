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
      },
      animation: {
        'slide-up': 'slide-up 160ms ease-out',
        'fade-in': 'fade-in 120ms ease-out',
        'grade-pop': 'grade-pop 340ms cubic-bezier(0.2, 0.9, 0.3, 1.35) both',
      },
    },
  },
  plugins: [],
};
