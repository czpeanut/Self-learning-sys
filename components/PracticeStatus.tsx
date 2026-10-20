'use client'

// 首頁「練習狀況」（做法同 Prac-sys 的練習進度）：
//   有題庫的科目（目前數學）→ 選冊 → 列出題庫裡「所有」單元與題型，含沒練過的，
//   量化成「已熟練 X／Y 題型、還沒練 N 個」，一眼看出還有多少沒讀；點題型或單元直接開練
//   還沒有題庫的科目 → 用知識點分類（taxonomy）列出全部知識點，一樣含沒練過的（AI 出題）
// 熟練規則與段考準備度相同（lib/readiness.ts）

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { masteryLevel } from '@/lib/engine'
import { BANK_SUBJECTS, BOOK_NAME, inferExam } from '@/lib/exam'
import { OTHER, type PoolCatalog, STATUS_LABEL, type TypeRow, type TypeStatus, computeReadiness } from '@/lib/readiness'
import { createExamSession } from '@/lib/session-client'
import { getAttempts, getExamTarget, getMasteryMap, getProfile } from '@/lib/storage'
import { SUBJECTS, getChapters, getKnowledgePoints } from '@/lib/taxonomy'
import { DEFAULT_SETTINGS, type ExamTarget, type KPMastery, type KPRef } from '@/lib/types'

const GRADE: Record<string, number> = { 七年級: 7, 八年級: 8, 九年級: 9 }
const BOOKS = Object.keys(BOOK_NAME)

// 狀態顏色：已熟練綠、練習中黃、需要複習橘、未練習灰
const ST: Record<TypeStatus, { bar: string; chip: string }> = {
  mastered: { bar: 'linear-gradient(90deg, #7df2c4, #12b482)', chip: 'border-[#12b482]/30 bg-[#e9faf2] text-[#086b4a]' },
  learning: { bar: 'linear-gradient(90deg, #ffe27d, #ffa41f)', chip: 'border-[#ffa41f]/40 bg-[#fff7e6] text-[#9a5b00]' },
  stale: { bar: 'linear-gradient(90deg, #ffc06b, #ff6a3d)', chip: 'border-[#ff6a3d]/30 bg-[#fff1e8] text-[#c2410c]' },
  untouched: { bar: 'rgba(18,26,46,0.08)', chip: 'border-dashed border-ink/15 bg-white text-ink-muted' },
}
const ORDER: TypeStatus[] = ['mastered', 'stale', 'learning', 'untouched']

function defaultBook(subject: string): string {
  const t = getExamTarget()
  if (t && t.subject === subject) return `${t.grade}-${t.semester}`
  const grade = GRADE[getProfile().grade] ?? 7
  return `${grade}-${inferExam(new Date(), grade).semester}`
}

export default function PracticeStatus() {
  const [subject, setSubject] = useState('數學')
  const bank = BANK_SUBJECTS.includes(subject)
  return (
    <div className="space-y-3 px-4 pb-4 pt-3">
      <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
        {SUBJECTS.map(s => {
          const on = s === subject
          return (
            <button key={s} onClick={() => setSubject(s)} aria-pressed={on}
              className={`chip shrink-0 py-1 ${on ? 'border-transparent font-bold text-ink' : 'bg-white text-ink-soft hover:border-ink/20'}`}
              style={on ? { background: 'var(--brand-grad)' } : undefined}>{s}</button>
          )
        })}
      </div>
      {bank ? <BankStatus key={subject} subject={subject} /> : <KPStatus key={subject} subject={subject} />}
    </div>
  )
}

