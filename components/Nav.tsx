'use client'

// 導覽（霓虹方塊版）：
//   平板／桌機（md 以上）＝左側直欄：標誌＋圖示分頁（作用中＝品牌漸層一角尖方塊），下方是安裝與帳號
//   手機＝頂部身分列＋浮起的底部導航（中間是菱形「開始自習」主鈕；「更多」打開全部頁面的彩色入口）
// 作答中、後台不顯示（由 Shell 決定）

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import InstallApp from './InstallApp'
import UserChip from './UserChip'
import { BrandMark, Icon, type IconName, Tile, type TileColor } from './brand'
import { CLOUD } from '@/lib/auth-shared'

type L = { href: string; label: string; short: string; icon: IconName; color: TileColor }
export const PAGES: L[] = [
  { href: '/', label: '首頁', short: '首頁', icon: 'home', color: 'blue' },
  { href: '/study', label: 'K書模式', short: 'K書', icon: 'timer', color: 'sky' },
  { href: '/practice/new', label: '開始自習', short: '自習', icon: 'book', color: 'blue' },
  { href: '/exam', label: '段考衝刺', short: '段考', icon: 'target', color: 'orange' },
  { href: '/wrong-book', label: '錯題本', short: '錯題', icon: 'wrong', color: 'pink' },
  { href: '/drill', label: '弱項特訓', short: '特訓', icon: 'bolt', color: 'violet' },
  { href: '/today', label: '今日成果', short: '成果', icon: 'chart', color: 'yellow' },
  ...(CLOUD ? [{ href: '/tests', label: '程度檢測', short: '檢測', icon: 'check', color: 'green' } as L] : []),
  { href: '/progress', label: '學習歷程', short: '歷程', icon: 'trend', color: 'lime' },
  { href: '/habits', label: '學習習慣', short: '習慣', icon: 'pulse', color: 'slate' },
  { href: '/parent', label: '家長日報', short: '家長', icon: 'family', color: 'green' },
]
const BOTTOM = ['/', '/wrong-book', '/exam']   // 手機底部的固定格（中間另有「開始自習」主鈕）

export default function Nav() {
  const path = usePathname()
  const [open, setOpen] = useState(false)
  useEffect(() => { setOpen(false) }, [path])
  const active = (href: string) => (href === '/' ? path === '/' : path.startsWith(href))
  const bottom = PAGES.filter(l => BOTTOM.includes(l.href))
  const moreActive = !bottom.some(l => active(l.href)) && !active('/practice/new')

  return (
    <>
      {/* ── 平板／桌機：左側直欄 ── */}
      <aside className="no-print fixed inset-y-0 left-0 z-30 hidden w-[92px] flex-col items-center border-r border-line bg-white/95 py-4 backdrop-blur md:flex">
        <Link href="/" aria-label="自習練功房首頁" className="mb-3"><BrandMark size={42} /></Link>
        <nav aria-label="主選單" className="flex w-full flex-1 flex-col items-center gap-1 overflow-y-auto px-2 pb-2">
          {PAGES.map(l => (
            <Link key={l.href} href={l.href} aria-current={active(l.href) ? 'page' : undefined}
              className={`flex w-full flex-col items-center gap-1 py-2 text-[11px] transition ${active(l.href)
                ? 'cut font-bold text-ink'
                : 'text-ink-muted hover:bg-ink/[.04] hover:text-ink'}`}
              style={{ background: active(l.href) ? 'var(--brand-grad)' : undefined }}>
              <Icon name={l.icon} size={21} />{l.short}
            </Link>
          ))}
        </nav>
        <div className="flex flex-col items-center gap-1 pt-2">
          <InstallApp variant="rail" />
          <UserChip compact />
        </div>
      </aside>

      {/* ── 手機：身分列 ── */}
      <header className="no-print sticky top-0 z-30 flex items-center gap-2.5 border-b border-line bg-white/90 px-4 py-2.5 backdrop-blur md:hidden">
        <Link href="/" className="flex items-center gap-2 font-head text-[17px] font-bold"><BrandMark size={28} />自習練功房</Link>
        <div className="ml-auto flex items-center gap-1">
          <InstallApp />
          <UserChip />
        </div>
      </header>

      {/* ── 手機：「更多」面板 ── */}
      {open && (
        <div className="no-print fixed inset-0 z-30 bg-ink/30 md:hidden" onClick={() => setOpen(false)}>
          <div className="absolute inset-x-3 bottom-[96px] border border-line bg-white p-4 shadow-lift" onClick={e => e.stopPropagation()}>
            <div className="mb-3 text-sm font-bold">全部功能</div>
            <div className="grid grid-cols-4 gap-x-2 gap-y-4">
              {PAGES.map(l => (
                <Link key={l.href} href={l.href} className="flex flex-col items-center gap-1.5 text-xs">
                  <Tile color={l.color} icon={l.icon} size={46} />
                  <span className={active(l.href) ? 'font-bold text-brand-700' : ''}>{l.label}</span>
                </Link>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── 手機：浮起的底部導航 ── */}
      <nav aria-label="主選單" className="no-print fixed inset-x-3 z-40 grid h-[66px] grid-cols-5 items-center border border-line bg-white/95 text-center text-[11px] shadow-lift backdrop-blur md:hidden"
        style={{ bottom: 'calc(env(safe-area-inset-bottom) + 10px)' }}>
        {bottom.slice(0, 2).map(l => <BottomLink key={l.href} l={l} on={active(l.href)} />)}
        <Link href="/practice/new" aria-label="開始自習"
          className="mx-auto -mt-8 flex h-14 w-14 rotate-45 items-center justify-center border-4 border-white text-ink shadow-[0_10px_22px_-6px_rgba(95,227,161,0.8)]"
          style={{ background: 'var(--brand-grad)' }}>
          <span className="-rotate-45"><Icon name="play" size={24} /></span>
        </Link>
        {bottom.slice(2).map(l => <BottomLink key={l.href} l={l} on={active(l.href)} />)}
        <button onClick={() => setOpen(!open)} aria-expanded={open}
          className={`flex flex-col items-center gap-1 ${open || moreActive ? 'font-bold text-ink' : 'text-ink-muted'}`}>
          <span className={open || moreActive ? 'text-brand-500' : ''}><Icon name="more" size={22} /></span>更多
        </button>
      </nav>
    </>
  )
}

function BottomLink({ l, on }: { l: L; on: boolean }) {
  return (
    <Link href={l.href} aria-current={on ? 'page' : undefined} className={`flex flex-col items-center gap-1 ${on ? 'font-bold text-ink' : 'text-ink-muted'}`}>
      <span className={on ? 'text-brand-500' : ''}><Icon name={l.icon} size={22} /></span>{l.short}
    </Link>
  )
}
