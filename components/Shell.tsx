'use client'

// 外框：導覽＋內容區。作答中隱藏導覽（減少分心，右上角有「暫停」）；後台有自己的外殼
// 平板／桌機有左側直欄，內容區左邊留出直欄寬度

import { usePathname } from 'next/navigation'
import Nav from './Nav'

export default function Shell({ children }: { children: React.ReactNode }) {
  const path = usePathname()
  const bare = path.startsWith('/practice/session') || path.startsWith('/admin')
  return (
    <>
      {!bare && <Nav />}
      <div className={bare ? '' : 'md:pl-[92px]'}>
        <main className={`mx-auto max-w-6xl px-4 pt-4 sm:pt-6 ${bare ? 'pb-10' : 'pb-28 md:pb-12'}`}>{children}</main>
      </div>
    </>
  )
}
