'use client'

// 學生與家長：建立／批次建立帳號、重設密碼、停用、刪除；家長聯絡人（LINE 綁定碼、Email、通知開關、測試通知）；成績單
import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { MIN_PASSWORD, isValidUsername } from '@/lib/auth-shared'
import { adminApi, errMsg } from './api'

export type Guardian = {
  id: string; student_id: string; name: string; relation: string | null; email: string | null; phone: string | null
  link_code: string | null; line_bound: boolean; notify_attendance: boolean; notify_reports: boolean
}
export type StudentRow = {
  id: string; username: string; display_name: string; grade: string | null; school: string | null; note: string | null; plan_id: string | null
  disabled: boolean; created_at: string; last_active: string | null; week_answered: number; week_days: number; guardians: Guardian[]
}
type Created = { username: string; display_name: string; grade: string; password: string; ok: boolean; error?: string }

const genPassword = () => String(Math.floor(100000 + Math.random() * 900000))
const api = (method: string, body?: unknown, query = '') => adminApi(`/api/admin/students${query}`, method, body)

export default function Students({ admin }: { admin: boolean }) {
  const [rows, setRows] = useState<StudentRow[] | null>(null)
  const [err, setErr] = useState('')
  const [created, setCreated] = useState<Created[]>([])
  const [q, setQ] = useState('')
  const [open, setOpen] = useState<string | null>(null)

  const load = useCallback(async () => {
    try { setRows((await api('GET')).students as StudentRow[]); setErr('') } catch (e) { setErr(errMsg(e)) }
  }, [])
  useEffect(() => { void load() }, [load])

  const create = async (list: Omit<Created, 'ok'>[]) => {
    const d = await api('POST', { students: list })
    const res = d.results as { username: string; ok: boolean; error?: string }[]
    setCreated(list.map((s, i) => ({ ...s, ok: res[i]?.ok ?? false, error: res[i]?.error })))
    await load()
  }
  const shown = (rows ?? []).filter(r => !q || r.username.includes(q.toLowerCase()) || r.display_name.includes(q))

  return (
    <div className="space-y-5">
      {err && <div className="leaf-sm bg-red-50 px-4 py-2 text-sm text-red-700">{err}</div>}
      {admin && (
        <div className="grid gap-4 md:grid-cols-2">
          <SingleForm onCreate={create} />
          <BatchForm onCreate={create} />
        </div>
      )}

      {created.length > 0 && (
        <section className="card border border-brand-500/30 p-5">
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-semibold">剛建立的帳號（密碼只顯示這一次，請抄給學生）</h2>
            <button className="btn-ghost py-1 text-sm" onClick={() => {
              void navigator.clipboard?.writeText(created.filter(c => c.ok).map(c => `${c.display_name}\t帳號 ${c.username}\t密碼 ${c.password}`).join('\n'))
            }}>複製全部</button>
          </div>
          <table className="mt-2 w-full text-sm"><tbody>
            {created.map(c => (
              <tr key={c.username} className="border-t border-black/5">
                <td className="py-1.5">{c.display_name}</td><td className="font-mono">{c.username}</td>
                <td className="font-mono">{c.ok ? c.password : ''}</td>
                <td className={c.ok ? 'text-green-700' : 'text-red-600'}>{c.ok ? '✓ 已建立' : c.error}</td>
              </tr>
            ))}
          </tbody></table>
          <button className="mt-2 text-xs text-ink-muted underline" onClick={() => setCreated([])}>關閉</button>
        </section>
      )}

      <section className="card p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold">學生（{rows?.length ?? '…'}）</h2>
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="搜尋帳號或姓名" className="leaf-sm border border-black/10 px-3 py-1 text-sm" />
        </div>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="text-left text-xs text-ink-muted">
              <tr><th className="py-1 font-normal">帳號</th><th className="font-normal">姓名</th><th className="font-normal">年級</th><th className="font-normal">近 7 天</th><th className="font-normal">最後練習</th><th className="font-normal">家長通知</th><th className="font-normal">狀態</th><th /></tr>
            </thead>
            <tbody>
              {shown.map(r => (
                <StudentRowView key={r.id} r={r} admin={admin} open={open === r.id} onToggle={() => setOpen(open === r.id ? null : r.id)} onChanged={load} onError={setErr} />
              ))}
            </tbody>
          </table>
          {rows && rows.length === 0 && <div className="py-6 text-center text-sm text-ink-muted">還沒有學生帳號</div>}
        </div>
      </section>
    </div>
  )
}

