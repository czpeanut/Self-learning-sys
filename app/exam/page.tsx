'use client'

// 段考衝刺：選段考（沒選就依日期推算、帶主流範圍）→ 列出範圍內所有題型 → 量化「這次段考還缺什麼」→ 針對缺口練習

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { AnswerTrail } from '@/components/Charts'
import { Empty, ProgressBar } from '@/components/ui'
import {
  BANK_SUBJECTS, BOOK_NAME, GRADE_NAME, MAINSTREAM_SHARE, PUBLISHERS, type ScopeUnit, bookOf, daysUntil, examCount, examLabel,
  inferExam, mainstreamUnits,
} from '@/lib/exam'
import { type PoolCatalog, type Readiness, STATUS_LABEL, type TypeRow, type TypeStatus, computeReadiness, readinessLevel } from '@/lib/readiness'
import { createExamSession } from '@/lib/session-client'
import { getAttempts, getExamTarget, getProfile, saveExamTarget } from '@/lib/storage'
import type { ExamTarget, KPRef } from '@/lib/types'
import { DEFAULT_SETTINGS } from '@/lib/types'

const SUBJECTS = ['數學', '國文', '英文', '理化', '生物', '地球科學', '歷史', '地理', '公民']
const GRADE_FROM_PROFILE: Record<string, number> = { 七年級: 7, 八年級: 8, 九年級: 9 }
const STATUS_TONE: Record<TypeStatus, string> = {
  untouched: 'bg-black/5 text-ink-muted', learning: 'bg-amber-50 text-amber-800', mastered: 'bg-green-50 text-green-800', stale: 'bg-sky-50 text-sky-800',
}
const STATUS_ICON: Record<TypeStatus, string> = { untouched: '○', learning: '◐', mastered: '●', stale: '↻' }

type Catalog = PoolCatalog & { source: string; total: number }
type Scope = { units: ScopeUnit[]; docs: number; basis: 'publisher' | 'all' | 'merged'; source: string }

/** 沒設定過 → 依日期推算＋主流範圍（單元等讀到統計後才填） */
function defaultTarget(): ExamTarget {
  const grade = GRADE_FROM_PROFILE[getProfile().grade] ?? 7
  const inf = inferExam(new Date(), grade)
  return { subject: '數學', grade, semester: inf.semester, seq: inf.seq, publisher: '翰林', units: [], auto: true }
}

