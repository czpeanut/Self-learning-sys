'use client'

// 導覽（參照 student-app v2 的雙平台版面）：
//   桌機＝指令列（品牌＋整列等高分頁，作用中分頁上緣色條；次要頁面收進「更多」）
//   手機＝頂部身分列＋底部五格導航（第五格「更多」打開全部頁面）

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import InstallApp from './InstallApp'
import UserChip from './UserChip'
import { CLOUD } from '@/lib/auth-shared'

type L = { href: string; label: string; short?: string }
const PRIMARY: L[] = [
  { href: '/', label: '首頁', short: '首頁' },
  { href: '/study', label: 'K書模式' },
  { href: '/practice/new', label: '開始自習', short: '自習' },
  { href: '/exam', label: '段考衝刺', short: '段考' },
  { href: '/wrong-book', label: '錯題本', short: '錯題' },
  { href: '/drill', label: '弱項特訓' },
  { href: '/today', label: '今日成果' },
]
const MORE: L[] = [
  ...(CLOUD ? [{ href: '/tests', label: '程度檢測' }] : []),
  { href: '/progress', label: '學習歷程' },
  { href: '/habits', label: '學習習慣' },
  { href: '/parent', label: '家長日報' },
]
const BOTTOM = PRIMARY.filter(l => l.short)

/** 方格標誌：2×2 格，左上實心 */
export function GridMark({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 14 14" aria-hidden className="shrink-0">
      <rect x="0" y="0" width="6" height="6" fill="var(--accent)" />
      <rect x="8.5" y="0.5" width="5" height="5" fill="none" stroke="var(--accent)" />
      <rect x="0.5" y="8.5" width="5" height="5" fill="none" stroke="var(--accent)" />
      <rect x="8.5" y="8.5" width="5" height="5" fill="none" stroke="var(--accent)" />
    </svg>
  )
}

export default function Nav() {
  const path = usePathname()
  const [open, setOpen] = useState(false)
  useEffect(() => { setOpen(false) }, [path])
  // 作答中隱藏導覽，減少分心（右上角有「暫停」可離開）；後台有自己的外殼
  if (path.startsWith('/practice/session') || path.startsWith('/admin')) return null
  const active = (href: string) => (href === '/' ? path === '/' : path.startsWith(href))
  const moreActive = MORE.some(l => active(l.href))

  return (
    <>
      {/* ── 桌機：指令列 ── */}
      <header className="no-print sticky top-0 z-30 hidden h-14 items-stretch border-b border-line bg-paper/95 backdrop-blur lg:flex">
        <Link href="/" className="flex shrink-0 items-center gap-2.5 border-r border-line px-5 font-head text-[19px] font-semibold">
          <GridMark />自習練功房
        </Link>
        {PRIMARY.map(l => (
          <Link key={l.href} href={l.href}
            className={`flex items-center border-r border-line px-4 text-[14px] transition-colors ${active(l.href) ? 'bg-white text-ink shadow-[inset_0_3px_0_var(--accent)]' : 'text-ink-soft hover:bg-black/[.03] hover:text-ink'}`}>
            {l.label}
          </Link>
        ))}
        <div className="relative flex">
          <button onClick={() => setOpen(!open)} aria-expanded={open}
            className={`flex items-center gap-1 border-r border-line px-4 text-[14px] ${moreActive ? 'bg-white text-ink shadow-[inset_0_3px_0_var(--accent)]' : 'text-ink-soft hover:bg-black/[.03]'}`}>
            更多 <span className="mono">{open ? '▴' : '▾'}</span>
          </button>
          {open && (
            <div className="absolute left-0 top-full z-40 w-44 border border-line bg-white py-1 shadow-sm">
              {MORE.map(l => (
                <Link key={l.href} href={l.href} className={`block px-4 py-2 text-sm hover:bg-black/[.04] ${active(l.href) ? 'font-medium text-brand-700' : ''}`}>{l.label}</Link>
              ))}
            </div>
          )}
        </div>
        <div className="ml-auto flex items-center gap-1 px-4">
          <InstallApp />
          <UserChip />
        </div>
      </header>

      {/* ── 手機：身分列 ── */}
      <header className="no-print sticky top-0 z-30 flex items-center gap-2.5 border-b border-line bg-paper/95 px-4 py-2.5 backdrop-blur lg:hidden">
        <Link href="/" className="flex items-center gap-2 font-head text-[17px] font-semibold"><GridMark />自習練功房</Link>
        <div className="ml-auto flex items-center gap-1">
          <InstallApp />
          <UserChip />
        </div>
      </header>

      {/* ── 手機：底部導航 ── */}
      <nav className="no-print fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t border-line bg-paper/95 text-center text-[11px] backdrop-blur lg:hidden"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
        {BOTTOM.map(l => (
          <Link key={l.href} href={l.href} className={`flex flex-col gap-1.5 py-2.5 ${active(l.href) ? 'text-brand-700' : 'text-ink-muted'}`}>
            <span className={`mx-auto h-[3px] w-5 ${active(l.href) ? 'bg-brand-500' : 'bg-transparent'}`} />{l.short}
          </Link>
        ))}
        <button onClick={() => setOpen(!open)} className={`flex flex-col gap-1.5 py-2.5 ${open || moreActive || PRIMARY.some(l => !l.short && active(l.href)) ? 'text-brand-700' : 'text-ink-muted'}`}>
          <span className={`mx-auto h-[3px] w-5 ${open ? 'bg-brand-500' : 'bg-transparent'}`} />更多
        </button>
      </nav>
      {open && (
        <div className="no-print fixed inset-x-0 bottom-0 z-30 border-t border-line bg-white pb-16 lg:hidden" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 64px)' }}>
          <div className="kicker px-4 pt-3">ALL PAGES</div>
          <div className="grid grid-cols-3 gap-px bg-line p-px">
            {[...PRIMARY.filter(l => !l.short), ...MORE].map(l => (
              <Link key={l.href} href={l.href} className={`bg-white px-3 py-3.5 text-center text-sm ${active(l.href) ? 'font-medium text-brand-700' : ''}`}>{l.label}</Link>
            ))}
          </div>
        </div>
      )}
    </>
  )
}