function StudentRowView({ r, admin, open, onToggle, onChanged, onError }: {
  r: StudentRow; admin: boolean; open: boolean; onToggle: () => void; onChanged: () => void; onError: (e: string) => void
}) {
  const act = async (fn: () => Promise<unknown>) => { try { await fn(); onChanged() } catch (e) { onError(errMsg(e)) } }
  const bound = r.guardians.filter(g => g.line_bound).length
  const emails = r.guardians.filter(g => g.email).length
  return (
    <>
      <tr className={`border-t border-black/5 ${r.disabled ? 'text-ink-muted' : ''}`}>
        <td className="py-2 font-mono">{r.username}</td>
        <td>{r.display_name}{r.school && <span className="ml-1 text-xs text-ink-muted">{r.school}</span>}</td>
        <td>{r.grade ?? '—'}</td>
        <td className="tabular-nums">{r.week_answered} 題 · {r.week_days} 天</td>
        <td>{r.last_active ?? '—'}</td>
        <td className="text-xs">{r.guardians.length === 0 ? <span className="text-amber-700">未設定</span> : `${r.guardians.length} 位 · LINE ${bound} · Email ${emails}`}</td>
        <td>{r.disabled ? '停用' : '使用中'}</td>
        <td className="whitespace-nowrap text-right text-xs">
          <button className="text-brand-600 hover:underline" onClick={onToggle}>{open ? '收起' : '家長／資料'}</button>
          <Link className="ml-3 text-brand-600 hover:underline" href={`/admin/report-card?student=${r.id}`} target="_blank">成績單</Link>
          {admin && <>
            <button className="ml-3 text-ink-soft hover:underline" onClick={() => {
              const pw = prompt(`為 ${r.display_name}（${r.username}）設定新密碼（至少 ${MIN_PASSWORD} 碼）`, genPassword())
              if (pw) void act(async () => { await api('PATCH', { id: r.id, password: pw }); alert(`已重設，新密碼：${pw}`) })
            }}>重設密碼</button>
            <button className="ml-3 text-ink-soft hover:underline" onClick={() => void act(() => api('PATCH', { id: r.id, disabled: !r.disabled }))}>{r.disabled ? '啟用' : '停用'}</button>
            <button className="ml-3 text-red-600 hover:underline" onClick={() => {
              if (prompt(`刪除後連同雲端學習紀錄、檢測與帳務都無法復原。請輸入帳號「${r.username}」確認刪除`) === r.username) void act(() => api('DELETE', undefined, `?id=${r.id}`))
            }}>刪除</button>
          </>}
        </td>
      </tr>
      {open && (
        <tr><td colSpan={8} className="bg-black/[.02] p-4">
          <StudentDetail r={r} onChanged={onChanged} onError={onError} />
        </td></tr>
      )}
    </>
  )
}

