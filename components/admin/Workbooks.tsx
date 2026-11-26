'use client'

// 紙本練功卷（後台）：產生教材 → 列印寄出 → 拍照閱卷 → 看診斷 → 下一輪
// 狀態總表每 30 秒更新，一眼看到每位學生在第幾輪、閱到哪、卡在哪些前置觀念

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import WorkbookScan from '@/components/WorkbookScan'
import { BOOK_NAME, examCount } from '@/lib/exam'
import type { PoolCatalog } from '@/lib/readiness'
import { type Diagnosis, type ItemResult, LETTERS, type Layout, STATUS_LABEL, type WorkbookItem, type WorkbookStatus, type WorkbookSummary } from '@/lib/workbook'
import { adminApi, errMsg } from './api'
import type { StudentRow } from './Students'

type Row = {
  id: string; code: string; student_id: string; name: string; username: string; grade: string | null; book: string; exam_seq: number; round: number
  status: WorkbookStatus; title: string; summary: WorkbookSummary; diagnosis: Diagnosis; created_at: string; sent_at: string | null; graded_at: string | null
}
type Detail = { id: string; code: string; title: string; name: string; status: WorkbookStatus; items: WorkbookItem[]; results: Record<string, ItemResult>; diagnosis: Diagnosis | null; layout: Layout | null; sent_at: string | null }

const ST_CLS: Record<WorkbookStatus, string> = {
  draft: 'bg-ink/[.06] text-ink-soft', sent: 'bg-sky-50 text-sky-800', grading: 'bg-amber-50 text-amber-800', graded: 'bg-brand-50 text-brand-700',
}

