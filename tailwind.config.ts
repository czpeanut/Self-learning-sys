import type { Config } from 'tailwindcss'

// 視覺：參照 student-app v2「Industry」的方角、細分隔線、等寬標籤、資料矩陣；
// 自習練功房的差異：方格紙底、墨綠主色、IBM Plex 字體、L 形角框（v2 是十字定位標記）
const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}', './lib/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // 主色：墨綠（與圖表的第一資料色一致）
        brand: { 50: '#ecf5f2', 100: '#d3e8e1', 500: '#2b6f62', 600: '#225a4f', 700: '#1a463e' },
        ink: { DEFAULT: '#1b1d1c', soft: '#4d524f', muted: '#7d837f' },
        paper: '#f3f3ef',
        line: { DEFAULT: 'rgba(27, 29, 28, 0.14)', strong: 'rgba(27, 29, 28, 0.28)' },
      },
      fontFamily: {
        sans: ['"IBM Plex Sans"', '"Noto Sans TC"', 'system-ui', '-apple-system', 'PingFang TC', 'Microsoft JhengHei', 'sans-serif'],
        head: ['"IBM Plex Sans Condensed"', '"Noto Sans TC"', 'system-ui', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      // 方角：所有圓角類別都收成直角，只留 rounded-full（圓點、進度指示）
      borderRadius: { none: '0', sm: '0', DEFAULT: '0', md: '0', lg: '0', xl: '0', '2xl': '0', '3xl': '0', full: '9999px' },
    },
  },
  plugins: [],
}
export default config
