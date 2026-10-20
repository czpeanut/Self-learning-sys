'use client'

import { DRILL_STREAK, drillProgress } from '@/lib/drill'
import type { Session } from '@/lib/types'

/** 弱項特訓：每個題型的達標進度（連續答對 DRILL_STREAK 題） */
export default function DrillBoard({ session }: { session: Session }) {
  const rows = drillProgress(session)
  const passed = rows.filter(r => r.status === 'passed').length
  return (
    <div className="card p-5">
      <div className="flex items-baseline justify-between">
        <h3 className="font-semibold">特訓進度</h3>
        <span className="text-sm text-ink-soft">達標 {passed} / {rows.length}（連續答對 {DRILL_STREAK} 題）</span>
      </div>
      <div className="mt-2 divide-y divide-black/5">
        {rows.map(r => (
          <div key={r.key} className="flex items-center justify-between gap-3 py-2 text-sm">
            <div className="min-w-0">
              <div className="truncate font-medium">{r.kp}</div>
              <div className="text-xs text-ink-muted">{r.chapter} · 這次 {r.correct}/{r.attempts}</div>
              {r.status === 'stuck' && <div className="mt-0.5 text-xs text-red-700">常錯：先問 AI，明天再練</div>}
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <span className="tracking-widest text-brand-600" aria-label={`連續答對 ${r.streak} 題`}>
                {Array.from({ length: DRILL_STREAK }, (_, i) => (i < r.streak ? '●' : '○')).join('')}
              </span>
              <span className={`chip ${r.status === 'passed' ? 'bg-green-50 text-green-800' : r.status === 'stuck' ? 'bg-red-50 text-red-700' : 'bg-black/5 text-ink-soft'}`}>
                {{ passed: '✓ 達標', stuck: '先看講解', working: '練習中', new: '未開始' }[r.status]}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
