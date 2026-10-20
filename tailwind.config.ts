import type { Config } from 'tailwindcss'

// 視覺「霓虹方塊」（設計稿 G 淺色版）：版面與漸層參照市售學習 App（彩色功能入口、主色區塊、白色卡片），
// 再加上計分板的稜角——方框＋切角（.cut：右上角斜切）＋卡片右上角的漸層角標（見 globals.css）
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
      // 方框：圓角類別都收成直角（只留 rounded-full 給圓點）；稜角靠切角 .cut 與卡片角標
      borderRadius: { none: '0', sm: '0', DEFAULT: '0', md: '0', lg: '0', xl: '0', '2xl': '0', '3xl': '0' },
      boxShadow: {
        card: '0 1px 0 rgba(18, 26, 46, 0.05)',
        lift: '0 12px 28px -18px rgba(18, 26, 46, 0.35)',
      },
    },
  },
  plugins: [],
}
export default config
