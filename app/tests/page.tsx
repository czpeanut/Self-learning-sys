'use client'

// 程度檢測（學生）：館方派的檢測卷 → 限時作答（不給提示與回饋）→ 伺服器批改 → 成績、各單元程度、錯題講解
// 交卷後題目會記進作答紀錄與錯題本，段考準備度、弱項特訓都會用到。

import { Suspense, useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import AskAI from '@/components/AskAI'
import MathText from '@/components/MathText'
import SolutionView from '@/components/SolutionView'
import { Empty, Tile } from '@/components/ui'
import { CLOUD } from '@/lib/auth-shared'
import { BOOK_NAME } from '@/lib/exam'
import { type PublicQuestion, type TestQuestion, type TestResult, toQuestion } from '@/lib/placement'
import { applyAnswer, logActivity, logAttempt, recordWrong } from '@/lib/storage'
import { authFetch } from '@/lib/supabase'

type ListItem = { id: string; title: string; book?: string; time_limit_min?: number; status: string; due_date: string | null; submitted_at: string | null; score: number | null; level: { code: string; label: string } | null }
type Detail = {
  assignment: { id: string; status: string; started_at: string | null; due_date: string | null; score: number | null; result: TestResult | null; answers: Record<string, number | null> | null }
  test: { title: string; book: string; time_limit_min: number; questions: (PublicQuestion | TestQuestion)[] }
}

async function call<T>(method: string, body?: unknown, query = ''): Promise<T> {
  const res = await authFetch(`/api/tests${query}`, { method, headers: body ? { 'Content-Type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined })
  const d = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error((d as { error?: string }).error ?? `HTTP ${res.status}`)
  return d as T
}

export default function TestsPage() {
  if (!CLOUD) return <Empty>程度檢測由館方派發，需要雲端帳號（設定 Supabase 後才有）。</Empty>
  return <Suspense><TestsView /></Suspense>
}

function TestsView() {
  const id = useSearchParams().get('id')
  return id ? <TakeTest id={id} /> : <TestList />
}

function TestList() {
  const [list, setList] = useState<ListItem[] | null>(null)
  const [err, setErr] = useState('')
  useEffect(() => { call<{ tests: ListItem[] }>('GET').then(d => setList(d.tests)).catch(e => setErr(e.message)) }, [])
  if (err) return <div className="leaf-sm bg-red-50 px-4 py-2 text-sm text-red-700">{err}</div>
  if (!list) return null
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold">程度檢測</h1>
        <p className="text-sm text-ink-soft">館方派給你的檢測卷。限時作答、中途沒有提示，交卷後才看得到成績與詳解——用來看你目前真正的程度。</p>
      </div>
      {list.length === 0 ? <Empty>目前沒有檢測</Empty> : (
        <div className="space-y-2">
          {list.map(t => (
            <Link key={t.id} href={`/tests?id=${t.id}`} className="card flex flex-wrap items-center justify-between gap-3 p-4 hover:shadow-md">
              <div>
                <div className="font-semibold">{t.title}</div>
                <div className="text-sm text-ink-soft">{t.book && BOOK_NAME[t.book]} · {t.time_limit_min} 分鐘{t.due_date && t.status !== 'submitted' && ` · 期限 ${t.due_date}`}</div>
              </div>
              {t.status === 'submitted'
                ? <span className="text-right"><b className="text-lg">{t.score} 分</b><span className="ml-2 chip bg-brand-50 text-brand-700">{t.level?.code} {t.level?.label}</span></span>
                : <span className="btn-primary">{t.status === 'started' ? '繼續作答' : '開始檢測'}</span>}
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}

const draftKey = (id: string) => `sls:test-draft:${id}`

function TakeTest({ id }: { id: string }) {
  const router = useRouter()
  const [d, setD] = useState<Detail | null>(null)
  const [err, setErr] = useState('')
  const [answers, setAnswers] = useState<Record<string, number | null>>({})
  const [now, setNow] = useState(Date.now())
  const [busy, setBusy] = useState(false)
  const submitted = useRef(false)

  const load = useCallback(async () => {
    try {
      const x = await call<Detail>('GET', undefined, `?id=${id}`)
      setD(x)
      if (x.assignment.status !== 'submitted') {
        try { setAnswers(JSON.parse(localStorage.getItem(draftKey(id)) ?? '{}')) } catch { /* 沒有草稿 */ }
      }
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)) }
  }, [id])
  useEffect(() => { void load() }, [load])
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t) }, [])

  const submit = useCallback(async () => {
    if (!d || submitted.current) return
    submitted.current = true
    setBusy(true)
    try {
      const r = await call<{ result: TestResult; questions: TestQuestion[]; answers: Record<string, number | null> }>('POST', { id, action: 'submit', answers })
      // 記進作答紀錄與錯題本（段考準備度、弱項特訓會用到）
      const started = d.assignment.started_at ? Date.parse(d.assignment.started_at) : Date.now()
      const per = Math.round((Date.now() - started) / Math.max(1, r.questions.length))
      for (const tq of r.questions) {
        const q = toQuestion(tq, d.test.book, BOOK_NAME[d.test.book] ?? '')
        const chosen = r.answers[tq.id] ?? null
        const a = { questionId: q.id, chosen, correct: chosen === tq.answer, confidence: 'unsure' as const, usedHint: false, timeMs: per }
        applyAnswer(q, a); logAttempt(q, a); logActivity(a.correct, per)
        if (!a.correct) recordWrong(q, a)
      }
      try { localStorage.removeItem(draftKey(id)) } catch { /* 忽略 */ }
      await load()
    } catch (e) { submitted.current = false; setErr(e instanceof Error ? e.message : String(e)) }
    setBusy(false)
  }, [d, id, answers, load])

  const startedAt = d?.assignment.started_at ? Date.parse(d.assignment.started_at) : null
  const left = d && startedAt ? Math.round((startedAt + d.test.time_limit_min * 60000 - now) / 1000) : null
  // 時間到自動交卷
  useEffect(() => { if (d?.assignment.status === 'started' && left != null && left <= 0) void submit() }, [left, d, submit])

  if (err) return <div className="leaf-sm bg-red-50 px-4 py-2 text-sm text-red-700">{err} <Link href="/tests" className="underline">回列表</Link></div>
  if (!d) return null
  const qs = d.test.questions

  if (d.assignment.status === 'submitted' && d.assignment.result) return <Result d={d} />

  if (d.assignment.status === 'assigned') {
    return (
      <div className="card mx-auto max-w-lg space-y-3 p-6 text-center">
        <h1 className="text-xl font-bold">{d.test.title}</h1>
        <p className="text-sm text-ink-soft">共 {qs.length} 題 · 限時 {d.test.time_limit_min} 分鐘{d.assignment.due_date && ` · 期限 ${d.assignment.due_date}`}</p>
        <ul className="mx-auto max-w-sm list-disc space-y-1 pl-5 text-left text-sm">
          <li>按下開始就開始計時，離開頁面時間也會繼續算</li>
          <li>作答中沒有提示、不會告訴你對錯，交卷後才看得到成績與詳解</li>
          <li>不會的題目可以先跳過，最後再回來；時間到會自動交卷</li>
        </ul>
        <button className="btn-primary px-8 py-2.5" onClick={() => void call('POST', { id, action: 'start' }).then(load).catch(e => setErr(e.message))}>開始檢測</button>
      </div>
    )
  }

  const done = qs.filter(q => typeof answers[q.id] === 'number').length
  const pick = (qid: string, i: number) => {
    const next = { ...answers, [qid]: i }
    setAnswers(next)
    try { localStorage.setItem(draftKey(id), JSON.stringify(next)) } catch { /* 忽略 */ }
  }
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="sticky top-0 z-10 -mx-4 flex items-center justify-between gap-3 border-b border-black/5 bg-paper/95 px-4 py-2 backdrop-blur">
        <div className="min-w-0"><div className="truncate font-semibold">{d.test.title}</div><div className="text-xs text-ink-muted">已作答 {done}/{qs.length}</div></div>
        <div className={`tabular-nums text-lg font-bold ${left != null && left < 300 ? 'text-red-600' : ''}`}>{left != null ? `${Math.floor(Math.max(0, left) / 60)}:${String(Math.max(0, left) % 60).padStart(2, '0')}` : ''}</div>
        <button className="btn-primary" disabled={busy} onClick={() => { if (done === qs.length || confirm(`還有 ${qs.length - done} 題沒作答，確定交卷？`)) void submit() }}>{busy ? '批改中…' : '交卷'}</button>
      </div>
      {qs.map((q, n) => (
        <div key={q.id} className="card p-4">
          <div className="mb-1 text-xs text-ink-muted">第 {n + 1} 題</div>
          <SolutionView>{q.stem}</SolutionView>
          <div className="mt-2 grid gap-1.5 sm:grid-cols-2">
            {q.options.map((o, i) => (
              <button key={i} onClick={() => pick(q.id, i)} className={`flex items-start gap-2 leaf-sm border px-3 py-2 text-left text-sm ${answers[q.id] === i ? 'border-brand-500 bg-brand-50' : 'border-black/10 hover:bg-black/[.02]'}`}>
                <span className="font-semibold">({'ABCDE'[i]})</span><MathText>{o}</MathText>
              </button>
            ))}
          </div>
          <div className="mt-2 text-xs text-ink-muted">{q.cite}</div>
        </div>
      ))}
      <button className="btn-primary w-full py-2.5" disabled={busy} onClick={() => { if (done === qs.length || confirm(`還有 ${qs.length - done} 題沒作答，確定交卷？`)) void submit() }}>交卷</button>
      <button className="btn-ghost w-full" onClick={() => router.push('/tests')}>先離開（時間會繼續算）</button>
    </div>
  )
}

function Result({ d }: { d: Detail }) {
  const r = d.assignment.result!
  const qs = d.test.questions as TestQuestion[]
  const [showAll, setShowAll] = useState(false)
  const wrong = qs.filter(q => d.assignment.answers?.[q.id] !== q.answer)
  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div>
        <div className="text-sm text-ink-muted">程度檢測結果</div>
        <h1 className="text-2xl font-bold">{d.test.title}</h1>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <Tile label="得分" value={`${r.score}`} sub="難度加權，滿分 100" />
        <Tile label="程度" value={`${r.level.code} ${r.level.label}`} sub={r.level.desc} />
        <Tile label="答對" value={`${r.correct}/${r.total}`} sub={`有作答 ${r.answered} 題`} />
      </div>
      <section className="card p-5">
        <h2 className="font-semibold">各單元</h2>
        <div className="mt-2 divide-y divide-black/5 text-sm">
          {r.byUnit.map(u => (
            <div key={u.key} className="flex items-center gap-3 py-1.5">
              <span className="w-44 truncate">{u.name}</span>
              <div className="h-2 flex-1 rounded-full bg-black/5"><div className="h-2 rounded-full" style={{ width: `${u.pct * 100}%`, background: 'var(--viz-series-1)' }} /></div>
              <span className="w-24 text-right tabular-nums">{u.correct}/{u.total} · {u.level.label}</span>
            </div>
          ))}
        </div>
        {r.strengths.length > 0 && <p className="mt-2 text-sm">✓ 穩固：{r.strengths.join('、')}</p>}
        {r.weaknesses.length > 0 && <p className="text-sm">▲ 需要加強：{r.weaknesses.join('、')}</p>}
        <div className="mt-3 flex gap-2">
          <Link href="/drill" className="btn-primary">針對弱點特訓</Link>
          <Link href="/tests" className="btn-outline">回檢測列表</Link>
        </div>
        <p className="mt-2 text-xs text-ink-muted">答錯的題目已收進錯題本；這次作答也算進段考準備度。</p>
      </section>
      <section className="space-y-3">
        <h2 className="font-semibold">{showAll ? '全部題目' : `答錯的題目（${wrong.length}）`} <button className="ml-2 text-sm font-normal text-brand-600 underline" onClick={() => setShowAll(!showAll)}>{showAll ? '只看錯題' : '看全部'}</button></h2>
        {(showAll ? qs : wrong).map(q => {
          const chosen = d.assignment.answers?.[q.id] ?? null
          return (
            <div key={q.id} className="card p-4 text-sm">
              <SolutionView>{q.stem}</SolutionView>
              <ol className="mt-2 grid gap-1 sm:grid-cols-2">
                {q.options.map((o, i) => (
                  <li key={i} className={i === q.answer ? 'font-medium text-green-700' : i === chosen ? 'text-red-600 line-through' : 'text-ink-soft'}>({'ABCDE'[i]}) <MathText>{o}</MathText></li>
                ))}
              </ol>
              {chosen === null && <div className="mt-1 text-xs text-amber-700">沒有作答</div>}
              <div className="mt-1 text-xs text-ink-muted">{q.cite}</div>
              <div className="mt-2"><AskAI q={toQuestion(q, d.test.book, BOOK_NAME[d.test.book] ?? '')} /></div>
            </div>
          )
        })}
      </section>
    </div>
  )
}
