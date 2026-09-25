'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Empty, MasteryBadge, ProgressBar, Tile, fmtDate, fmtPct } from '@/components/ui'
import { createReviewSession } from '@/lib/session-client'
import { dueReviews, getMasteryMap, getProfile, listSessions, streakDays, todayLog } from '@/lib/storage'
import type { KPMastery, Session } from '@/lib/types'
import { kpKey } from '@/lib/types'
import { useAIStatus } from '@/lib/use-ai-status'

type HomeData = {
  name: string; goal: number; streak: number
  today: ReturnType<typeof todayLog>
  due: number
  active: Session | null
  recent: Session[]
  weak: KPMastery[]
}

export default function Home() {
  const router = useRouter()
  const ai = useAIStatus()
  const [d, setD] = useState<HomeData | null>(null)

  useEffect(() => {
    const sessions = listSessions()
    const p = getProfile()
    setD({
      name: p.name, goal: p.dailyGoal, streak: streakDays(), today: todayLog(), due: dueReviews().length,
      active: sessions.find(s => s.status === 'active') ?? null,
      recent: sessions.filter(s => s.status === 'finished').slice(0, 5),
      weak: Object.values(getMasteryMap()).filter(m => m.attempts > 0 && m.score < 60).sort((a, b) => a.score - b.score).slice(0, 6),
    })
  }, [])

  if (!d) return null

  const startReview = () => {
    const s = createReviewSession()
    if (s) router.push(`/practice/session?id=${s.id}`)
  }
  const weakHref = `/practice/new?${d.weak.filter(w => w.subject === d.weak[0]?.subject).map(w => `kp=${encodeURIComponent(kpKey(w))}`).join('&')}`

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold">{d.name ? `${d.name}，` : ''}今天想練什麼？</h1>
        <p className="mt-1 text-sm text-ink-soft">選範圍 → 系統出題 → 依錯題自動調整下一波 → 看學習報告</p>
      </div>

      {ai && !ai.ai && (
        <div className="rounded-xl bg-amber-50 px-4 py-2 text-sm text-amber-900">示範模式：未設定 GEMINI_API_KEY，只有部分數學知識點能出真題（見開始自習頁的「免AI」標示）。</div>
      )}

      {d.active && (
        <div className="card flex flex-wrap items-center justify-between gap-3 border-brand-500/30 bg-brand-50 p-4">
          <div>
            <div className="font-semibold">有一場練習還沒做完</div>
            <div className="text-sm text-ink-soft">{d.active.mode === 'review' ? '錯題複習' : d.active.subject} · {d.active.scope.length} 個知識點 · {fmtDate(d.active.createdAt)}</div>
          </div>
          <Link className="btn-primary" href={`/practice/session?id=${d.active.id}`}>繼續練習</Link>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Tile label="連續練習" value={`${d.streak} 天`} sub={d.today.answered ? '今天已練習 ✓' : '今天還沒練習'} />
        <Tile label="今日題數" value={`${d.today.answered} / ${d.goal}`} sub={<ProgressBar value={d.today.answered} max={d.goal} className="mt-1" />} />
        <Tile label="今日正確率" value={d.today.answered ? fmtPct(d.today.correct / d.today.answered) : '—'} sub={`${d.today.minutes} 分鐘`} />
        <Tile label="待複習錯題" value={d.due} sub="依遺忘曲線排程" />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="card flex flex-col p-5">
          <h2 className="font-semibold">自選範圍練習</h2>
          <p className="mt-1 flex-1 text-sm text-ink-soft">從國中 9 科的大單元、知識點中勾選範圍，系統會先檢測、再針對錯的地方出變化題。</p>
          <Link href="/practice/new" className="btn-primary mt-4">開始自習</Link>
        </div>
        <div className="card flex flex-col p-5">
          <h2 className="font-semibold">今日錯題複習</h2>
          <p className="mt-1 flex-1 text-sm text-ink-soft">
            {d.due > 0 ? `有 ${d.due} 題錯題到了複習時間，重做一次；答對會延後下次複習，連續答對 5 次就算克服。` : '目前沒有到期的錯題。練習時答錯的題會自動排進複習。'}
          </p>
          <button className="btn-primary mt-4" disabled={d.due === 0} onClick={startReview}>開始複習{d.due > 0 && `（${Math.min(d.due, 15)} 題）`}</button>
        </div>
      </div>

      {d.weak.length > 0 && (
        <section className="card p-5">
          <div className="flex items-baseline justify-between">
            <h2 className="font-semibold">目前的弱點</h2>
            <Link href={weakHref} className="text-sm text-brand-600 hover:underline">針對{d.weak[0].subject}弱點練習 →</Link>
          </div>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {d.weak.map(w => (
              <div key={kpKey(w)} className="flex items-center justify-between rounded-xl bg-black/[.03] px-3 py-2 text-sm">
                <div><span className="font-medium">{w.kp}</span> <span className="text-xs text-ink-muted">{w.subject}·{w.chapter}</span></div>
                <MasteryBadge score={w.score} />
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="card p-5">
        <div className="flex items-baseline justify-between">
          <h2 className="font-semibold">最近的學習報告</h2>
          <Link href="/progress" className="text-sm text-brand-600 hover:underline">全部 →</Link>
        </div>
        <div className="mt-3">
          {d.recent.length === 0 ? <Empty>還沒有完成的練習</Empty> : (
            <div className="divide-y divide-black/5">
              {d.recent.map(s => {
                const answers = s.rounds.flatMap(r => r.answers)
                const c = answers.filter(a => a.correct).length
                return (
                  <Link key={s.id} href={`/report?id=${s.id}`} className="flex items-center justify-between py-2.5 text-sm hover:bg-black/[.02]">
                    <div>
                      <span className="font-medium">{s.mode === 'review' ? '錯題複習' : s.subject}</span>
                      <span className="ml-2 text-xs text-ink-muted">{fmtDate(s.createdAt)} · {s.rounds.length} 波 · {s.scope.length} 個知識點</span>
                    </div>
                    <span className="tabular-nums text-ink-soft">{c}/{answers.length}（{fmtPct(c / Math.max(1, answers.length))}）</span>
                  </Link>
                )
              })}
            </div>
          )}
        </div>
      </section>
    </div>
  )
}
