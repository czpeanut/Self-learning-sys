import type { Metadata, Viewport } from 'next'
import './globals.css'
import LoginGate from '@/components/LoginGate'
import Shell from '@/components/Shell'
import { InstallPopup } from '@/components/InstallApp'
import RegisterSW from '@/components/RegisterSW'
import { EARLY_CAPTURE_SCRIPT } from '@/lib/install-script'

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

export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#f4f6fb', viewportFit: 'cover' }

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-TW">
      <head>
        <script dangerouslySetInnerHTML={{ __html: EARLY_CAPTURE_SCRIPT }} />
      </head>
      <body className="min-h-dvh">
        <RegisterSW />
        <InstallPopup />
        <LoginGate>
          <Shell>{children}</Shell>
        </LoginGate>
      </body>
    </html>
  )
}
