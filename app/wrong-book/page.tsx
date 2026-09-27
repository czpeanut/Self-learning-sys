'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import AskAI from '@/components/AskAI'
import MathText from '@/components/MathText'
import SolutionView from '@/components/SolutionView'
import { Empty, fmtDate } from '@/components/ui'
import { createReviewSession } from '@/lib/session-client'
import { REVIEW_INTERVALS, getWrongBook, removeWrong, setWrongResolved } from '@/lib/storage'
import type { WrongItem } from '@/lib/types'
import { ERROR_TYPE_LABEL } from '@/lib/types'

type Filter = 'due' | 'open' | 'resolved' | 'all'

export default function WrongBookPage() {
  const router = useRouter()
  const [items, setItems] = useState<WrongItem[]>([])
  const [filter, setFilter] = useState<Filter>('open')
  const [subject, setSubject] = useState('全部')
  const [now, setNow] = useState(0)

  const reload = () => { setItems(getWrongBook()); setNow(Date.now()) }
  useEffect(reload, [])

  const subjects = useMemo(() => ['全部', ...Array.from(new Set(items.map(i => i.question.subject)))], [items])
  const shown = items
    .filter(i => subject === '全部' || i.question.subject === subject)
    .filter(i => filter === 'all' || (filter === 'resolved' ? i.resolved : !i.resolved && (filter === 'open' || i.nextReviewAt <= now)))
    .sort((a, b) => a.nextReviewAt - b.nextReviewAt)
  const due = items.filter(i => !i.resolved && i.nextReviewAt <= now).length

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">錯題本</h1>
          <p className="text-sm text-ink-soft">練習時答錯的題目會自動收進來，依 {REVIEW_INTERVALS.join('、')} 天的間隔安排複習。</p>
        </div>
        <button className="btn-primary" disabled={due === 0} onClick={() => {
          const s = createReviewSession()
          if (s) router.push(`/practice/session?id=${s.id}`)
        }}>複習到期錯題（{due}）</button>
      </div>

      <div className="flex flex-wrap gap-2">
        {([['open', '未克服'], ['due', '今天到期'], ['resolved', '已克服'], ['all', '全部']] as [Filter, string][]).map(([f, l]) => (
          <button key={f} onClick={() => setFilter(f)} className={`rounded-lg px-3 py-1 text-sm ${filter === f ? 'bg-brand-500 text-white' : 'bg-white ring-1 ring-black/5'}`}>{l}</button>
        ))}
        <select value={subject} onChange={e => setSubject(e.target.value)} className="rounded-lg border border-black/10 bg-white px-2 py-1 text-sm">
          {subjects.map(s => <option key={s}>{s}</option>)}
        </select>
      </div>

      {shown.length === 0 ? <Empty>這裡沒有錯題</Empty> : (
        <div className="space-y-3">
          {shown.map(w => {
            const q = w.question
            const isDue = !w.resolved && w.nextReviewAt <= now
            return (
              <div key={q.id} className="card p-4 text-sm">
                <div className="mb-2 flex flex-wrap items-center gap-1.5 text-xs">
                  <span className="chip bg-black/5 text-ink-soft">{q.subject} · {q.chapter}</span>
                  <span className="chip bg-brand-50 text-brand-700">{q.kp}</span>
                  <span className="chip bg-red-50 text-red-700">錯 {w.wrongCount} 次</span>
                  {w.errorType && <span className="chip bg-black/5 text-ink-soft">{ERROR_TYPE_LABEL[w.errorType]}</span>}
                  {w.resolved ? <span className="chip bg-green-50 text-green-800">✓ 已克服</span>
                    : isDue ? <span className="chip bg-amber-50 text-amber-800">今天複習</span>
                    : <span className="text-ink-muted">下次複習 {fmtDate(w.nextReviewAt)}</span>}
                  <span className="text-ink-muted">複習進度 {w.box}/{REVIEW_INTERVALS.length}</span>
                </div>
                <SolutionView>{q.stem}</SolutionView>
                <ol className="mt-2 grid gap-1 sm:grid-cols-2">
                  {q.options.map((o, i) => (
                    <li key={i} className={i === q.answerIndex ? 'text-green-700' : i === w.lastAnswer ? 'text-red-600 line-through' : 'text-ink-soft'}>
                      ({'ABCD'[i]}) <MathText>{o}</MathText>
                    </li>
                  ))}
                </ol>
                <details className="mt-2">
                  <summary className="cursor-pointer text-brand-600">看詳解</summary>
                  <div className="mt-1 leading-relaxed text-ink-soft"><SolutionView>{q.explanation}</SolutionView></div>
                  <div className="mt-2"><AskAI q={q} /></div>
                </details>
                <div className="mt-2 flex gap-3 text-xs">
                  <button className="text-ink-soft hover:underline" onClick={() => { setWrongResolved(q.id, !w.resolved); reload() }}>{w.resolved ? '標為未克服' : '標為已克服'}</button>
                  <button className="text-red-600 hover:underline" onClick={() => { if (confirm('確定從錯題本刪除這題？')) { removeWrong(q.id); reload() } }}>刪除</button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
