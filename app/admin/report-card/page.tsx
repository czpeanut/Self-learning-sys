'use client'

// 學生學習程度成績單（列印／存 PDF）：程度檢測成績、區間內練習、各章掌握度、到館
import { Suspense, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { adminApi, errMsg } from '@/components/admin/api'
import type { GroupRow, Level } from '@/lib/placement'

type Card = {
  student: { name: string; username: string; grade: string | null; school: string | null }
  range: { from: string; to: string }
  tests: { title: string; date: string; score: number; level: Level; correct: number; total: number; percentile: number | null; takers: number; byUnit: (GroupRow & { level: Level })[]; strengths: string[]; weaknesses: string[] }[]
  practice: { answered: number; correct: number; accuracy: number | null; days: number; minutes: number; chapters: { subject: string; chapter: string; score: number; kps: number; weak: string[] }[] }
  attendance: { days: number; stayMinutes: number; focusMinutes: number }
}

export default function ReportCardPage() {
  return <Suspense><ReportCard /></Suspense>
}

const hours = (m: number) => (m >= 60 ? `${Math.floor(m / 60)} 小時 ${m % 60} 分` : `${m} 分鐘`)
const lvl = (score: number) => (score >= 85 ? '精熟' : score >= 70 ? '良好' : score >= 55 ? '基礎' : '待加強')

function ReportCard() {
  const p = useSearchParams()
  const student = p.get('student') ?? ''
  const [from, setFrom] = useState(p.get('from') ?? '')
  const [to, setTo] = useState(p.get('to') ?? '')
  const [c, setC] = useState<Card | null>(null)
  const [err, setErr] = useState('')
  useEffect(() => {
    const q = new URLSearchParams({ student, ...(from && { from }), ...(to && { to }) })
    adminApi<Card>(`/api/admin/report-card?${q}`).then(d => { setC(d); if (!from) setFrom(d.range.from); if (!to) setTo(d.range.to) }).catch(e => setErr(errMsg(e)))
  }, [student, from, to])
  if (err) return <div className="leaf-sm bg-red-50 px-4 py-2 text-sm text-red-700">{err}</div>
  if (!c) return null
  const latest = c.tests[0]

  return (
    <div className="mx-auto max-w-3xl space-y-5 bg-white p-6 print:p-0">
      <div className="no-print flex flex-wrap items-center gap-2 text-sm">
        區間 <input type="date" value={from} onChange={e => setFrom(e.target.value)} className="leaf-sm border border-black/10 px-2 py-0.5" />
        ～ <input type="date" value={to} onChange={e => setTo(e.target.value)} className="leaf-sm border border-black/10 px-2 py-0.5" />
        <button className="btn-primary ml-auto py-1" onClick={() => window.print()}>列印 / 存 PDF</button>
      </div>

      <header className="border-b-2 border-ink pb-3 text-center">
        <div className="text-sm text-ink-muted">自習練功房</div>
        <h1 className="text-2xl font-bold">學習程度成績單</h1>
        <div className="mt-1 text-sm">{c.student.name}（{c.student.username}）{c.student.grade && ` · ${c.student.grade}`}{c.student.school && ` · ${c.student.school}`}</div>
        <div className="text-xs text-ink-muted">統計區間 {c.range.from} ～ {c.range.to}</div>
      </header>

      <section className="grid grid-cols-2 gap-3 text-center sm:grid-cols-4">
        <Box label="最近檢測" value={latest ? `${latest.score} 分` : '—'} sub={latest ? `${latest.level.code} ${latest.level.label}` : '尚未檢測'} />
        <Box label="練習題數" value={c.practice.answered} sub={`${c.practice.days} 天有練習`} />
        <Box label="練習正確率" value={c.practice.accuracy == null ? '—' : `${Math.round(c.practice.accuracy * 100)}%`} sub={`作答 ${hours(c.practice.minutes)}`} />
        <Box label="到館" value={`${c.attendance.days} 天`} sub={`在館 ${hours(c.attendance.stayMinutes)}`} />
      </section>

      <section>
        <h2 className="border-l-4 border-brand-500 pl-2 font-semibold">程度檢測</h2>
        {c.tests.length === 0 ? <p className="mt-2 text-sm text-ink-muted">這段期間沒有完成的程度檢測</p> : c.tests.map((t, i) => (
          <div key={i} className="mt-3 leaf-sm border border-black/10 p-3 text-sm">
            <div className="flex flex-wrap justify-between gap-2">
              <b>{t.title}</b>
              <span>{t.date} · <b className="text-base">{t.score} 分</b>（{t.level.code} {t.level.label}）· 答對 {t.correct}/{t.total}{t.percentile != null && ` · 贏過同卷 ${t.percentile}%（${t.takers} 人）`}</span>
            </div>
            <p className="mt-1 text-xs text-ink-soft">{t.level.desc}</p>
            <table className="mt-2 w-full">
              <thead className="text-left text-xs text-ink-muted"><tr><th className="font-normal">單元</th><th className="font-normal">答對</th><th className="font-normal">答對率</th><th className="font-normal">程度</th></tr></thead>
              <tbody>{t.byUnit.map(u => <tr key={u.key} className="border-t border-black/5"><td className="py-1">{u.name}</td><td>{u.correct}/{u.total}</td><td>{Math.round(u.pct * 100)}%</td><td>{u.level.label}</td></tr>)}</tbody>
            </table>
            {t.strengths.length > 0 && <div className="mt-1 text-xs">✓ 穩固：{t.strengths.join('、')}</div>}
            {t.weaknesses.length > 0 && <div className="text-xs">▲ 需要加強：{t.weaknesses.slice(0, 6).join('、')}{t.weaknesses.length > 6 && ` 等 ${t.weaknesses.length} 個題型`}</div>}
          </div>
        ))}
      </section>

      <section>
        <h2 className="border-l-4 border-brand-500 pl-2 font-semibold">各章掌握度（自習練習累積）</h2>
        {c.practice.chapters.length === 0 ? <p className="mt-2 text-sm text-ink-muted">還沒有練習紀錄</p> : (
          <table className="mt-2 w-full text-sm">
            <thead className="text-left text-xs text-ink-muted"><tr><th className="font-normal">科目・章節</th><th className="font-normal">掌握度</th><th className="font-normal">程度</th><th className="font-normal">待加強的知識點</th></tr></thead>
            <tbody>{c.practice.chapters.map(ch => (
              <tr key={ch.subject + ch.chapter} className="border-t border-black/5"><td className="py-1">{ch.subject}・{ch.chapter}</td><td className="tabular-nums">{ch.score}</td><td>{lvl(ch.score)}</td><td className="text-xs">{ch.weak.join('、')}</td></tr>
            ))}</tbody>
          </table>
        )}
      </section>

      <footer className="border-t border-black/10 pt-2 text-xs text-ink-muted">
        程度等級：A 精熟（85 分以上）、B 良好（70–84）、C 基礎（55–69）、D 待加強（55 以下）。檢測依題目難度加權計分（基礎 1、標準 1.5、進階 2）；
        掌握度為系統依練習結果估計的 0–100 分。
      </footer>
    </div>
  )
}

function Box({ label, value, sub }: { label: string; value: React.ReactNode; sub: string }) {
  return <div className="leaf-sm border border-black/10 p-3"><div className="text-xs text-ink-muted">{label}</div><div className="text-xl font-bold">{value}</div><div className="text-xs text-ink-soft">{sub}</div></div>
}
