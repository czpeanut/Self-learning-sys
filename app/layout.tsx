import type { Metadata, Viewport } from 'next'
import './globals.css'
import Nav from '@/components/Nav'

export const metadata: Metadata = {
  title: '自習練功房',
  description: '國中生自主學習系統：選範圍 → 自適應多波練習 → 學習報告',
}

export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#f7f6f3' }

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-TW">
      <body className="min-h-dvh">
        <Nav />
        <main className="mx-auto max-w-5xl px-4 pb-24 pt-4 sm:pt-6">{children}</main>
      </body>
    </html>
  )
}
