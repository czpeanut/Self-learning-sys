'use client'

// 程度檢測：出卷（選冊別、單元、題數）→ 派發給學生 → 看成績、百分等級、各單元答對率、匯出、讓學生重考
import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { BOOK_NAME } from '@/lib/exam'
import type { TestQuestion, TestResult } from '@/lib/placement'
import type { PoolCatalog } from '@/lib/readiness'
import { adminApi, downloadCSV, errMsg } from './api'
import type { StudentRow } from './Students'

type TestItem = { id: string; title: string; book: string; units: string[]; time_limit_min: number; created_at: string; assigned: number; submitted: number; avg: number | null }
type Assignment = { id: string; student_id: string; name: string; username: string; status: string; due_date: string | null; started_at: string | null; submitted_at: string | null; score: number | null; result: TestResult | null; percentile: number | null }
type Detail = { test: { id: string; title: string; book: string; units: string[]; questions: TestQuestion[]; time_limit_min: number }; assignments: Assignment[] }

const STATUS = { assigned: '未開始', started: '作答中', submitted: '已交卷' } as Record<string, string>

export default function Tests() {
  const [tests, setTests] = useState<TestItem[] | null>(null)
  const [sel, setSel] = useState<string | null>(null)
  const [err, setErr] = useState('')
  const load = useCallback(async () => {
    try { setTests((await adminApi<{ tests: TestItem[] }>('/api/admin/tests')).tests); setErr('') } catch (e) { setErr(errMsg(e)) }
  }, [])
  useEffect(() => { void load() }, [load])

  return (
    <div className="space-y-5">
      {err && <div className="leaf-sm bg-red-50 px-4 py-2 text-sm text-red-700">{err}</div>}
      <CreateTest onCreated={id => { void load(); setSel(id) }} onError={setErr} />
      <section className="card p-5">
        <h2 className="font-semibold">檢測卷（{tests?.length ?? '…'}）</h2>
        <div className="mt-2 divide-y divide-black/5">
          {(tests ?? []).map(t => (
            <button key={t.id} onClick={() => setSel(sel === t.id ? null : t.id)} className={`flex w-full flex-wrap items-center justify-between gap-2 py-2.5 text-left text-sm hover:bg-black/[.02] ${sel === t.id ? 'bg-brand-50/60' : ''}`}>
              <div>
                <div className="font-medium">{t.title}</div>
                <div className="text-xs text-ink-muted">{BOOK_NAME[t.book]} · 單元 {t.units.join('、')} · {t.time_limit_min} 分鐘 · {t.created_at.slice(0, 10)}</div>
              </div>
              <div className="tabular-nums text-ink-soft">交卷 {t.submitted}/{t.assigned}{t.avg != null && ` · 平均 ${t.avg} 分`}</div>
            </button>
          ))}
          {tests?.length === 0 && <div className="py-4 text-sm text-ink-muted">還沒有檢測卷，先在上面出一份</div>}
        </div>
      </section>
      {sel && <TestDetail id={sel} onChanged={load} onError={setErr} onDeleted={() => { setSel(null); void load() }} />}
    </div>
  )
}

function CreateTest({ onCreated, onError }: { onCreated: (id: string) => void; onError: (e: string) => void }) {
  const [book, setBook] = useState('7-1')
  const [cat, setCat] = useState<PoolCatalog | null>(null)
  const [units, setUnits] = useState<string[]>([])
  const [count, setCount] = useState(20)
  const [mins, setMins] = useState(40)
  const [title, setTitle] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    setCat(null); setUnits([])
    fetch(`/api/exam/catalog?subject=${encodeURIComponent('數學')}&book=${book}`).then(r => (r.ok ? r.json() : null)).then(setCat).catch(() => setCat(null))
  }, [book])
  const create = async () => {
    setBusy(true)
    try {
      const d = await adminApi<{ id: string }>('/api/admin/tests', 'POST', { action: 'create', book, units, count, time_limit_min: mins, title })
      setTitle(''); onCreated(d.id)
    } catch (e) { onError(errMsg(e)) }
    setBusy(false)
  }
  return (
    <section className="card space-y-3 p-5">
      <div>
        <h2 className="font-semibold">出一份程度檢測</h2>
        <p className="text-xs text-ink-muted">題目：OLE-QS 段考真題（數學）· 依段考頻率配題 · 難度 3:4:3</p>
      </div>
      <div className="flex flex-wrap items-end gap-3 text-sm">
        <label><span className="label">冊別</span><br />
          <select value={book} onChange={e => setBook(e.target.value)} className="leaf-sm border border-black/10 px-2 py-1">
            {Object.entries(BOOK_NAME).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select></label>
        <label><span className="label">題數</span><br /><input type="number" min={5} max={50} value={count} onChange={e => setCount(Number(e.target.value))} className="w-20 leaf-sm border border-black/10 px-2 py-1" /></label>
        <label><span className="label">作答時間（分鐘）</span><br /><input type="number" min={5} max={180} value={mins} onChange={e => setMins(Number(e.target.value))} className="w-20 leaf-sm border border-black/10 px-2 py-1" /></label>
        <label className="flex-1"><span className="label">名稱（選填）</span><br /><input value={title} onChange={e => setTitle(e.target.value)} placeholder="例：七上第一次段考前程度檢測" className="w-full leaf-sm border border-black/10 px-2 py-1" /></label>
      </div>
      <div>
        <div className="label mb-1">單元</div>
        {!cat ? <div className="text-sm text-ink-muted">載入題目池…（沒有出現的話，這一冊還沒有題目池）</div> : (
          <div className="flex flex-wrap gap-1.5">
            {cat.units.map(u => {
              const on = units.includes(u.code)
              return <button key={u.code} onClick={() => setUnits(on ? units.filter(x => x !== u.code) : [...units, u.code])}
                className={`leaf-sm px-2.5 py-1 text-sm ${on ? 'bg-brand-500 text-white' : 'bg-black/5'}`}>{u.code} {u.title}</button>
            })}
          </div>
        )}
      </div>
      <button className="btn-primary" disabled={busy || units.length === 0} onClick={create}>{busy ? '出卷中…' : `出卷（${units.length} 個單元、${count} 題）`}</button>
    </section>
  )
}