function StudentDetail({ r, onChanged, onError }: { r: StudentRow; onChanged: () => void; onError: (e: string) => void }) {
  const [info, setInfo] = useState({ display_name: r.display_name, grade: r.grade ?? '', school: r.school ?? '', note: r.note ?? '' })
  const save = async () => { try { await api('PATCH', { id: r.id, ...info }); onChanged() } catch (e) { onError(errMsg(e)) } }
  return (
    <div className="grid gap-4 lg:grid-cols-[260px_1fr]">
      <div className="space-y-2 text-sm">
        <div className="font-medium">學生資料</div>
        {(['display_name', 'grade', 'school'] as const).map(k => (
          <label key={k} className="block"><span className="label">{{ display_name: '姓名', grade: '年級', school: '學校' }[k]}</span>
            <input value={info[k]} onChange={e => setInfo({ ...info, [k]: e.target.value })} className="mt-0.5 w-full leaf-sm border border-black/10 px-2 py-1" /></label>
        ))}
        <label className="block"><span className="label">備註</span>
          <textarea value={info.note} onChange={e => setInfo({ ...info, note: e.target.value })} rows={2} className="mt-0.5 w-full leaf-sm border border-black/10 px-2 py-1" /></label>
        <button className="btn-outline py-1" onClick={save}>儲存</button>
      </div>
      <Guardians r={r} onChanged={onChanged} onError={onError} />
    </div>
  )
}

function Guardians({ r, onChanged, onError }: { r: StudentRow; onChanged: () => void; onError: (e: string) => void }) {
  const empty = { name: '', relation: '', email: '', phone: '' }
  const [f, setF] = useState(empty)
  const [msg, setMsg] = useState('')
  const g = (body: object) => adminApi('/api/admin/guardians', 'POST', body)
  const act = async (fn: () => Promise<unknown>) => { try { setMsg(''); await fn(); onChanged() } catch (e) { onError(errMsg(e)) } }
  return (
    <div className="space-y-2 text-sm">
      <div className="font-medium">家長聯絡人（到館／離館、檢測成績、繳費通知）</div>
      {r.guardians.map(x => (
        <div key={x.id} className="leaf-sm border border-black/5 bg-white p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div><b>{x.name}</b>{x.relation && <span className="ml-1 text-ink-muted">（{x.relation}）</span>}{x.phone && <span className="ml-2 text-xs text-ink-muted">{x.phone}</span>}</div>
            <div className="flex gap-3 text-xs">
              <button className="text-brand-600 hover:underline" onClick={() => void act(async () => {
                const d = await g({ action: 'test', id: x.id }) as { notified: { sent: number; failed: number; skipped: number } }
                const n = d.notified
                setMsg(n.sent + n.failed + n.skipped === 0 ? `${x.name} 還沒有可用的聯絡方式：請填 Email，或請家長用綁定碼綁定 LINE` : `${x.name}：已送出 ${n.sent}、失敗 ${n.failed}、略過 ${n.skipped}（略過＝這個管道還沒設定）`)
              })}>傳測試通知</button>
              <button className="text-red-600 hover:underline" onClick={() => { if (confirm(`刪除聯絡人 ${x.name}？`)) void act(() => g({ action: 'delete', id: x.id })) }}>刪除</button>
            </div>
          </div>
          <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs">
            <span>LINE：{x.line_bound ? <span className="text-green-700">✓ 已綁定</span> : x.link_code
              ? <>綁定碼 <b className="font-mono text-sm tracking-widest">{x.link_code}</b>（請家長加官方帳號好友後傳這 6 碼）</>
              : '未綁定'}
              <button className="ml-2 text-brand-600 hover:underline" onClick={() => void act(() => g({ action: 'code', id: x.id }))}>{x.line_bound ? '換綁定' : '重新產生'}</button>
            </span>
            <span>Email：{x.email ?? '—'}</span>
            <label><input type="checkbox" checked={x.notify_attendance} onChange={e => void act(() => g({ action: 'update', ...x, notify_attendance: e.target.checked }))} /> 到館／離館</label>
            <label><input type="checkbox" checked={x.notify_reports} onChange={e => void act(() => g({ action: 'update', ...x, notify_reports: e.target.checked }))} /> 成績與繳費</label>
          </div>
        </div>
      ))}
      {msg && <div className="text-xs text-brand-700">{msg}</div>}
      <div className="flex flex-wrap items-end gap-2">
        {(['name', 'relation', 'email', 'phone'] as const).map(k => (
          <label key={k} className="block"><span className="label">{{ name: '家長姓名', relation: '關係', email: 'Email（選填）', phone: '電話（選填）' }[k]}</span>
            <input value={f[k]} onChange={e => setF({ ...f, [k]: e.target.value })} placeholder={{ name: '王媽媽', relation: '母親', email: 'parent@example.com', phone: '0912…' }[k]}
              className={`mt-0.5 leaf-sm border border-black/10 px-2 py-1 ${k === 'email' ? 'w-48' : 'w-28'}`} /></label>
        ))}
        <button className="btn-primary py-1" disabled={!f.name.trim()} onClick={() => void act(async () => { await g({ action: 'create', student_id: r.id, ...f }); setF(empty) })}>新增家長</button>
      </div>
    </div>
  )
}

