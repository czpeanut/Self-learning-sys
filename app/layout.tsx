import type { Metadata, Viewport } from 'next'
import './globals.css'
import Nav from '@/components/Nav'
import RegisterSW from '@/components/RegisterSW'

export const metadata: Metadata = {
  title: '自習練功房',
  description: '國中生自主學習系統：選範圍 → 自適應多波練習 → 學習報告',
  applicationName: '自習練功房',
  // iPhone「加入主畫面」後全螢幕開啟、狀態列配色、主畫面名稱
  appleWebApp: { capable: true, title: '練功房', statusBarStyle: 'default' },
  icons: {
    icon: [{ url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' }, { url: '/icons/icon.svg', type: 'image/svg+xml' }],
    apple: [{ url: '/icons/apple-touch-icon.png', sizes: '180x180' }],
  },
  formatDetection: { telephone: false },
}

export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#2a78d6', viewportFit: 'cover' }

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-TW">
      <body className="min-h-dvh">
        <RegisterSW />
        <Nav />
        <main className="mx-auto max-w-5xl px-4 pb-24 pt-4 sm:pt-6">{children}</main>
      </body>
    </html>
  )
}