export default function Workbooks() {
  const [rows, setRows] = useState<Row[] | null>(null)
  const [sel, setSel] = useState<string | null>(null)
  const [err, setErr] = useState('')
  const [filter, setFilter] = useState<WorkbookStatus | 'all'>('all')
  const load = useCallback(async () => {
    try { setRows((await adminApi<{ workbooks: Row[] }>('/api/admin/workbooks')).workbooks); setErr('') } catch (e) { setErr(errMsg(e)) }
  }, [])
  useEffect(() => { void load(); const t = setInterval(() => void load(), 30000); return () => clearInterval(t) }, [load])

  // 每位學生、每次段考只列最新一輪
  const latest = new Map<string, Row & { rounds: number }>()
  for (const r of rows ?? []) {
    const k = `${r.student_id}|${r.book}|${r.exam_seq}`
    const cur = latest.get(k)
    if (!cur || r.round > cur.round) latest.set(k, { ...r, rounds: Math.max(r.round, cur?.rounds ?? 0) })
  }
  const list = Array.from(latest.values()).filter(r => filter === 'all' || r.status === filter)
  const count = (s: WorkbookStatus) => Array.from(latest.values()).filter(r => r.status === s).length

  return (
    <div className="space-y-5">
      {err && <div className="leaf-sm bg-red-50 px-4 py-2 text-sm text-red-700">{err}</div>}
      <Create onDone={() => void load()} onError={setErr} />

      <section className="card p-5">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="mr-2 font-semibold">學生狀態</h2>
          {(['all', 'draft', 'sent', 'grading', 'graded'] as const).map(s => (
            <button key={s} onClick={() => setFilter(s)} className={`chip py-1 ${filter === s ? 'border-transparent bg-ink text-white' : 'bg-white'}`}>
              {s === 'all' ? `全部 ${latest.size}` : `${STATUS_LABEL[s]} ${count(s)}`}
            </button>
          ))}
          <span className="ml-auto text-xs text-ink-muted">每 30 秒更新</span>
        </div>
        <div className="mt-3 overflow-x-auto">
          <table className="matrix min-w-[720px]">
            <thead><tr><th>學生</th><th>段考</th><th>輪</th><th>狀態</th><th className="w-[22%]">閱卷</th><th>答對</th><th>前置弱點</th></tr></thead>
            <tbody>
              {list.map(r => {
                const s = r.summary
                return (
                  <tr key={r.id} onClick={() => setSel(sel === r.id ? null : r.id)} className={`cursor-pointer ${sel === r.id ? 'is-top' : ''}`}>
                    <td><div className="font-medium">{r.name}</div><div className="text-xs text-ink-muted">{r.grade ?? ''}</div></td>
                    <td className="whitespace-nowrap">{BOOK_NAME[r.book]} 第 {r.exam_seq} 次</td>
                    <td className="font-head font-semibold">{r.round}</td>
                    <td><span className={`chip border-transparent ${ST_CLS[r.status]}`}>{STATUS_LABEL[r.status]}</span></td>
                    <td>
                      <div className="flex h-2 gap-px bg-ink/[.06]">
                        <div style={{ flex: s.correct, background: 'var(--viz-good)' }} />
                        <div style={{ flex: s.wrong + s.blank, background: 'var(--viz-bad)' }} />
                        <div style={{ flex: s.total - s.graded }} />
                      </div>
                      <div className="mt-0.5 text-[11px] text-ink-muted">{s.graded}/{s.total} 題</div>
                    </td>
                    <td className="font-head tabular-nums">{s.graded ? `${s.correct}/${s.graded}` : '—'}</td>
                    <td className="max-w-[240px]">
                      <div className="flex flex-wrap gap-1">{r.diagnosis.slice(0, 3).map(d => <span key={`${d.book}${d.unit}${d.type}`} className="chip bg-[#fff0f4] text-[#c2185b]" title={d.typeName}>{BOOK_NAME[d.book]} {d.unit}{d.count > 1 && ` ×${d.count}`}</span>)}</div>
                    </td>
                  </tr>
                )
              })}
              {rows && list.length === 0 && <tr><td colSpan={7} className="py-4 text-center text-ink-muted">沒有教材</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      {sel && <WorkbookDetail id={sel} onChanged={() => void load()} onError={setErr} onSelect={setSel} />}
    </div>
  )
}

// ── 產生教材 ──
function Create({ onDone, onError }: { onDone: () => void; onError: (e: string) => void }) {
  const [book, setBook] = useState('8-1')
  const [seq, setSeq] = useState(1)
  const [cat, setCat] = useState<PoolCatalog | null>(null)
  const [units, setUnits] = useState<string[]>([])
  const [students, setStudents] = useState<StudentRow[]>([])
  const [grade, setGrade] = useState('全部')
  const [pick, setPick] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [grade0, sem] = book.split('-').map(Number)

  useEffect(() => { adminApi<{ students: StudentRow[] }>('/api/admin/students').then(d => setStudents(d.students.filter(s => !s.disabled))).catch(e => onError(errMsg(e))) }, [onError])
  useEffect(() => {
    setCat(null); setUnits([])
    fetch(`/api/exam/catalog?subject=${encodeURIComponent('數學')}&book=${book}`).then(r => (r.ok ? r.json() : null)).then(setCat).catch(() => setCat(null))
  }, [book])
  useEffect(() => {
    // 預設勾選這次段考的主流範圍（OLE-QS 真實段考卷統計）
    const q = new URLSearchParams({ subject: '數學', grade: String(grade0), semester: String(sem), seq: String(seq), publisher: '翰林' })
    fetch(`/api/exam/scope?${q}`).then(r => (r.ok ? r.json() : null)).then((d: { units: { code: string; share: number }[] } | null) => {
      if (d) setUnits(d.units.filter(u => u.share >= 0.5).map(u => u.code))
    }).catch(() => {})
  }, [grade0, sem, seq])

  const grades = ['全部', ...Array.from(new Set(students.map(s => s.grade ?? '未填')))]
  const cand = students.filter(s => grade === '全部' || (s.grade ?? '未填') === grade)
  const create = async () => {
    setBusy(true); setMsg('')
    try {
      const d = await adminApi<{ results: { student_id: string; id?: string; count?: number; error?: string }[] }>('/api/admin/workbooks', 'POST', { action: 'create', book, exam_seq: seq, units, student_ids: Array.from(pick) })
      const ok = d.results.filter(r => r.id).length
      const bad = d.results.filter(r => r.error)
      setMsg(`產生 ${ok} 份${bad.length ? `；${bad.length} 位沒有產生（${bad[0].error}）` : ''}`)
      setPick(new Set()); onDone()
    } catch (e) { onError(errMsg(e)) }
    setBusy(false)
  }

  return (
    <section className="card space-y-3 p-5">
      <h2 className="font-semibold">產生紙本教材</h2>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <select value={book} onChange={e => setBook(e.target.value)} className="border border-line bg-white px-2 py-1.5">
          {Object.entries(BOOK_NAME).map(([k, v]) => <option key={k} value={k}>數學 {v}</option>)}
        </select>
        <select value={seq} onChange={e => setSeq(Number(e.target.value))} className="border border-line bg-white px-2 py-1.5">
          {Array.from({ length: examCount(grade0, sem) }, (_, i) => <option key={i} value={i + 1}>第 {i + 1} 次段考</option>)}
        </select>
        <span className="text-xs text-ink-muted">已經有這次段考的教材時，會接著出下一輪</span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {(cat?.units ?? []).map(u => {
          const on = units.includes(u.code)
          return <button key={u.code} onClick={() => setUnits(on ? units.filter(x => x !== u.code) : [...units, u.code])} className={`chip py-1 ${on ? 'border-brand-500 bg-brand-50 text-brand-700' : 'bg-white text-ink-soft'}`}>{on ? '☑' : '☐'} {u.code} {u.title}</button>
        })}
      </div>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span>學生</span>
        <select value={grade} onChange={e => setGrade(e.target.value)} className="border border-line bg-white px-2 py-1">{grades.map(g => <option key={g}>{g}</option>)}</select>
        <button className="text-xs text-brand-600" onClick={() => setPick(new Set(cand.map(s => s.id)))}>全選</button>
        <button className="text-xs text-ink-muted" onClick={() => setPick(new Set())}>清除</button>
      </div>
      <div className="flex max-h-40 flex-wrap gap-1.5 overflow-y-auto">
        {cand.map(s => {
          const on = pick.has(s.id)
          return <button key={s.id} onClick={() => { const n = new Set(pick); if (on) n.delete(s.id); else n.add(s.id); setPick(n) }} className={`chip py-1 ${on ? 'border-brand-500 bg-brand-50 text-brand-700' : 'bg-white'}`}>{s.display_name}</button>
        })}
      </div>
      <div className="flex items-center gap-3">
        <button className="btn-primary" disabled={busy || !units.length || !pick.size} onClick={() => void create()}>{busy ? '產生中…' : `產生 ${pick.size} 份`}</button>
        {msg && <span className="text-sm text-ink-soft">{msg}</span>}
      </div>
    </section>
  )
}

// ── 單份教材：列印、寄出、拍照閱卷、人工修正、下一輪 ──
function WorkbookDetail({ id, onChanged, onError, onSelect }: { id: string; onChanged: () => void; onError: (e: string) => void; onSelect: (id: string) => void }) {
  const [d, setD] = useState<Detail | null>(null)
  const load = useCallback(async () => {
    try { setD((await adminApi<{ workbook: Detail }>(`/api/admin/workbooks?id=${id}`)).workbook) } catch (e) { onError(errMsg(e)) }
  }, [id, onError])
  useEffect(() => { void load() }, [load])
  const act = async (body: Record<string, unknown>) => {
    try { const r = await adminApi<{ id?: string }>('/api/admin/workbooks', 'POST', { id, ...body }); await load(); onChanged(); return r } catch (e) { onError(errMsg(e)) }
  }
  if (!d) return <section className="card p-5 text-sm text-ink-muted">載入中…</section>

  const graded = Object.keys(d.results).length
  return (
    <section className="card space-y-4 p-5">
      <div className="flex flex-wrap items-center gap-2">
        <div className="mr-auto">
          <h2 className="font-semibold">{d.name} · {d.title}</h2>
          <div className="text-xs text-ink-muted">代碼 {d.code} · {d.items.length} 題 · 已閱 {graded} 題 · {STATUS_LABEL[d.status]}{!d.layout && ' · 還沒列印（列印後才能精準裁切閱卷）'}</div>
        </div>
        <Link href={`/admin/workbook/print?id=${d.id}`} target="_blank" className="btn-outline py-1.5">列印</Link>
        {!d.sent_at && <button className="btn-outline py-1.5" onClick={() => void act({ action: 'sent' })}>標記已寄出</button>}
        <button className="btn-primary py-1.5" disabled={d.status !== 'graded' && d.status !== 'grading'} onClick={() => void act({ action: 'next' }).then(r => { if (r?.id) onSelect(r.id) })}>產生下一輪</button>
        <button className="text-xs text-red-600" onClick={() => { if (confirm('刪除這份教材？')) void act({ action: 'delete' }).then(() => onSelect('')) }}>刪除</button>
      </div>

      <WorkbookScan id={d.id} loadLayout={async () => (await adminApi<{ workbook: Detail }>(`/api/admin/workbooks?id=${id}`)).workbook.layout} post={b => adminApi('/api/workbooks/scan', 'POST', b)} onDone={() => { void load(); onChanged() }} />

      {(d.diagnosis ?? []).length > 0 && (
        <div className="border border-line bg-paper/60 p-3 text-sm">
          <div className="font-semibold">前置觀念診斷（下一輪會補強）</div>
          <ul className="mt-1 space-y-0.5">
            {d.diagnosis!.map(x => <li key={`${x.book}${x.unit}${x.type}`}><b>{x.typeName}</b> <span className="text-ink-muted">← 第 {x.from.join('、')} 題{x.why && `：${x.why}`}</span></li>)}
          </ul>
        </div>
      )}

      <ul className="divide-y divide-line">
        {d.items.map(it => <ItemRow key={it.no} it={it} r={d.results[String(it.no)]} onGrade={result => void act({ action: 'grade', no: it.no, result })} />)}
      </ul>
    </section>
  )
}

function ItemRow({ it, r, onGrade }: { it: WorkbookItem; r?: ItemResult; onGrade: (r: Record<string, unknown>) => void }) {
  const chip = !r ? 'bg-ink/[.05] text-ink-muted' : r.status === 'correct' ? 'bg-brand-50 text-brand-700' : 'bg-[#fff0f4] text-[#c2185b]'
  return (
    <li className="space-y-1 py-2.5 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-head font-bold">{it.no}</span>
        {it.section === 'prereq' && <span className="chip bg-[#fff1e8] text-[#c2410c]">前置</span>}
        <span className="min-w-0 flex-1 truncate">{it.unit} · {it.typeName}</span>
        <span className={`chip border-transparent ${chip}`}>{!r ? '未閱' : r.status === 'correct' ? '✓ 對' : r.status === 'wrong' ? '✗ 錯' : '空白'}</span>
        <span className="text-xs text-ink-muted">正解 {LETTERS[it.answer]}{r?.chosen != null && ` · 作答 ${LETTERS[r.chosen]}`}</span>
        <span className="flex gap-0.5">
          {it.options.map((_, i) => <button key={i} onClick={() => onGrade({ chosen: i })} className={`h-6 w-6 border text-xs ${r?.chosen === i ? 'border-ink bg-ink text-white' : 'border-line bg-white'}`}>{LETTERS[i]}</button>)}
          <button onClick={() => onGrade({ status: 'blank' })} className="h-6 border border-line bg-white px-1 text-xs">空</button>
        </span>
      </div>
      {r && (r.steps.length > 0 || r.note) && (
        <div className="pl-6 text-xs text-ink-soft">
          {r.steps.map((s, i) => <span key={i} className="mr-3"><b className={s.ok === false ? 'text-[#c2185b]' : s.ok ? 'text-brand-700' : ''}>{i + 1}.{s.ok === false ? '✗' : s.ok ? '✓' : ''}</b> {s.text}</span>)}
          {r.note && <span className="font-medium text-ink">｜{r.note}</span>}
        </div>
      )}
      {r?.prereq.length ? <div className="pl-6 text-xs text-[#c2185b]">前置：{r.prereq.map(p => `${p.typeName}${p.why ? `（${p.why}）` : ''}`).join('、')}</div> : null}
    </li>
  )
}
