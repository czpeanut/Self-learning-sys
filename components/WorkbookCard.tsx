'use client'

// 首頁：最新一份專屬教材的狀態（雲端模式）；同時把閱卷結果併進本機紀錄
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Tile } from './brand'
import { CLOUD } from '@/lib/auth-shared'
import { STATUS_LABEL } from '@/lib/workbook'
import { type MyWorkbook, syncWorkbooks } from '@/lib/workbook-client'

export default function WorkbookCard() {
  const [w, setW] = useState<MyWorkbook | null>(null)
  useEffect(() => { if (CLOUD) syncWorkbooks().then(l => setW(l[0] ?? null)).catch(() => {}) }, [])
  if (!w) return null
  const s = w.summary
  return (
    <Link href="/workbook" className="card flex items-center gap-3 p-2.5 pr-3 transition hover:shadow-lift">
      <Tile color="slate" icon="doc" size={42} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-bold">專屬教材 · 第 {w.round} 輪</span>
        <span className="block truncate text-xs text-ink-muted">{STATUS_LABEL[w.status]} · {s.graded ? `答對 ${s.correct}/${s.graded}` : `${s.total} 題`}{w.diagnosis.length > 0 && ` · 前置補強 ${w.diagnosis.length} 個`}</span>
      </span>
      <span className="text-xs font-bold text-brand-600">查看 →</span>
    </Link>
  )
}
