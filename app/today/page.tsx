'use client'

// 今日成果報告：一天所有練習的彙整與明天的下一步（lib/day-result.ts）

import { Suspense, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { Empty, ProgressBar, Tile, fmtPct } from '@/components/ui'
import { buildDayResult } from '@/lib/day-result'
import { getActivity, getMasteryMap, getProfile, getWrongBook, listSessions, streakDays, today } from '@/lib/storage'
import { useExamReadinessChange } from '@/lib/use-exam-readiness'
import { kpKey } from '@/lib/types'

export default function TodayPage() {
  return <Suspense><TodayView /></Suspense>
}

const WEEKDAY = '日一二三四五六'
const label = (d: string) => { const x = new Date(d + 'T00:00:00'); return `${x.getMonth() + 1}/${x.getDate()}（${WEEKDAY[x.getDay()]}）` }

function TodayView() {
  const router = useRouter()
  const params = useSearchParams()
  const date = params.get('date') ?? ''
  const [ready, setReady] = useState(false)
  const [dates, setDates] = useState<string[]>([])
  useEffect(() => {
    setDates(Array.from(new Set([today(), ...getActivity().filter(a => a.answered > 0).map(a => a.date)])).sort().reverse())
    setReady(true)
  }, [])
  const day = date || (ready ? today() : '')
  const exam = useExamReadinessChange(day)

  const data = useMemo(() => {
    if (!day) return null
    const p = getProfile()
    return {
      name: p.name,
      r: buildDayResult({
        date: day, sessions: listSessions(), mastery: getMasteryMap(), wrongBook: getWrongBook(), activity: getActivity(),
        dailyGoal: p.dailyGoal, streak: streakDays(), exam: exam ?? undefined,
      }),
    }
  }, [day, exam])

  if (!data) return null
  const { r, name } = data
  const t = r.totals
  const arrow = (now: number, before: number | undefined, fmt: (x: number) => string) => {
    if (before == null) return null
    const d = now - before
    if (Math.abs(d) < 1e-9) return <span className="text-ink-muted">和之前一樣</span>
    return <span className={d > 0 ? 'text-green-700' : 'text-ink-muted'}>{d > 0 ? '▲' : '▼'} {fmt(Math.abs(d))}</span>
  }

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-sm text-ink-muted">今日成果報告</div>
          <h1 className="text-2xl font-bold">{name ? `${name}的` : ''}{label(r.date)}學習成果</h1>
        </div>
        <div className="no-print flex gap-2">
          <select value={r.date} onChange={e => router.replace(`/today?date=${e.target.value}`)} className="rounded-lg border border-black/10 bg-white px-2 py-1 text-sm">
            {dates.map(d => <option key={d} value={d}>{label(d)}{d === today() ? ' 今天' : ''}</option>)}
          </select>
          <button className="btn-outline py-1" onClick={() => window.print()}>列印</button>
        </div>
      </div>

      {r.empty ? (
        <Empty>這天還沒有練習紀錄。<Link href="/practice/new" className="ml-1 text-brand-600 underline">去練習</Link></Empty>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Tile label="練習題數" value={`${t.answered} / ${r.goal.target}`} sub={<ProgressBar value={t.answered} max={r.goal.target} className="mt-1" />} />
            <Tile label="正確率" value={fmtPct(t.accuracy)} sub={<>{t.correct} 題答對 · {arrow(t.accuracy, r.compare.yesterday?.accuracy, x => `${Math.round(x * 100)} 點（比昨天）`) ?? '昨天沒練習'}</>} />
            <Tile label="作答時間" value={t.minutes ? `${t.minutes} 分鐘` : '不到 1 分鐘'} sub={`${t.sessions} 次練習 · 平均每題 ${Math.round((t.minutes * 60) / Math.max(1, t.answered))} 秒`} />
            <Tile label="連續練習" value={`${r.streak} 天`} sub={r.goal.met ? '✓ 今日目標達成' : `還差 ${r.goal.target - t.answered} 題達標`} />
          </div>

          {r.highlights.length > 0 && (
            <section className="card border border-green-600/20 bg-green-50/50 p-5">
              <h2 className="font-semibold">🌟 今天的成果</h2>
              <ul className="mt-2 space-y-1 text-sm">{r.highlights.map((h, i) => <li key={i}>✓ {h}</li>)}</ul>
            </section>
          )}

          <section className="card p-5">
            <h2 className="font-semibold">和自己比</h2>
            <div className="mt-2 overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs text-ink-muted"><tr><th className="py-1 font-normal" /><th className="font-normal">題數</th><th className="font-normal">正確率</th></tr></thead>
                <tbody className="tabular-nums">
                  <tr className="font-medium"><td className="py-1">這天</td><td>{t.answered}</td><td>{fmtPct(t.accuracy)}</td></tr>
                  <tr><td className="py-1 text-ink-soft">前一天</td><td>{r.compare.yesterday?.answered ?? '—'}</td><td>{r.compare.yesterday ? fmtPct(r.compare.yesterday.accuracy) : '—'}</td></tr>
                  <tr><td className="py-1 text-ink-soft">前 7 天平均（有練習的日子）</td><td>{r.compare.avg7?.answered ?? '—'}</td><td>{r.compare.avg7 ? fmtPct(r.compare.avg7.accuracy) : '—'}</td></tr>
                </tbody>
              </table>
            </div>
          </section>

          <section className="card p-5">
            <h2 className="font-semibold">各題型的變化</h2>
            <p className="text-xs text-ink-muted">掌握度：這天第一次練之前 → 練完之後</p>
            <div className="mt-2 divide-y divide-black/5">
              {r.skills.map(s => (
                <div key={kpKey(s)} className="flex items-center justify-between gap-3 py-2 text-sm">
                  <div className="min-w-0">
                    <div className="truncate font-medium">{s.kp}</div>
                    <div className="text-xs text-ink-muted">{s.subject} · {s.chapter}</div>
                  </div>
                  <div className="flex shrink-0 items-center gap-3 tabular-nums">
                    <span className="text-ink-soft">{s.correct}/{s.answered}</span>
                    <span>{s.before} → <b>{s.after}</b></span>
                    <span className={`w-10 text-right ${s.delta > 0 ? 'text-green-700' : s.delta < 0 ? 'text-red-600' : 'text-ink-muted'}`}>{s.delta > 0 ? '+' : ''}{s.delta}</span>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <div className="grid gap-4 sm:grid-cols-2">
            <section className="card p-5 text-sm">
              <h2 className="font-semibold">📕 錯題本</h2>
              <ul className="mt-2 space-y-1">
                <li>新收進錯題：<b>{r.wrong.added}</b> 題</li>
                <li>重做錯題：{r.wrong.reviewed} 題，答對 {r.wrong.reviewCorrect} 題</li>
                <li>克服（連續答對到最後一關）：<b>{r.wrong.conquered}</b> 題</li>
                <li className="text-ink-soft">目前還沒克服 {r.wrong.openTotal} 題，明天前到期 {r.wrong.dueTomorrow} 題</li>
              </ul>
            </section>
            <section className="card p-5 text-sm">
              <h2 className="font-semibold">💪 弱項特訓</h2>
              {r.drill.passed.length + r.drill.stuck.length === 0 ? (
                <p className="mt-2 text-ink-soft">這天沒有特訓。錯題和弱項可以用特訓重複練到連續答對。</p>
              ) : (
                <ul className="mt-2 space-y-1">
                  {r.drill.passed.map(p => <li key={kpKey(p)}>✓ {p.kp} <span className="text-xs text-green-700">達標</span></li>)}
                  {r.drill.stuck.map(p => <li key={kpKey(p)}>▲ {p.kp} <span className="text-xs text-red-700">先看講解</span></li>)}
                </ul>
              )}
              {r.exam && (
                <div className="mt-3 border-t border-black/5 pt-2">🎯 {r.exam.label}準備度 {fmtPct(r.exam.before)} → <b>{fmtPct(r.exam.after)}</b></div>
              )}
            </section>
          </div>

          <section className="card p-5">
            <h2 className="font-semibold">這天的練習</h2>
            <div className="mt-2 divide-y divide-black/5">
              {r.sessions.map(s => (
                <Link key={s.id} href={`/report?id=${s.id}`} className="flex items-center justify-between py-2 text-sm hover:bg-black/[.02]">
                  <span className="font-medium">{s.label}</span>
                  <span className="tabular-nums text-ink-soft">{s.correct}/{s.answered}（{fmtPct(s.correct / Math.max(1, s.answered))}）→</span>
                </Link>
              ))}
            </div>
          </section>
        </>
      )}

      <section className="card border border-brand-500/30 bg-brand-50/60 p-5">
        <h2 className="font-semibold">明天的下一步</h2>
        <ol className="mt-2 space-y-2 text-sm">
          {r.tomorrow.map((x, i) => (
            <li key={i} className="flex gap-2">
              <span className="font-bold text-brand-600">{i + 1}.</span>
              <span>{x.text}{x.href && <Link href={x.href} className="no-print ml-2 text-brand-600 underline">去做</Link>}</span>
            </li>
          ))}
        </ol>
      </section>

      <div className="no-print flex flex-wrap gap-2">
        <Link href="/" className="btn-outline">回首頁</Link>
        <Link href="/drill" className="btn-outline">弱項特訓</Link>
        <Link href={`/parent?date=${r.date}`} className="btn-outline">家長日報</Link>
      </div>
    </div>
  )
}