function SingleForm({ onCreate }: { onCreate: (l: Omit<Created, 'ok'>[]) => Promise<void> }) {
  const [f, setF] = useState({ username: '', display_name: '', grade: '', password: genPassword() })
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const submit = async () => {
    if (!isValidUsername(f.username)) { setErr('帳號限英數與 . _ -，3–30 碼'); return }
    if (f.password.length < MIN_PASSWORD) { setErr(`密碼至少 ${MIN_PASSWORD} 碼`); return }
    setBusy(true); setErr('')
    try { await onCreate([{ ...f, username: f.username.trim().toLowerCase(), display_name: f.display_name.trim() || f.username.trim() }]); setF({ username: '', display_name: '', grade: '', password: genPassword() }) }
    catch (e) { setErr(errMsg(e)) }
    setBusy(false)
  }
  const input = (k: keyof typeof f, label: string, ph = '') => (
    <label className="block"><span className="label">{label}</span>
      <input value={f[k]} onChange={e => setF({ ...f, [k]: e.target.value })} placeholder={ph} autoCapitalize="none"
        className="mt-1 w-full leaf-sm border border-black/10 px-3 py-1.5 outline-none focus:border-brand-500" /></label>
  )
  return (
    <section className="card space-y-3 p-5">
      <h2 className="font-semibold">新增一位學生</h2>
      <div className="grid grid-cols-2 gap-3">
        {input('username', '帳號', 's2026001')}
        {input('display_name', '姓名', '王小明')}
        {input('grade', '年級', '七年級')}
        {input('password', '密碼')}
      </div>
      {err && <div className="text-sm text-red-600">{err}</div>}
      <button className="btn-primary w-full" disabled={busy || !f.username} onClick={submit}>建立帳號</button>
    </section>
  )
}

function BatchForm({ onCreate }: { onCreate: (l: Omit<Created, 'ok'>[]) => Promise<void> }) {
  const [text, setText] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const lines = text.split('\n').filter(l => l.trim()).length
  const submit = async () => {
    const list = text.split('\n').map(l => l.trim()).filter(Boolean).map(l => {
      const [username = '', display_name = '', grade = '', password = ''] = l.split(/[,，\t]/).map(s => s.trim())
      return { username: username.toLowerCase(), display_name: display_name || username, grade, password: password || genPassword() }
    })
    if (!list.length) return
    setBusy(true); setErr('')
    try { await onCreate(list); setText('') } catch (e) { setErr(errMsg(e)) }
    setBusy(false)
  }
  return (
    <section className="card space-y-3 p-5">
      <h2 className="font-semibold">批次建立</h2>
      <p className="text-xs text-ink-muted">每行：帳號,姓名,年級,密碼（密碼可省略）</p>
      <textarea value={text} onChange={e => setText(e.target.value)} rows={5} placeholder={'s2026001,王小明,七年級\ns2026002,李小華,八年級,135790'}
        className="w-full leaf-sm border border-black/10 px-3 py-2 font-mono text-sm outline-none focus:border-brand-500" />
      {err && <div className="text-sm text-red-600">{err}</div>}
      <button className="btn-primary w-full" disabled={busy || !text.trim()} onClick={submit}>建立 {lines || ''} 個帳號</button>
    </section>
  )
}
