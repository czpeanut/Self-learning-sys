'use client'

import { Suspense, useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import MathText from '@/components/MathText'
import { MasteryBadge, ProgressBar, fmtPct } from '@/components/ui'
import { diagnoseError } from '@/lib/engine'
import { fetchRound, finishSession, nextStep } from '@/lib/session-client'
import { applyAnswer, askTeacher, cancelHelp, getMasteryMap, getSession, logActivity, recordReview, recordWrong, saveSession } from '@/lib/storage'
import { getErrorCauses } from '@/lib/taxonomy'
import type { Answer, Confidence, ErrorType, KPMastery, PlanItem, Question, Session } from '@/lib/types'
import { CONFIDENCE_LABEL, DIFFICULTY_LABEL, ERROR_TYPE_LABEL, kpKey } from '@/lib/types'

export default function SessionPage() {
  return <Suspense><SessionRunner /></Suspense>
}

const LETTERS = ['A', 'B', 'C', 'D']

function SessionRunner() {
  const router = useRouter()
  const id = useSearchParams().get('id') ?? ''
  const [session, setSession] = useState<Session | null>(null)
  const [missing, setMissing] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [genError, setGenError] = useState<string | null>(null)
  const [warnings, setWarnings] = useState<string[]>([])

  useEffect(() => {
    const s = getSession(id)
    if (!s) { setMissing(true); return }
    if (s.status === 'finished') { router.replace(`/report?id=${s.id}`); return }
    setSession(s)
  }, [id, router])

  const update = useCallback((s: Session) => { saveSession(s); setSession(s) }, [])

  const generate = useCallback(async (s: Session, plan: PlanItem[]) => {
    setGenerating(true); setGenError(null)
    try {
      const { round, warnings: w } = await fetchRound(s, plan)
      setWarnings(w)
      update({ ...s, rounds: [...s.rounds, round] })
    } catch (e) {
      setGenError(e instanceof Error ? e.message : '出題失敗')
    } finally {
      setGenerating(false)
    }
  }, [update])

  // 第一波：自動規劃並出題
  const started = useRef(false)
  useEffect(() => {
    if (!session || session.rounds.length > 0 || started.current) return
    started.current = true
    const step = nextStep(session)
    if ('plan' in step) generate(session, step.plan)
  }, [session, generate])

  const finish = useCallback((reason: NonNullable<Session['endReason']>) => {
    if (!session) return
    const done = finishSession(session, reason)
    router.push(`/report?id=${done.id}`)
  }, [session, router])

  if (missing) return <div className="card p-6 text-center">找不到這次練習。<Link className="text-brand-600 underline" href="/">回首頁</Link></div>
  if (!session) return null

  const round = session.rounds[session.rounds.length - 1]

  if (generating || !round) {
    return (
      <Shell session={session} onPause={() => router.push('/')}>
        <div className="card p-8 text-center">
          {genError ? (
            <>
              <div className="font-medium text-red-600">出題失敗：{genError}</div>
              <button className="btn-primary mt-4" onClick={() => {
                const step = nextStep(session)
                if ('plan' in step) generate(session, step.plan)
              }}>重試</button>
            </>
          ) : (
            <>
              <div className="mx-auto h-8 w-8 animate-spin rounded-full border-4 border-brand-100 border-t-brand-500" />
              <div className="mt-3 font-medium">正在為你準備第 {session.rounds.length + 1} 波題目…</div>
              <div className="mt-1 text-sm text-ink-muted">依你的作答情況挑選知識點與難度</div>
            </>
          )}
        </div>
      </Shell>
    )
  }

  const roundDone = round.answers.length >= round.questions.length
  if (roundDone) {
    return (
      <Shell session={session} onPause={() => router.push('/')}>
        <RoundSummary session={session} onUpdate={update}
          onNext={plan => generate(session, plan)} onFinish={finish} />
      </Shell>
    )
  }

  const q = round.questions[round.answers.length]
  return (
    <Shell session={session} onPause={() => router.push('/')}>
      {warnings.length > 0 && round.answers.length === 0 && (
        <div className="mb-3 rounded-xl bg-amber-50 px-4 py-2 text-sm text-amber-900">{warnings.join('；')}</div>
      )}
      <QuestionView key={q.id} q={q} index={round.answers.length} total={round.questions.length}
        roundIndex={round.index} session={session}
        onAnswered={a => {
          const rounds = session.rounds.slice()
          const last = { ...round, answers: [...round.answers, a] }
          if (last.answers.length >= last.questions.length) last.finishedAt = Date.now()
          rounds[rounds.length - 1] = last
          update({ ...session, rounds })
        }} />
    </Shell>
  )
}

function Shell({ session, children, onPause }: { session: Session; children: React.ReactNode; onPause: () => void }) {
  const title = session.mode === 'review' ? '錯題複習' : `${session.subject}自習`
  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <div className="font-bold">{title}</div>
          <div className="text-xs text-ink-muted">
            {session.scope.length} 個知識點{session.mode === 'practice' && ` · 第 ${Math.max(1, session.rounds.length)} / ${session.settings.maxRounds} 波`}
            {session.goal && ` · 目標：${session.goal}`}
          </div>
        </div>
        <button className="btn-ghost py-1.5" onClick={onPause} title="進度已自動儲存，可從首頁繼續">暫停離開</button>
      </div>
      {children}
    </div>
  )
}