export default function ExamPage() {
  const router = useRouter()
  const [target, setTarget] = useState<ExamTarget | null>(null)
  const [scope, setScope] = useState<Scope | null>(null)
  const [cat, setCat] = useState<Catalog | null>(null)
  const [loadErr, setLoadErr] = useState('')

  useEffect(() => { setTarget(getExamTarget() ?? defaultTarget()) }, [])

  // 段考統計（主流範圍）
  useEffect(() => {
    if (!target) return
    const q = new URLSearchParams({ subject: target.subject, grade: String(target.grade), semester: String(target.semester), seq: String(target.seq), publisher: target.publisher })
    setScope(null)
    fetch(`/api/exam/scope?${q}`).then(r => (r.ok ? r.json() : null)).then((d: Scope | null) => {
      setScope(d)
      // 自動模式：範圍跟著統計走
      if (d && target.auto) {
        const units = mainstreamUnits(d.units)
        if (units.join() !== target.units.join()) update({ ...target, units })
      }
    }).catch(() => setScope(null))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target?.subject, target?.grade, target?.semester, target?.seq, target?.publisher, target?.auto])

  // 題型目錄（目前只有數學）
  useEffect(() => {
    if (!target || !BANK_SUBJECTS.includes(target.subject)) { setCat(null); return }
    setLoadErr('')
    fetch(`/api/exam/catalog?subject=${encodeURIComponent(target.subject)}&book=${bookOf(target.grade, target.semester)}`)
      .then(async r => { if (!r.ok) throw new Error((await r.json()).error); return r.json() })
      .then(setCat).catch(e => { setCat(null); setLoadErr(String(e.message ?? e)) })
  }, [target?.subject, target?.grade, target?.semester])   // eslint-disable-line react-hooks/exhaustive-deps

  const update = useCallback((t: ExamTarget) => { saveExamTarget(t); setTarget(t) }, [])

  const readiness: Readiness | null = useMemo(() => {
    if (!target || !cat || target.units.length === 0) return null
    return computeReadiness({ cat, units: target.units, attempts: getAttempts(), daysLeft: daysUntil(target, new Date()) })
  }, [target, cat])

  if (!target) return null
  const inferred = inferExam(new Date(), target.grade)
  const isInferred = target.semester === inferred.semester && target.seq === inferred.seq
  const hasBank = BANK_SUBJECTS.includes(target.subject)

  const start = (rows: TypeRow[], goal: string) => {
    if (!cat || rows.length === 0) return
    const scopeRefs: KPRef[] = rows.map(r => ({
      subject: target.subject, chapter: `${BOOK_NAME[cat.book]} ${r.unit} ${r.unitTitle}`, kp: r.name,
      bank: { book: cat.book, unit: r.unit, type: r.type },
    }))
    const s = createExamSession(target, scopeRefs, { ...DEFAULT_SETTINGS, questionsPerRound: 10, maxRounds: 3 }, goal)
    router.push(`/practice/session?id=${s.id}`)
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold">段考衝刺</h1>
        <p className="mt-1 text-sm text-ink-soft">選範圍，看還缺哪些題型</p>
      </div>

      <TargetPicker target={target} scope={scope} inferredLabel={inferred.label} inferredReason={inferred.reason} isInferred={isInferred} onChange={update} />

      {!hasBank ? (
        <div className="card p-5 text-sm text-ink-soft">
          題型練習目前只有<b>數學</b>。{target.subject}請先用 <Link href="/practice/new" className="text-brand-600 underline">自選練習</Link>。
        </div>
      ) : loadErr ? (
        <div className="card p-5 text-sm text-red-600">{loadErr}</div>
      ) : !cat || !readiness ? (
        target.units.length === 0 ? <Empty>請先在上方勾選範圍內的單元</Empty> : <div className="card p-6 text-center text-sm text-ink-muted">載入題型中…</div>
      ) : (
        <>
          <ReadinessPanel r={readiness} target={target} onStart={start} />
          <TypeTable r={readiness} onPractice={rows => start(rows, `補強：${rows.map(x => x.name).join('、').slice(0, 30)}`)} />
          <p className="text-xs text-ink-muted">
            資料來源：OLE-QS 題庫（{cat.source}）· {cat.bookName} {cat.total.toLocaleString()} 題
          </p>
        </>
      )}
    </div>
  )
}