function TestDetail({ id, onChanged, onError, onDeleted }: { id: string; onChanged: () => void; onError: (e: string) => void; onDeleted: () => void }) {
  const [d, setD] = useState<Detail | null>(null)
  const [students, setStudents] = useState<StudentRow[]>([])
  const [pick, setPick] = useState<Set<string>>(new Set())
  const [due, setDue] = useState('')
  const [grade, setGrade] = useState('全部')
  const [showQ, setShowQ] = useState(false)
  const load = useCallback(async () => {
    try {
      setD(await adminApi<Detail>(`/api/admin/tests?id=${id}`))
      setStudents(((await adminApi('/api/admin/students')).students as StudentRow[]).filter(s => !s.disabled))
    } catch (e) { onError(errMsg(e)) }
  }, [id, onError])
  useEffect(() => { void load(); setPick(new Set()) }, [load])
  if (!d) return null

  const assigned = new Set(d.assignments.map(a => a.student_id))
  const grades = ['全部', ...Array.from(new Set(students.map(s => s.grade ?? '未填')))]
  const candidates = students.filter(s => !assigned.has(s.id) && (grade === '全部' || (s.grade ?? '未填') === grade))
  const done = d.assignments.filter(a => a.status === 'submitted')
  // 各單元平均答對率
  const unitAvg = new Map<string, { name: string; c: number; t: number }>()
  for (const a of done) for (const u of a.result?.byUnit ?? []) {
    const x = unitAvg.get(u.key) ?? { name: u.name, c: 0, t: 0 }
    x.c += u.correct; x.t += u.total; unitAvg.set(u.key, x)
  }
  const act = async (fn: () => Promise<unknown>) => { try { await fn(); await load(); onChanged() } catch (e) { onError(errMsg(e)) } }
  const exportCSV = () => downloadCSV([
    ['姓名', '帳號', '狀態', '分數', '等級', '答對', '題數', '百分等級', '交卷時間', ...Array.from(unitAvg.values()).map(u => `${u.name} 答對率`)],
    ...d.assignments.map(a => [a.name, a.username, STATUS[a.status], a.score, a.result?.level.label, a.result?.correct, a.result?.total, a.percentile, a.submitted_at?.slice(0, 16).replace('T', ' '),
      ...Array.from(unitAvg.keys()).map(k => { const u = a.result?.byUnit.find(x => x.key === k); return u ? `${Math.round(u.pct * 100)}%` : '' })]),
  ], `${d.test.title}.csv`)

  return (
    <section className="card space-y-4 p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold">{d.test.title}</h2>
          <div className="text-sm text-ink-soft">{d.test.questions.length} 題 · {d.test.time_limit_min} 分鐘 · 交卷 {done.length}/{d.assignments.length}{done.length > 0 && ` · 平均 ${Math.round(done.reduce((s, a) => s + (a.score ?? 0), 0) / done.length * 10) / 10} 分`}</div>
        </div>
        <div className="flex gap-2 text-sm">
          <button className="btn-outline py-1" onClick={() => setShowQ(!showQ)}>{showQ ? '收起題目' : '看題目與答案'}</button>
          <button className="btn-outline py-1" disabled={!d.assignments.length} onClick={exportCSV}>匯出成績 CSV</button>
          <button className="btn-ghost py-1 text-red-600" onClick={() => { if (confirm('刪除這份檢測（含所有學生的作答）？')) void adminApi('/api/admin/tests', 'POST', { action: 'delete', id }).then(onDeleted).catch(e => onError(errMsg(e))) }}>刪除</button>
        </div>
      </div>

      {showQ && (
        <ol className="list-decimal space-y-1 leaf-sm bg-black/[.03] p-3 pl-8 text-sm">
          {d.test.questions.map(q => <li key={q.id}><span className="text-xs text-ink-muted">[{q.unit} {q.typeName} · {'基標進'[q.difficulty - 1]}]</span> {q.stem.slice(0, 80)}{q.stem.length > 80 && '…'} <b>答案 ({'ABCDE'[q.answer]})</b> <span className="text-xs text-ink-muted">{q.id}</span></li>)}
        </ol>
      )}

      <div className="leaf-sm border border-black/5 p-3">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <b>派發給學生</b>
          <select value={grade} onChange={e => setGrade(e.target.value)} className="leaf-sm border border-black/10 px-2 py-0.5">{grades.map(g => <option key={g}>{g}</option>)}</select>
          <button className="text-brand-600 hover:underline" onClick={() => setPick(new Set(candidates.map(s => s.id)))}>全選</button>
          <label className="ml-auto">期限 <input type="date" value={due} onChange={e => setDue(e.target.value)} className="leaf-sm border border-black/10 px-2 py-0.5" /></label>
          <button className="btn-primary py-1" disabled={pick.size === 0} onClick={() => void act(async () => { await adminApi('/api/admin/tests', 'POST', { action: 'assign', test_id: id, student_ids: Array.from(pick), due_date: due || undefined }); setPick(new Set()) })}>派發（{pick.size}）</button>
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {candidates.map(s => {
            const on = pick.has(s.id)
            return <button key={s.id} onClick={() => { const n = new Set(pick); if (on) n.delete(s.id); else n.add(s.id); setPick(n) }}
              className={`leaf-sm px-2.5 py-1 text-sm ${on ? 'bg-brand-500 text-white' : 'bg-black/5'}`}>{s.display_name}</button>
          })}
          {candidates.length === 0 && <span className="text-xs text-ink-muted">沒有可派發的學生（都派過了）</span>}
        </div>
      </div>

      {unitAvg.size > 0 && (
        <div className="text-sm">
          <b>各單元平均答對率</b>
          <div className="mt-1 grid gap-1 sm:grid-cols-2">
            {Array.from(unitAvg.values()).map(u => (
              <div key={u.name} className="flex items-center gap-2">
                <span className="w-40 truncate">{u.name}</span>
                <div className="h-2 flex-1 rounded-full bg-black/5"><div className="h-2 rounded-full" style={{ width: `${(u.c / u.t) * 100}%`, background: 'var(--viz-series-1)' }} /></div>
                <span className="w-10 text-right tabular-nums">{Math.round((u.c / u.t) * 100)}%</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="text-left text-xs text-ink-muted"><tr><th className="py-1 font-normal">學生</th><th className="font-normal">狀態</th><th className="font-normal">分數</th><th className="font-normal">等級</th><th className="font-normal">百分等級</th><th className="font-normal">需要加強</th><th /></tr></thead>
          <tbody>
            {d.assignments.sort((a, b) => (b.score ?? -1) - (a.score ?? -1)).map(a => (
              <tr key={a.id} className="border-t border-black/5">
                <td className="py-1.5">{a.name}</td>
                <td>{STATUS[a.status]}{a.due_date && a.status !== 'submitted' && <span className="ml-1 text-xs text-ink-muted">期限 {a.due_date}</span>}</td>
                <td className="tabular-nums">{a.score ?? '—'}</td>
                <td>{a.result ? `${a.result.level.code} ${a.result.level.label}` : '—'}</td>
                <td className="tabular-nums">{a.percentile != null ? `贏過 ${a.percentile}%` : '—'}</td>
                <td className="max-w-[240px] truncate text-xs">{a.result?.weaknesses.slice(0, 3).join('、')}</td>
                <td className="whitespace-nowrap text-right text-xs">
                  <Link className="text-brand-600 hover:underline" href={`/admin/report-card?student=${a.student_id}`} target="_blank">成績單</Link>
                  {a.status !== 'assigned' && <button className="ml-3 text-ink-soft hover:underline" onClick={() => { if (confirm(`讓 ${a.name} 重考（清除這次作答）？`)) void act(() => adminApi('/api/admin/tests', 'POST', { action: 'reset', id: a.id })) }}>重考</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
