import type { Config } from 'tailwindcss'

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}', './lib/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // 主色：與圖表的第一資料色一致
        brand: { 50: '#eef5fd', 100: '#d7e7fa', 500: '#2a78d6', 600: '#1f64b8', 700: '#194f91' },
        ink: { DEFAULT: '#1c1b19', soft: '#52514e', muted: '#8a8984' },
        paper: '#f7f6f3',
      },
      fontFamily: {
        sans: ['"Noto Sans TC"', 'system-ui', '-apple-system', 'PingFang TC', 'Microsoft JhengHei', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
export default config