// ── 段考設定 ────────────────────────────────────────────────────
function TargetPicker({ target, scope, inferredLabel, inferredReason, isInferred, onChange }: {
  target: ExamTarget; scope: Scope | null; inferredLabel: string; inferredReason: string; isInferred: boolean; onChange: (t: ExamTarget) => void
}) {
  const [open, setOpen] = useState(target.units.length === 0)
  const set = (p: Partial<ExamTarget>) => onChange({ ...target, ...p })
  const exams: { semester: 1 | 2; seq: 1 | 2 | 3 }[] = []
  for (const semester of [1, 2] as const) for (let seq = 1; seq <= examCount(target.grade, semester); seq++) exams.push({ semester, seq: seq as 1 | 2 | 3 })
  const toggleUnit = (code: string) => {
    const units = target.units.includes(code) ? target.units.filter(u => u !== code) : [...target.units, code]
    set({ units, auto: false })
  }

  return (
    <section className="card p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-xs text-ink-muted">目標段考</div>
          <div className="text-lg font-bold">{GRADE_NAME[target.grade]} {target.subject} · {examLabel(target.grade, target.semester, target.seq)}</div>
          <div className="mt-0.5 text-xs text-ink-soft">
            {target.auto ? '🤖 系統依日期推算、主流範圍' : '✏️ 自己設定的範圍'} · {target.publisher}版 · 範圍 {target.units.length} 個單元
            {target.examDate && ` · 段考日 ${target.examDate}`}
          </div>
        </div>
        <button className="btn-outline py-1.5" onClick={() => setOpen(!open)}>{open ? '收起' : '修改範圍'}</button>
      </div>

      {open && (
        <div className="mt-4 space-y-4 border-t border-black/5 pt-4">
          <Row label="年級">
            {[7, 8, 9].map(g => <Chip key={g} on={target.grade === g} onClick={() => { const inf = inferExam(new Date(), g); set({ grade: g, semester: inf.semester, seq: inf.seq, auto: true }) }}>{GRADE_NAME[g]}</Chip>)}
          </Row>
          <Row label="科目">
            {SUBJECTS.map(s => <Chip key={s} on={target.subject === s} onClick={() => set({ subject: s, auto: true })}>{s}</Chip>)}
          </Row>
          <Row label="課本版本">
            {PUBLISHERS.map(p => <Chip key={p} on={target.publisher === p} onClick={() => set({ publisher: p })}>{p}</Chip>)}
            {['數學', '理化', '生物', '地球科學'].includes(target.subject) && <span className="text-xs text-ink-muted">（數學、自然各版本章節大致相同）</span>}
          </Row>
          <Row label="哪一次段考">
            {exams.map(e => (
              <Chip key={`${e.semester}-${e.seq}`} on={target.semester === e.semester && target.seq === e.seq}
                onClick={() => set({ semester: e.semester, seq: e.seq, auto: true })}>
                {BOOK_NAME[bookOf(target.grade, e.semester)]}第{e.seq}次
              </Chip>
            ))}
          </Row>
          <div className={`leaf-sm px-3 py-2 text-xs ${isInferred ? 'bg-brand-50 text-brand-700' : 'bg-black/[.03] text-ink-soft'}`}>
            📅 {inferredReason}{!isInferred && <> <button className="underline" onClick={() => { const inf = inferExam(new Date(), target.grade); set({ semester: inf.semester, seq: inf.seq, auto: true }) }}>改回{inferredLabel}</button></>}
          </div>
          <Row label="我的段考日期（選填，算每天題量用）">
            <input type="date" value={target.examDate ?? ''} onChange={e => set({ examDate: e.target.value || undefined })}
              className="leaf-sm border border-black/10 px-2 py-1 text-sm" />
          </Row>

          <div>
            <div className="mb-1.5 flex flex-wrap items-baseline justify-between gap-2">
              <span className="label">範圍內的單元</span>
              {scope && (
                <span className="text-xs text-ink-muted">
                  依 {scope.docs} 份真實段考卷{{ all: '（這個版本的卷太少，用全部版本）', merged: '（各版本合併統計）', publisher: `（${target.publisher}版）` }[scope.basis]}：條長＝有幾成學校這次會考
                  {!target.auto && <> · <button className="text-brand-600 underline" onClick={() => set({ auto: true, units: mainstreamUnits(scope.units) })}>改回主流範圍</button></>}
                </span>
              )}
            </div>
            {!scope ? <div className="text-sm text-ink-muted">沒有這次段考的統計資料</div> : (
              <div className="grid gap-1.5 sm:grid-cols-2">
                {scope.units.map(u => {
                  const on = target.units.includes(u.code)
                  return (
                    <button key={u.code} onClick={() => toggleUnit(u.code)}
                      className={`flex items-center gap-2 leaf-sm border px-3 py-2 text-left text-sm ${on ? 'border-brand-500 bg-brand-50' : 'border-black/10'}`}
                      title={`${Math.round(u.share * 100)}% 的段考卷考了這個單元`}>
                      <span>{on ? '☑' : '☐'}</span>
                      <span className="min-w-0 flex-1 truncate"><b>{u.code}</b> {u.title}</span>
                      <span className="flex w-20 shrink-0 items-center gap-1">
                        <span className="h-1.5 flex-1 rounded bg-black/5"><span className="block h-1.5 rounded" style={{ width: `${u.share * 100}%`, background: 'var(--viz-series-1)' }} /></span>
                        <span className="w-8 text-right text-xs tabular-nums text-ink-muted">{Math.round(u.share * 100)}%</span>
                      </span>
                    </button>
                  )
                })}
              </div>
            )}
            <p className="mt-1 text-xs text-ink-muted">預設：{Math.round(MAINSTREAM_SHARE * 100)}% 以上學校會考的單元</p>
          </div>
        </div>
      )}
    </section>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><div className="label mb-1.5">{label}</div><div className="flex flex-wrap items-center gap-1.5">{children}</div></div>
}
function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button onClick={onClick} className={`leaf-sm px-3 py-1 text-sm ${on ? 'bg-brand-500 text-white' : 'bg-black/5 text-ink-soft'}`}>{children}</button>
}