// ── 題庫科目：所有題型 ─────────────────────────────────────────
function BankStatus({ subject }: { subject: string }) {
  const router = useRouter()
  const [book, setBook] = useState('')
  const [cat, setCat] = useState<PoolCatalog | null>(null)
  const [err, setErr] = useState('')
  const [open, setOpen] = useState<string | null>(null)
  useEffect(() => { setBook(defaultBook(subject)) }, [subject])
  useEffect(() => {
    if (!book) return
    setCat(null); setErr('')
    fetch(`/api/exam/catalog?subject=${encodeURIComponent(subject)}&book=${book}`)
      .then(async r => { if (!r.ok) throw new Error((await r.json()).error); return r.json() })
      .then(setCat).catch(e => setErr(String(e.message ?? e)))
  }, [subject, book])

  const r = useMemo(() => cat && computeReadiness({ cat, units: cat.units.map(u => u.code), attempts: getAttempts(), daysLeft: 30 }), [cat])

  const start = (rows: TypeRow[], goal: string) => {
    if (!cat || !rows.length) return
    const [grade, semester] = book.split('-').map(Number)
    const saved = getExamTarget()
    const target: ExamTarget = {
      subject, grade, semester: semester as 1 | 2, seq: inferExam(new Date(), grade).seq, publisher: saved?.publisher ?? '翰林',
      units: Array.from(new Set(rows.map(x => x.unit))), auto: false,
    }
    const scope: KPRef[] = rows.map(x => ({
      subject, chapter: `${BOOK_NAME[cat.book]} ${x.unit} ${x.unitTitle}`, kp: x.name, bank: { book: cat.book, unit: x.unit, type: x.type },
    }))
    const s = createExamSession(target, scope, { ...DEFAULT_SETTINGS, questionsPerRound: 10, maxRounds: 3 }, goal)
    router.push(`/practice/session?id=${s.id}`)
  }

  const counted = r ? r.rows.filter(x => x.type !== OTHER) : []
  const total = counted.length
  const pct = total ? Math.round((r!.counts.mastered / total) * 100) : 0

  return (
    <>
      <div className="flex flex-wrap gap-1">
        {BOOKS.map(b => (
          <button key={b} onClick={() => { setBook(b); setOpen(null) }} aria-pressed={b === book}
            className={`leaf-sm px-2.5 py-1 text-xs ${b === book ? 'bg-ink font-bold text-white' : 'bg-ink/[.05] text-ink-soft hover:bg-ink/10'}`}>{BOOK_NAME[b]}</button>
        ))}
      </div>

      {err ? <p className="text-sm text-ink-muted">{err}</p> : !r || !cat ? <p className="text-sm text-ink-muted">載入題型…</p> : (
        <>
          {/* 總覽：已熟練／全部題型、還沒練幾個 */}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Num label="已熟練題型" value={<>{r.counts.mastered}<small className="text-sm text-ink-muted"> / {total}</small></>} />
            <Num label="總進度" value={`${pct}%`} grad />
            <Num label="還沒練" value={r.counts.untouched} tone="text-[#c2185b]" />
            <Num label="練習中／要複習" value={`${r.counts.learning}／${r.counts.stale}`} />
          </div>
          <StackBar counts={r.counts} total={total} className="h-3" />
          <Legend />

          {/* 各單元 */}
          <div className="space-y-2">
            {cat.units.map(u => {
              const rows = r.rows.filter(x => x.unit === u.code)
              const cnt = rows.filter(x => x.type !== OTHER)
              const c = { untouched: 0, learning: 0, mastered: 0, stale: 0 } as Record<TypeStatus, number>
              for (const x of cnt) c[x.status]++
              const isOpen = open === u.code
              const todo = cnt.filter(x => x.status !== 'mastered' && x.poolN > 0)
              return (
                <div key={u.code} className="leaf border border-line bg-white">
                  <button onClick={() => setOpen(isOpen ? null : u.code)} aria-expanded={isOpen} className="w-full px-3 pb-2.5 pt-3 text-left">
                    <div className="flex items-baseline gap-2">
                      <span className="font-head text-sm font-bold text-ink-muted">{u.code}</span>
                      <span className="min-w-0 flex-1 truncate font-bold">{u.title}</span>
                      <span className="shrink-0 text-xs text-ink-muted">熟練 <b className="font-head text-sm text-ink">{c.mastered}</b>/{cnt.length}{c.untouched > 0 && <> · 沒練 <b className="font-head text-sm text-[#c2185b]">{c.untouched}</b></>}</span>
                      <span className="shrink-0 text-xs text-ink-muted">{isOpen ? '▴' : '▾'}</span>
                    </div>
                    <StackBar counts={c} total={cnt.length} className="mt-2 h-2" />
                  </button>
                  {isOpen && (
                    <div className="border-t border-line px-3 pb-3 pt-2">
                      <ul className="divide-y divide-line">
                        {rows.map(x => (
                          <li key={x.type} className="flex items-center gap-2 py-2 text-sm">
                            <span className={`chip shrink-0 ${ST[x.status].chip}`}>{STATUS_LABEL[x.status]}</span>
                            <span className="min-w-0 flex-1"><span className="block truncate">{x.name}</span>{x.desc && <span className="block truncate text-xs text-ink-muted">{x.desc}</span>}</span>
                            <span className="hidden shrink-0 gap-0.5 sm:flex" aria-label="最近 5 題">
                              {Array.from({ length: 5 }, (_, i) => { const v = x.recent[i]; return <i key={i} className="h-2 w-2 rotate-45" style={{ background: v == null ? 'rgba(18,26,46,0.1)' : v ? '#12b482' : '#f0326a' }} /> })}
                            </span>
                            <span className="w-12 shrink-0 text-right font-head text-xs tabular-nums text-ink-muted">{x.correct}/{x.attempts}</span>
                            {x.poolN > 0 && x.status !== 'mastered'
                              ? <button onClick={() => start([x], `題型：${x.name}`)} className="t-blue leaf-sm shrink-0 px-2.5 py-1 text-xs font-bold text-white" style={{ background: 'var(--tile)' }}>練</button>
                              : <span className="w-[34px] shrink-0" />}
                          </li>
                        ))}
                      </ul>
                      {todo.length > 0 && <button className="btn-primary mt-2 w-full" onClick={() => start(todo, `${u.code} ${u.title}`)}>練這單元沒熟練的 {todo.length} 個題型</button>}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
          <p className="text-[11px] text-ink-muted">題型：OLE-QS 題庫（{cat.bookName}）· 熟練＝答對 4 題以上且最近 5 題對 80%</p>
        </>
      )}
    </>
  )
}

// ── 還沒有題庫的科目：知識點分類（AI 出題） ──────────────────────
function KPStatus({ subject }: { subject: string }) {
  const [mastery, setMastery] = useState<Record<string, KPMastery>>({})
  const [open, setOpen] = useState<string | null>(null)
  useEffect(() => { setMastery(getMasteryMap()) }, [])
  const chapters = getChapters(subject).map(ch => {
    const kps = getKnowledgePoints(subject, ch).map(kp => {
      const m = mastery[`${subject}|${ch}|${kp}`]
      const status: TypeStatus = !m || !m.attempts ? 'untouched' : masteryLevel(m.score).tone === 'good' ? 'mastered' : 'learning'
      return { kp, m, status }
    })
    return { ch, kps }
  })
  const all = chapters.flatMap(c => c.kps)
  if (!all.length) return <p className="text-sm text-ink-muted">這一科的知識點分類還在整理</p>
  const counts = { untouched: 0, learning: 0, mastered: 0, stale: 0 } as Record<TypeStatus, number>
  for (const k of all) counts[k.status]++
  return (
    <>
      <div className="grid grid-cols-3 gap-2">
        <Num label="已掌握知識點" value={<>{counts.mastered}<small className="text-sm text-ink-muted"> / {all.length}</small></>} />
        <Num label="還沒練" value={counts.untouched} tone="text-[#c2185b]" />
        <Num label="練習中" value={counts.learning} />
      </div>
      <StackBar counts={counts} total={all.length} className="h-3" />
      <div className="space-y-2">
        {chapters.map(c => {
          const n = { untouched: 0, learning: 0, mastered: 0, stale: 0 } as Record<TypeStatus, number>
          for (const k of c.kps) n[k.status]++
          const isOpen = open === c.ch
          return (
            <div key={c.ch} className="leaf border border-line bg-white">
              <button onClick={() => setOpen(isOpen ? null : c.ch)} aria-expanded={isOpen} className="w-full px-3 pb-2.5 pt-3 text-left">
                <div className="flex items-baseline gap-2">
                  <span className="min-w-0 flex-1 truncate font-bold">{c.ch}</span>
                  <span className="shrink-0 text-xs text-ink-muted">掌握 <b className="font-head text-sm text-ink">{n.mastered}</b>/{c.kps.length}{n.untouched > 0 && <> · 沒練 <b className="font-head text-sm text-[#c2185b]">{n.untouched}</b></>}</span>
                  <span className="shrink-0 text-xs text-ink-muted">{isOpen ? '▴' : '▾'}</span>
                </div>
                <StackBar counts={n} total={c.kps.length} className="mt-2 h-2" />
              </button>
              {isOpen && (
                <div className="flex flex-wrap gap-1.5 border-t border-line px-3 pb-3 pt-2">
                  {c.kps.map(k => <span key={k.kp} className={`chip ${ST[k.status].chip}`}>{k.kp}{k.m?.attempts ? <b className="ml-1 font-head">{Math.round(k.m.score)}</b> : null}</span>)}
                  <Link href="/practice/new" className="chip border-transparent bg-ink text-white">去練習 →</Link>
                </div>
              )}
            </div>
          )
        })}
      </div>
      <p className="text-[11px] text-ink-muted">這一科還沒有題庫題型，先依知識點分類、由 AI 出題</p>
    </>
  )
}

function Num({ label, value, grad, tone }: { label: string; value: React.ReactNode; grad?: boolean; tone?: string }) {
  return (
    <div className="leaf border border-line bg-white px-3 py-2">
      <div className="text-[11px] text-ink-muted">{label}</div>
      <div className={`font-head text-2xl font-bold leading-tight tabular-nums ${grad ? 'grad-text' : tone ?? ''}`}>{value}</div>
    </div>
  )
}

function StackBar({ counts, total, className = '' }: { counts: Record<TypeStatus, number>; total: number; className?: string }) {
  return (
    <div className={`flex gap-0.5 overflow-hidden ${className}`} role="img" aria-label={ORDER.map(s => `${STATUS_LABEL[s]} ${counts[s]}`).join('、')}>
      {total === 0 ? <div className="flex-1" style={{ background: ST.untouched.bar }} /> : ORDER.filter(s => counts[s] > 0).map(s => (
        <div key={s} className="sweep" style={{ flex: counts[s], background: ST[s].bar }} />
      ))}
    </div>
  )
}

function Legend() {
  return (
    <div className="flex flex-wrap gap-3 text-[11px] text-ink-muted">
      {ORDER.map(s => <span key={s} className="flex items-center gap-1"><i className="h-2.5 w-2.5" style={{ background: ST[s].bar }} />{STATUS_LABEL[s]}</span>)}
    </div>
  )
}
