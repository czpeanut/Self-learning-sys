'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const LINKS = [
  { href: '/', label: '首頁' },
  { href: '/practice/new', label: '開始自習' },
  { href: '/wrong-book', label: '錯題本' },
  { href: '/progress', label: '學習歷程' },
]

export default function Nav() {
  const path = usePathname()
  // 作答中隱藏導覽，減少分心（右上角有「暫停」可離開）
  if (path.startsWith('/practice/session')) return null
  return (
    <header className="no-print sticky top-0 z-20 border-b border-black/5 bg-paper/90 backdrop-blur">
      <div className="mx-auto flex max-w-5xl items-center gap-1 overflow-x-auto px-4 py-2.5">
        <Link href="/" className="mr-3 shrink-0 font-bold tracking-wide text-brand-600">自習練功房</Link>
        {LINKS.map(l => {
          const active = l.href === '/' ? path === '/' : path.startsWith(l.href)
          return (
            <Link key={l.href} href={l.href}
              className={`shrink-0 rounded-lg px-3 py-1.5 text-sm ${active ? 'bg-brand-500 text-white' : 'text-ink-soft hover:bg-black/5'}`}>
              {l.label}
            </Link>
          )
        })}
      </div>
    </header>
  )
}