// ── 準備度＋缺口 ─────────────────────────────────────────────────
function ReadinessPanel({ r, target, onStart }: { r: Readiness; target: ExamTarget; onStart: (rows: TypeRow[], goal: string) => void }) {
  const lv = readinessLevel(r.readiness)
  const toneColor = { good: 'var(--viz-good)', mid: 'var(--viz-mid)', bad: 'var(--viz-bad)' }[lv.tone]
  const topGaps = r.gaps.slice(0, 6)
  const total = r.counts.untouched + r.counts.learning + r.counts.mastered + r.counts.stale
  return (
    <section className="grid gap-4 md:grid-cols-[280px_1fr]">
      <div className="card p-5">
        <div className="text-xs text-ink-muted">{examLabel(target.grade, target.semester, target.seq)}準備度</div>
        <div className="mt-1 flex items-baseline gap-2">
          <span className="text-5xl font-bold tabular-nums">{Math.round(r.readiness * 100)}</span><span className="text-xl">%</span>
          <span className="chip" style={{ background: 'rgba(0,0,0,.04)', color: toneColor }}>{lv.tone === 'good' ? '●' : lv.tone === 'mid' ? '◐' : '○'} {lv.label}</span>
        </div>
        <div className="mt-2 h-2.5 rounded-full bg-black/5"><div className="h-2.5 rounded-full" style={{ width: `${r.readiness * 100}%`, background: toneColor }} /></div>
        <p className="mt-3 text-sm leading-relaxed">
          真實段考中，這個範圍每份卷平均約 <b>{r.examLoad.toFixed(0)}</b> 題（含選擇、填充、計算）；其中約 <b className="text-red-600">{r.expectedLoss.toFixed(1)} 題</b>屬於你還沒把握的題型。
        </p>
        <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
          {(['mastered', 'learning', 'stale', 'untouched'] as TypeStatus[]).map(s => (
            <div key={s} className={`leaf-sm px-2 py-1.5 ${STATUS_TONE[s]}`}>{STATUS_ICON[s]} {STATUS_LABEL[s]} <b className="tabular-nums">{r.counts[s]}</b>/{total}</div>
          ))}
        </div>
      </div>

      <div className="card p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-semibold">最該先補</h2>
                  </div>
        {topGaps.length === 0 ? (
          <div className="mt-3"><Empty>都熟練了 🎉</Empty></div>
        ) : (
          <ol className="mt-3 space-y-2">
            {topGaps.map((g, i) => (
              <li key={`${g.unit}:${g.type}`} className="flex items-start gap-3 text-sm">
                <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-black/5 text-xs font-bold">{i + 1}</span>
                <div className="min-w-0 flex-1">
                  <div><b>{g.name}</b> <span className="text-xs text-ink-muted">{g.unit} {g.unitTitle}</span></div>
                  <div className="text-xs text-ink-soft">{g.reason} · 段考每份約 {g.weight.toFixed(1)} 題 · 至少再答對 {g.need} 題</div>
                </div>
                <span className={`chip shrink-0 ${STATUS_TONE[g.status]}`}>{STATUS_ICON[g.status]} {STATUS_LABEL[g.status]}</span>
              </li>
            ))}
          </ol>
        )}
        <div className="mt-4 grid gap-3 leaf-sm bg-black/[.03] p-3 text-sm sm:grid-cols-3">
          <div><div className="text-xs text-ink-muted">距離段考</div><b className="text-lg tabular-nums">{r.daysLeft}</b> 天</div>
          <div><div className="text-xs text-ink-muted">全部熟練至少還要答對</div><b className="text-lg tabular-nums">{r.needTotal}</b> 題</div>
          <div>
            <div className="text-xs text-ink-muted">建議每天練</div><b className="text-lg tabular-nums">{r.perDay}</b> 題
            <div className="mt-1 flex items-center gap-2 text-xs"><ProgressBar value={r.todayDone} max={Math.max(1, r.perDay)} className="flex-1" /><span className="tabular-nums">今天 {r.todayDone}</span></div>
          </div>
        </div>
        {topGaps.length > 0 && (
          <button className="btn-primary mt-4 w-full py-2.5" onClick={() => onStart(topGaps, '補強段考缺口')}>
            針對這 {topGaps.length} 個缺口開始練習
          </button>
        )}
      </div>
    </section>
  )
}

