import type { Config } from 'tailwindcss'

// 視覺「霓虹方塊」（設計稿 G 淺色版）：版面與漸層參照市售學習 App（彩色功能入口、主色區塊、圓角卡片），
// 再加上計分板的稜角——招牌形狀是「一角尖」：右上角收成尖角，其餘三角圓角（.leaf，見 globals.css）
const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}', './lib/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // 主色：深薄荷綠（品牌漸層「黃綠 → 薄荷 → 天藍」中可放在白底上當文字的那一段）
        brand: { 50: '#e9faf2', 100: '#c9f2df', 500: '#0e9f6e', 600: '#0b8a5f', 700: '#086b4a' },
        ink: { DEFAULT: '#121a2e', soft: '#4a5470', muted: '#66708a' },
        paper: '#f4f6fb',
        line: { DEFAULT: '#e4e8f0', strong: '#cfd5e1' },
      },
      fontFamily: {
        sans: ['"Noto Sans TC"', 'system-ui', '-apple-system', 'PingFang TC', 'Microsoft JhengHei', 'sans-serif'],
        // 標題與數字：Rubik（英數）＋ Noto Sans TC（中文）
        head: ['Rubik', '"Noto Sans TC"', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      borderRadius: { sm: '6px', DEFAULT: '8px', md: '10px', lg: '12px', xl: '14px', '2xl': '18px', '3xl': '24px' },
      boxShadow: {
        card: '0 10px 28px -16px rgba(18, 26, 46, 0.22)',
        lift: '0 18px 40px -18px rgba(18, 26, 46, 0.30)',
      },
    },
  },
  plugins: [],
}
export default config
