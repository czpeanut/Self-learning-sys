'use client'

import { Suspense, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { AnswerTrail, HBars, MasteryDumbbell, RoundBars } from '@/components/Charts'
import AskAI from '@/components/AskAI'
import MathText from '@/components/MathText'
import SolutionView from '@/components/SolutionView'
import { Empty, MasteryBadge, Tile, fmtDate, fmtPct, fmtSec } from '@/components/ui'
import { buildReport, reportSummaryForAI } from '@/lib/report'
import { getSession } from '@/lib/storage'
import type { ErrorType, Session } from '@/lib/types'
import { CONFIDENCE_LABEL, ERROR_TYPE_LABEL } from '@/lib/types'

export default function ReportPage() {
  return <Suspense><ReportView /></Suspense>
}

const END_TEXT: Record<string, string> = {
  'all-passed': '全部知識點過關', 'max-rounds': '完成預定波數', 'user-ended': '自行結束',
}

function ReportView() {
  const id = useSearchParams().get('id') ?? ''
  const [session, setSession] = useState<Session | null | undefined>(undefined)
  const [ai, setAi] = useState<{ comment: string; actions: string[] } | null>(null)
  const [aiLoading, setAiLoading] = useState(false)
  const [showAll, setShowAll] = useState(false)

  useEffect(() => { setSession(getSession(id)) }, [id])
  const report = useMemo(() => (session ? buildReport(session) : null), [session])

  // AI 學習教練評語（有設定 Gemini 才會回內容；沒有就只顯示規則式評語）
  useEffect(() => {
    if (!session || !report || report.totals.questions === 0 || report.hasDemo) return
    setAiLoading(true)
    fetch('/api/report', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ summary: reportSummaryForAI(session, report) }) })
      .then(r => r.json())
      .then(d => { if (d.comment) setAi({ comment: d.comment, actions: d.actions ?? [] }) })
      .catch(() => {})
      .finally(() => setAiLoading(false))
  }, [session, report])

  if (session === undefined) return null
  if (!session || !report) return <Empty>找不到這份報告。<Link href="/progress" className="text-brand-600 underline">看全部紀錄</Link></Empty>

  const t = report.totals
  const wrongList = session.rounds.flatMap(r => r.questions.map((q, i) => ({ q, a: r.answers[i], round: r.index }))).filter(x => x.a && !x.a.correct)
  const retryHref = `/practice/new?${report.nextScope.map(r => `kp=${encodeURIComponent(`${r.subject}|${r.chapter}|${r.kp}`)}`).join('&')}`

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-sm text-ink-muted">{fmtDate(session.createdAt)} · {session.mode === 'review' ? '錯題複習' : '自習練習'} · {END_TEXT[session.endReason ?? ''] ?? '進行中'}</div>
          <h1 className="text-2xl font-bold">{session.subject} 學習報告</h1>
          {session.goal && <div className="mt-1 text-sm text-ink-soft">本次目標：{session.goal}</div>}
        </div>
        <div className="no-print flex gap-2">
          <button className="btn-outline" onClick={() => window.print()}>列印 / 存 PDF</button>
          {report.nextScope.length > 0 && session.mode === 'practice' && <Link className="btn-primary" href={retryHref}>弱點再練</Link>}
        </div>
      </div>

      {report.hasDemo && (
        <div className="rounded-xl bg-amber-50 px-4 py-2 text-sm text-amber-900">本次包含「示範題」（未連接 AI），數據只供體驗流程參考。</div>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Tile label="正確率" value={fmtPct(t.accuracy)} sub={`${t.correct} / ${t.questions} 題`} />
        <Tile label="練習波數" value={t.rounds} sub={`上限 ${session.settings.maxRounds} 波`} />
        <Tile label="總時間" value={fmtSec(t.timeMs)} sub={`平均每題 ${Math.round(t.avgTimeMs / 1000)} 秒`} />
        <Tile label="過關知識點" value={`${report.kpRows.filter(r => r.level.tone === 'good').length} / ${report.kpRows.length}`} sub={`看提示 ${t.hintsUsed} 次 · 跳過 ${t.skipped} 題`} />
      </div>

      {/* 評語 */}
      <section className="card p-5">
        <h2 className="font-semibold">學習評估</h2>
        {ai ? (
          <>
            <p className="mt-2 leading-relaxed">{ai.comment}</p>
            <div className="mt-1 text-xs text-ink-muted">— AI 學習教練評語</div>
          </>
        ) : (
          <p className="mt-2 leading-relaxed">{report.comment}{aiLoading && <span className="ml-2 text-xs text-ink-muted">（AI 評語產生中…）</span>}</p>
        )}
        <h3 className="mt-4 text-sm font-semibold">下一步建議</h3>
        <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-ink-soft">
          {(ai?.actions.length ? ai.actions : report.actions).map((a, i) => <li key={i}>{a}</li>)}
        </ul>
      </section>

      <div className="grid gap-5 md:grid-cols-2">
        <section className="card p-5">
          <h2 className="font-semibold">各波正確率</h2>
          <p className="mb-3 text-xs text-ink-muted">系統每波都會把題目集中到你較弱的地方，所以正確率不一定逐波上升</p>
          {report.rounds.length ? <RoundBars rounds={report.rounds} /> : <Empty>沒有作答紀錄</Empty>}
        </section>
        <section className="card p-5">
          <h2 className="font-semibold">錯誤類型</h2>
          <p className="mb-3 text-xs text-ink-muted">依把握度與作答時間判斷，可在每波結束時更正</p>
          <HBars items={(Object.keys(ERROR_TYPE_LABEL) as ErrorType[]).map(k => ({ label: ERROR_TYPE_LABEL[k], value: report.errorTypes[k] }))} />
          <h3 className="mb-2 mt-5 text-sm font-semibold">自我認知（把握度 × 對錯）</h3>
          <table className="w-full text-sm">
            <thead><tr className="text-left text-xs text-ink-muted"><th className="font-normal">把握度</th><th className="font-normal">答對</th><th className="font-normal">答錯</th></tr></thead>
            <tbody>
              {(['sure', 'unsure', 'guess'] as const).map(c => (
                <tr key={c} className="border-t border-black/5">
                  <td className="py-1">{CONFIDENCE_LABEL[c]}</td>
                  <td className="tabular-nums">{report.calibration[c].correct}</td>
                  <td className={`tabular-nums ${c === 'sure' && report.calibration[c].wrong > 0 ? 'font-semibold text-red-600' : ''}`}>{report.calibration[c].wrong}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>

      {/* 知識點明細 */}
      <section className="card p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-semibold">知識點掌握度</h2>
          <div className="flex items-center gap-3 text-xs text-ink-muted">
            <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full" style={{ background: 'var(--viz-baseline)' }} />練習前</span>
            <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full" style={{ background: 'var(--viz-series-1)' }} />練習後</span>
            <span>刻度線：55 進步中 / 80 已掌握</span>
          </div>
        </div>
        <div className="mt-3 divide-y divide-black/5">
          {report.kpRows.map(r => (
            <div key={`${r.chapter}|${r.kp}`} className="grid gap-2 py-3 sm:grid-cols-[1fr_180px_110px] sm:items-center">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{r.kp}</span>
                  <MasteryBadge score={r.after} />
                  <span className={`text-xs tabular-nums ${r.delta >= 0 ? 'text-green-700' : 'text-red-600'}`}>{r.delta >= 0 ? '+' : ''}{Math.round(r.delta)}</span>
                </div>
                <div className="mt-0.5 text-xs text-ink-muted">
                  {r.chapter} · 答對 {r.correct}/{r.attempts} · 平均 {Math.round(r.avgTimeMs / 1000)} 秒
                  {Object.entries(r.errorTypes).map(([k, n]) => ` · ${ERROR_TYPE_LABEL[k as ErrorType]}×${n}`).join('')}
                </div>
              </div>
              <MasteryDumbbell before={r.before} after={r.after} />
              <AnswerTrail history={r.history} />
            </div>
          ))}
        </div>
      </section>

      {/* 錯題回顧 */}
      <section className="card p-5">
        <div className="flex items-baseline justify-between">
          <h2 className="font-semibold">錯題回顧（{wrongList.length}）</h2>
          {session.mode === 'practice' && wrongList.length > 0 && <span className="text-xs text-ink-muted">已加入錯題本，會依排程提醒複習</span>}
        </div>
        {wrongList.length === 0 ? <div className="mt-3"><Empty>這次沒有錯題，太棒了！</Empty></div> : (
          <div className="mt-3 space-y-3">
            {(showAll ? wrongList : wrongList.slice(0, 5)).map(({ q, a, round }) => (
              <div key={q.id} className="rounded-xl border border-black/5 p-4 text-sm">
                <div className="mb-1 text-xs text-ink-muted">第 {round} 波 · {q.kp}{a.errorType && ` · ${ERROR_TYPE_LABEL[a.errorType]}`}{a.errorCause && ` · ${a.errorCause}`}</div>
                <SolutionView>{q.stem}</SolutionView>
                <div className="mt-2 grid gap-1 sm:grid-cols-2">
                  <div className="text-red-700">你的答案：{a.chosen === null ? '（跳過）' : <MathText>{`(${'ABCD'[a.chosen]}) ${q.options[a.chosen]}`}</MathText>}</div>
                  <div className="text-green-700">正確答案：<MathText>{`(${'ABCD'[q.answerIndex]}) ${q.options[q.answerIndex]}`}</MathText></div>
                </div>
                <details className="mt-2">
                  <summary className="cursor-pointer text-brand-600">看詳解</summary>
                  <div className="mt-1 leading-relaxed text-ink-soft"><SolutionView>{q.explanation}</SolutionView></div>
                  <div className="no-print mt-2"><AskAI q={q} /></div>
                </details>
              </div>
            ))}
            {wrongList.length > 5 && !showAll && <button className="btn-ghost w-full" onClick={() => setShowAll(true)}>顯示全部 {wrongList.length} 題</button>}
          </div>
        )}
      </section>

      <div className="no-print flex flex-wrap gap-2">
        <Link href="/" className="btn-outline">回首頁</Link>
        <Link href="/wrong-book" className="btn-outline">打開錯題本</Link>
        <Link href="/practice/new" className="btn-primary">再練一次</Link>
      </div>
    </div>
  )
}