// ── 全部題型 ─────────────────────────────────────────────────────
function TypeTable({ r, onPractice }: { r: Readiness; onPractice: (rows: TypeRow[]) => void }) {
  const units = Array.from(new Set(r.rows.map(x => x.unit)))
  return (
    <section className="card p-5">
      <h2 className="font-semibold">範圍內所有題型（{r.rows.length}）</h2>
      <p className="text-xs text-ink-muted">段考每份＝每份段考平均出幾題</p>
      <div className="mt-3 space-y-5">
        {units.map(u => {
          const rows = r.rows.filter(x => x.unit === u)
          const counted = rows.filter(x => x.type !== 'OTHER')
          const mastered = counted.filter(x => x.status === 'mastered').length
          return (
            <div key={u}>
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <div className="font-medium">{u} {rows[0].unitTitle}</div>
                <div className="flex items-center gap-2 text-xs text-ink-muted">
                  已熟練 {mastered}/{counted.length}
                  <button className="btn-ghost px-2 py-1 text-xs" disabled={!counted.some(x => x.poolN > 0)} onClick={() => {
                    // 沒熟練的題型優先，最多 8 個
                    const can = counted.filter(x => x.poolN > 0)
                    onPractice([...can.filter(x => x.status !== 'mastered'), ...can.filter(x => x.status === 'mastered')].slice(0, 8))
                  }}>練這個單元</button>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[560px] text-sm">
                  <thead><tr className="text-left text-xs text-ink-muted">
                    <th className="py-1 font-normal">題型</th><th className="font-normal">段考每份</th><th className="font-normal">作答</th>
                    <th className="font-normal">最近 5 題</th><th className="font-normal">狀態</th><th />
                  </tr></thead>
                  <tbody>
                    {rows.map(x => (
                      <tr key={x.type} className="border-t border-black/5 align-top">
                        <td className="py-1.5 pr-2">
                          <details>
                            <summary className="cursor-pointer list-none">{x.name}{x.type === 'OTHER' && <span className="ml-1 text-xs text-ink-muted">（不計入準備度）</span>}</summary>
                            <div className="mt-1 max-w-md text-xs text-ink-soft">{x.desc}</div>
                          </details>
                        </td>
                        <td className="tabular-nums">{x.weight >= 0.1 ? `${x.weight.toFixed(1)} 題` : '—'}</td>
                        <td className="tabular-nums text-ink-soft">{x.attempts ? `${x.correct}/${x.attempts}` : '—'}</td>
                        <td>{x.recent.length ? <AnswerTrail history={x.recent} /> : <span className="text-ink-muted">—</span>}</td>
                        <td><span className={`chip ${STATUS_TONE[x.status]}`}>{STATUS_ICON[x.status]} {STATUS_LABEL[x.status]}</span></td>
                        <td className="text-right">
                          {x.poolN > 0 ? <button className="text-xs text-brand-600 hover:underline" onClick={() => onPractice([x])}>練這題型（{x.poolN}）</button>
                            : <span className="text-xs text-ink-muted">題庫暫無</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}