// ── 單題作答 ─────────────────────────────────────────────────────
function QuestionView({ q, index, total, roundIndex, session, onAnswered }: {
  q: Question; index: number; total: number; roundIndex: number; session: Session; onAnswered: (a: Answer) => void
}) {
  const [chosen, setChosen] = useState<number | null>(null)
  const [hint, setHint] = useState(false)
  const [result, setResult] = useState<Answer | null>(null)
  const [elapsed, setElapsed] = useState(0)
  const [masteryAfter, setMasteryAfter] = useState<KPMastery | null>(null)
  const [asked, setAsked] = useState(false)
  const t0 = useRef(Date.now())
  const limit = session.settings.secondsPerQuestion

  useEffect(() => {
    if (result) return
    const t = setInterval(() => setElapsed(Math.floor((Date.now() - t0.current) / 1000)), 500)
    return () => clearInterval(t)
  }, [result])

  const submit = useCallback((confidence: Confidence, skip = false) => {
    if (result) return
    const pickIdx = skip ? null : chosen
    if (!skip && pickIdx === null) return
    const a: Answer = {
      questionId: q.id, chosen: pickIdx, correct: pickIdx === q.answerIndex,
      confidence: skip ? 'guess' : confidence, usedHint: hint, timeMs: Date.now() - t0.current,
    }
    a.errorType = diagnoseError(a, limit)
    const map = applyAnswer(q, a)
    setMasteryAfter(map[kpKey(q)])
    logActivity(a.correct, a.timeMs)
    if (session.mode === 'review') recordReview(q.id, a.correct, a.chosen)
    else if (!a.correct) recordWrong(q, a)
    setResult(a)
  }, [chosen, hint, q, limit, result, session.mode])

  // 鍵盤：1–4 選答案、H 看提示、Enter 送出/下一題
  const next = useCallback(() => { if (result) onAnswered(result) }, [result, onAnswered])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      if (!result && ['1', '2', '3', '4'].includes(e.key)) setChosen(Number(e.key) - 1)
      else if (!result && e.key.toLowerCase() === 'h') setHint(true)
      else if (e.key === 'Enter') { if (result) next(); else if (chosen !== null) submit('sure') }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [result, chosen, next, submit])

  const over = limit > 0 && elapsed > limit

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3 text-sm">
        <span className="font-medium">第 {roundIndex} 波 · {index + 1}/{total}</span>
        <ProgressBar value={index} max={total} className="flex-1" />
        {limit > 0 && <span className={`tabular-nums ${over ? 'text-red-600' : 'text-ink-muted'}`}>{elapsed}s / {limit}s</span>}
      </div>

      <div className="card p-5">
        <div className="mb-3 flex flex-wrap items-center gap-1.5 text-xs">
          <span className="chip bg-black/5 text-ink-soft">{q.chapter}</span>
          <span className="chip bg-brand-50 text-brand-700">{q.kp}</span>
          <span className="chip bg-black/5 text-ink-soft">{DIFFICULTY_LABEL[q.difficulty]}</span>
          {q.variantOf && <span className="chip bg-purple-50 text-purple-700">錯題變化題</span>}
          {q.source === 'review' && <span className="chip bg-purple-50 text-purple-700">錯題複習</span>}
          {q.demo && <span className="chip bg-amber-50 text-amber-800">示範題</span>}
        </div>
        <div className="text-[17px] leading-relaxed"><MathText>{q.stem}</MathText></div>

        <div className="mt-4 grid gap-2">
          {q.options.map((opt, i) => {
            const isAns = i === q.answerIndex
            let cls = 'border-black/10 bg-white hover:border-brand-500/50'
            if (!result && chosen === i) cls = 'border-brand-500 bg-brand-50 ring-1 ring-brand-500'
            if (result) {
              if (isAns) cls = 'border-green-600 bg-green-50'
              else if (result.chosen === i) cls = 'border-red-500 bg-red-50'
              else cls = 'border-black/5 bg-white opacity-60'
            }
            return (
              <button key={i} disabled={!!result} onClick={() => setChosen(i)}
                className={`flex items-start gap-3 rounded-xl border px-4 py-3 text-left transition ${cls}`}>
                <span className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-black/5 text-xs font-bold">{LETTERS[i]}</span>
                <span className="flex-1"><MathText>{opt}</MathText></span>
                {result && isAns && <span className="text-sm font-medium text-green-700">✓ 正解</span>}
                {result && !isAns && result.chosen === i && <span className="text-sm font-medium text-red-600">✗ 你的答案</span>}
              </button>
            )
          })}
        </div>

        {hint && q.hint && !result && (
          <div className="mt-3 rounded-xl bg-amber-50 px-4 py-2 text-sm text-amber-900">💡 <MathText>{q.hint}</MathText></div>
        )}

        {!result ? (
          <div className="mt-4 space-y-2">
            <div className="text-xs text-ink-muted">選好答案後，依你的把握程度送出（會影響掌握度計算）：</div>
            <div className="grid grid-cols-3 gap-2">
              {(['sure', 'unsure', 'guess'] as Confidence[]).map(c => (
                <button key={c} disabled={chosen === null} onClick={() => submit(c)}
                  className={c === 'sure' ? 'btn-primary' : 'btn-outline'}>
                  {CONFIDENCE_LABEL[c]}
                </button>
              ))}
            </div>
            <div className="flex justify-between pt-1 text-sm">
              <button className="text-ink-soft underline-offset-2 hover:underline disabled:opacity-40" disabled={hint || !q.hint} onClick={() => setHint(true)}>
                {hint ? '已看提示' : '看提示（H）'}
              </button>
              <button className="text-ink-soft underline-offset-2 hover:underline" onClick={() => submit('guess', true)}>不會，跳過看詳解</button>
            </div>
          </div>
        ) : (
          <div className="mt-4 space-y-3">
            <div className={`rounded-xl px-4 py-3 ${result.correct ? 'bg-green-50 text-green-900' : 'bg-red-50 text-red-900'}`}>
              <div className="font-semibold">
                {result.correct ? '✓ 答對了！' : result.chosen === null ? '已跳過' : '✗ 答錯了'}
                {result.errorType && <span className="ml-2 text-sm font-normal">判斷：{ERROR_TYPE_LABEL[result.errorType]}</span>}
              </div>
              {masteryAfter && (
                <div className="mt-1 flex items-center gap-2 text-sm">「{q.kp}」掌握度 <MasteryBadge score={masteryAfter.score} /></div>
              )}
            </div>
            <div className="rounded-xl bg-black/[.03] px-4 py-3 text-sm leading-relaxed">
              <div className="mb-1 font-semibold">詳解</div>
              <MathText>{q.explanation}</MathText>
            </div>
            <div className="flex gap-2">
              {!q.demo && (
                <button className={asked ? 'btn-ghost shrink-0 bg-amber-100 text-amber-900' : 'btn-outline shrink-0'}
                  title="看完詳解還是不懂？標記起來，館內老師巡堂時會看到"
                  onClick={() => { if (asked) cancelHelp(q.id); else askTeacher(q); setAsked(!asked) }}>
                  🙋 {asked ? '已標記問老師' : '問老師'}
                </button>
              )}
              <button className="btn-primary flex-1 py-2.5" onClick={next}>{index + 1 < total ? '下一題（Enter）' : '看這波結果'}</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ── 每波結束：結果 + 錯因標記 + 下一波計畫 ─────────────────────────
function RoundSummary({ session, onUpdate, onNext, onFinish }: {
  session: Session
  onUpdate: (s: Session) => void
  onNext: (plan: PlanItem[]) => void
  onFinish: (reason: NonNullable<Session['endReason']>) => void
}) {
  const round = session.rounds[session.rounds.length - 1]
  const correct = round.answers.filter(a => a.correct).length
  const step = nextStep(session)
  const mastery = getMasteryMap()

  const byKP = new Map<string, { kp: string; chapter: string; total: number; correct: number }>()
  round.questions.forEach((q, i) => {
    const a = round.answers[i]
    const k = kpKey(q)
    const row = byKP.get(k) ?? { kp: q.kp, chapter: q.chapter, total: 0, correct: 0 }
    row.total++
    if (a?.correct) row.correct++
    byKP.set(k, row)
  })

  const wrong = round.questions.map((q, i) => ({ q, a: round.answers[i], i })).filter(x => x.a && !x.a.correct)
  const causes = getErrorCauses(session.subject)

  const setAnswerField = (i: number, patch: Partial<Answer>) => {
    const rounds = session.rounds.slice()
    const answers = round.answers.slice()
    answers[i] = { ...answers[i], ...patch }
    rounds[rounds.length - 1] = { ...round, answers }
    onUpdate({ ...session, rounds })
  }

  const doneText: Record<string, string> = {
    'all-passed': '🎉 範圍內的知識點全部過關！',
    'max-rounds': session.mode === 'review' ? '複習完成！' : `已完成設定的 ${session.settings.maxRounds} 波練習。`,
  }

  return (
    <div className="space-y-4">
      <div className="card p-5">
        <div className="text-sm text-ink-muted">第 {round.index} 波結果</div>
        <div className="mt-1 text-3xl font-bold tabular-nums">{correct} / {round.answers.length} <span className="text-lg font-medium text-ink-soft">（{fmtPct(correct / Math.max(1, round.answers.length))}）</span></div>
        <div className="mt-4 divide-y divide-black/5">
          {Array.from(byKP.entries()).map(([k, r]) => (
            <div key={k} className="flex items-center justify-between gap-2 py-2 text-sm">
              <div><span className="font-medium">{r.kp}</span> <span className="text-xs text-ink-muted">{r.chapter}</span></div>
              <div className="flex items-center gap-2">
                <span className="tabular-nums text-ink-soft">{r.correct}/{r.total}</span>
                <MasteryBadge score={mastery[k]?.score} />
              </div>
            </div>
          ))}
        </div>
      </div>

      {wrong.length > 0 && (
        <div className="card p-5">
          <h3 className="font-semibold">標記錯因</h3>
          <p className="text-xs text-ink-muted">系統已自動判斷，你可以更正；標記越準，報告越有用。</p>
          <div className="mt-3 space-y-3">
            {wrong.map(({ q, a, i }) => (
              <div key={q.id} className="rounded-xl border border-black/5 p-3">
                <div className="line-clamp-2 text-sm"><MathText>{q.stem}</MathText></div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {(Object.keys(ERROR_TYPE_LABEL) as ErrorType[]).map(t => (
                    <button key={t} onClick={() => setAnswerField(i, { errorType: t })}
                      className={`chip border ${a.errorType === t ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-black/10 text-ink-soft'}`}>
                      {ERROR_TYPE_LABEL[t]}
                    </button>
                  ))}
                  {causes.length > 0 && <span className="mx-1 text-black/20">|</span>}
                  {causes.map(c => (
                    <button key={c} onClick={() => setAnswerField(i, { errorCause: a.errorCause === c ? undefined : c })}
                      className={`chip border ${a.errorCause === c ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-black/10 text-ink-soft'}`}>
                      {c}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="card p-5">
        {'plan' in step ? (
          <>
            <h3 className="font-semibold">下一波（第 {session.rounds.length + 1} 波）計畫</h3>
            <div className="mt-2 divide-y divide-black/5">
              {step.plan.map(p => (
                <div key={kpKey(p)} className="flex items-start justify-between gap-3 py-2 text-sm">
                  <div>
                    <div className="font-medium">{p.kp} <span className="text-xs font-normal text-ink-muted">× {p.count} 題 · {DIFFICULTY_LABEL[p.difficulty]}</span></div>
                    <div className="text-xs text-ink-soft">{p.reason}</div>
                  </div>
                  {p.variantsOf && p.variantsOf.length > 0 && <span className="chip shrink-0 bg-purple-50 text-purple-700">{p.variantsOf.length} 題變化題</span>}
                </div>
              ))}
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <button className="btn-outline" onClick={() => onFinish('user-ended')}>先到這裡，看報告</button>
              <button className="btn-primary" onClick={() => onNext(step.plan)}>開始第 {session.rounds.length + 1} 波</button>
            </div>
          </>
        ) : (
          <>
            <div className="text-lg font-semibold">{doneText[step.done] ?? '練習結束'}</div>
            <button className="btn-primary mt-4 w-full py-2.5" onClick={() => onFinish(step.done)}>產生學習報告</button>
          </>
        )}
      </div>
    </div>
  )
}
