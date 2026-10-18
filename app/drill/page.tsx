'use client'

// 弱項特訓：錯題與弱項題型的重複練習，練到連續答對才停（lib/drill.ts）

import { Suspense, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { Empty, MasteryBadge } from '@/components/ui'
import { DRILL_MAX_ROUNDS, DRILL_MAX_TARGETS, DRILL_STREAK, drillTargets } from '@/lib/drill'
import { createDrillSession } from '@/lib/session-client'
import { getMasteryMap, getWrongBook } from '@/lib/storage'
import type { DrillTarget } from '@/lib/types'
import { kpKey } from '@/lib/types'

export default function DrillPage() {
  return <Suspense><DrillView /></Suspense>
}

function DrillView() {
  const router = useRouter()
  const params = useSearchParams()
  const [targets, setTargets] = useState<DrillTarget[] | null>(null)
  const [picked, setPicked] = useState<Set<string>>(new Set())

  useEffect(() => {
    const list = drillTargets({ wrongBook: getWrongBook(), mastery: getMasteryMap() })
    setTargets(list)
    const want = params.getAll('t')
    const pre = want.length ? list.filter(t => want.includes(kpKey(t))) : list.slice(0, 3)
    setPicked(new Set(pre.slice(0, DRILL_MAX_TARGETS).map(kpKey)))
  }, [params])

  if (!targets) return null
  const toggle = (k: string) => setPicked(prev => {
    const n = new Set(prev)
    if (n.has(k)) n.delete(k)
    else if (n.size < DRILL_MAX_TARGETS) n.add(k)
    return n
  })
  const start = () => {
    const chosen = targets.filter(t => picked.has(kpKey(t)))
    if (!chosen.length) return
    const s = createDrillSession(chosen)
    router.push(`/practice/session?id=${s.id}`)
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold">弱項特訓</h1>
        <p className="mt-1 text-sm text-ink-soft">
          針對錯題和還不熟的題型重複練習：每波先重做一題錯題本原題，再出同題型的新題，
          同一題型<strong>連續答對 {DRILL_STREAK} 題</strong>才算達標（最多 {DRILL_MAX_ROUNDS} 波）。
          一開始會先降一級難度，答對再升級。
        </p>
      </div>

      {targets.length === 0 ? (
        <Empty>目前沒有錯題或弱項題型。<Link href="/practice/new" className="ml-1 text-brand-600 underline">先去練習</Link></Empty>
      ) : (
        <>
          <section className="card p-5">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="font-semibold">選要特訓的題型（最多 {DRILL_MAX_TARGETS} 個）</h2>
              <span className="text-xs text-ink-muted">依錯題數、到期錯題、掌握度排序</span>
            </div>
            <div className="mt-3 divide-y divide-black/5">
              {targets.map(t => {
                const k = kpKey(t)
                const on = picked.has(k)
                return (
                  <button key={k} onClick={() => toggle(k)} className="flex w-full items-center gap-3 py-2.5 text-left text-sm hover:bg-black/[.02]">
                    <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border ${on ? 'border-brand-500 bg-brand-500 text-white' : 'border-black/20'}`}>{on ? '✓' : ''}</span>
                    <div className="min-w-0 flex-1">
                      <div className="font-medium">{t.kp}</div>
                      <div className="text-xs text-ink-muted">{t.subject} · {t.chapter}</div>
                      <div className="text-xs text-ink-soft">{t.reasons.join('、')}</div>
                    </div>
                    <MasteryBadge score={t.score} />
                  </button>
                )
              })}
            </div>
          </section>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-sm text-ink-soft">已選 {picked.size} 個題型，第一波約 {picked.size * DRILL_STREAK} 題</div>
            <button className="btn-primary" disabled={picked.size === 0} onClick={start}>開始特訓</button>
          </div>
        </>
      )}
    </div>
  )
}
