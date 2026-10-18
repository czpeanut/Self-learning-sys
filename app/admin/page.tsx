'use client'

// 館方管理後台：建立／批次建立學生帳號、重設密碼、停用、刪除，看每位學生近 7 天練習量
// （管理員用 Google 登入，白名單 NEXT_PUBLIC_ADMIN_EMAILS 或 staff 表；權限在 /api/admin/* 伺服器端再驗）

import { useCallback, useEffect, useState } from 'react'
import { doLogout } from '@/components/LoginGate'
import { currentUser } from '@/lib/accounts'
import { CLOUD, MIN_PASSWORD, isValidUsername } from '@/lib/auth-shared'
import { authFetch } from '@/lib/supabase'

type Row = {
  id: string; username: string; display_name: string; grade: string | null; disabled: boolean; created_at: string
  last_active: string | null; week_answered: number; week_days: number
}
type Created = { username: string; display_name: string; password: string; ok: boolean; error?: string }

const genPassword = () => String(Math.floor(100000 + Math.random() * 900000))

async function api(method: string, body?: unknown, query = ''): Promise<Record<string, unknown>> {
  const res = await authFetch(`/api/admin/students${query}`, {
    method, headers: body ? { 'Content-Type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined,
  })
  const d = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error((d as { error?: string }).error ?? `HTTP ${res.status}`)
  return d
}

export default function AdminPage() {
  if (!CLOUD) {
    return (
      <div className="card mx-auto max-w-xl p-6 text-sm leading-relaxed">
        <h1 className="text-lg font-bold">館方管理後台</h1>
        <p className="mt-2">目前沒有設定雲端帳號（Supabase），系統使用「裝置帳號」：學生在平板上自己用姓名＋4 位數密碼建立帳號，紀錄只存在那台裝置。</p>
        <p className="mt-2">要讓學生用館方發的帳號登入、紀錄存雲端、換裝置也看得到，請依 <code>docs/AUTH.md</code> 設定 Supabase。</p>
      </div>
    )
  }
  return <AdminConsole />
}

function AdminConsole() {
  const [rows, setRows] = useState<Row[] | null>(null)
  const [err, setErr] = useState('')
  const [created, setCreated] = useState<Created[]>([])
  const [q, setQ] = useState('')

  const load = useCallback(async () => {
    try { setRows((await api('GET')).students as Row[]); setErr('') } catch (e) { setErr(e instanceof Error ? e.message : String(e)) }
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
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">館方管理後台</h1>
          <div className="text-sm text-ink-soft">{currentUser()?.name} · 學生帳號管理</div>
        </div>
        <button className="btn-outline" onClick={doLogout}>登出</button>
      </div>
      {err && <div className="rounded-xl bg-red-50 px-4 py-2 text-sm text-red-700">{err}</div>}

      <div className="grid gap-4 md:grid-cols-2">
        <SingleForm onCreate={create} />
        <BatchForm onCreate={create} />
      </div>

      {created.length > 0 && (
        <section className="card border border-brand-500/30 p-5">
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-semibold">剛建立的帳號（密碼只顯示這一次，請抄給學生）</h2>
            <button className="btn-ghost py-1 text-sm" onClick={() => {
              const text = created.filter(c => c.ok).map(c => `${c.display_name}\t帳號 ${c.username}\t密碼 ${c.password}`).join('\n')
              void navigator.clipboard?.writeText(text)
            }}>複製全部</button>
          </div>
          <table className="mt-2 w-full text-sm">
            <tbody>
              {created.map(c => (
                <tr key={c.username} className="border-t border-black/5">
                  <td className="py-1.5">{c.display_name}</td>
                  <td className="font-mono">{c.username}</td>
                  <td className="font-mono">{c.ok ? c.password : ''}</td>
                  <td className={c.ok ? 'text-green-700' : 'text-red-600'}>{c.ok ? '✓ 已建立' : c.error}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <button className="mt-2 text-xs text-ink-muted underline" onClick={() => setCreated([])}>關閉</button>
        </section>
      )}

      <section className="card p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold">學生帳號（{rows?.length ?? '…'}）</h2>
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="搜尋帳號或姓名" className="rounded-lg border border-black/10 px-3 py-1 text-sm" />
        </div>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="text-left text-xs text-ink-muted">
              <tr><th className="py-1 font-normal">帳號</th><th className="font-normal">姓名</th><th className="font-normal">年級</th><th className="font-normal">近 7 天</th><th className="font-normal">最後練習</th><th className="font-normal">狀態</th><th /></tr>
            </thead>
            <tbody>
              {shown.map(r => <StudentRow key={r.id} r={r} onChanged={load} onError={setErr} />)}
            </tbody>
          </table>
          {rows && rows.length === 0 && <div className="py-6 text-center text-sm text-ink-muted">還沒有學生帳號</div>}
        </div>
      </section>
    </div>
  )
}

function StudentRow({ r, onChanged, onError }: { r: Row; onChanged: () => void; onError: (e: string) => void }) {
  const act = async (fn: () => Promise<unknown>) => { try { await fn(); onChanged() } catch (e) { onError(e instanceof Error ? e.message : String(e)) } }
  return (
    <tr className={`border-t border-black/5 ${r.disabled ? 'text-ink-muted' : ''}`}>
      <td className="py-2 font-mono">{r.username}</td>
      <td>{r.display_name}</td>
      <td>{r.grade ?? '—'}</td>
      <td className="tabular-nums">{r.week_answered} 題 · {r.week_days} 天</td>
      <td>{r.last_active ?? '—'}</td>
      <td>{r.disabled ? '停用' : '使用中'}</td>
      <td className="whitespace-nowrap text-right text-xs">
        <button className="text-brand-600 hover:underline" onClick={() => {
          const pw = prompt(`為 ${r.display_name}（${r.username}）設定新密碼（至少 ${MIN_PASSWORD} 碼）`, genPassword())
          if (pw) void act(async () => { await api('PATCH', { id: r.id, password: pw }); alert(`已重設，新密碼：${pw}`) })
        }}>重設密碼</button>
        <button className="ml-3 text-ink-soft hover:underline" onClick={() => void act(() => api('PATCH', { id: r.id, disabled: !r.disabled }))}>{r.disabled ? '啟用' : '停用'}</button>
        <button className="ml-3 text-red-600 hover:underline" onClick={() => {
          if (prompt(`刪除後連同雲端學習紀錄都無法復原。請輸入帳號「${r.username}」確認刪除`) === r.username) void act(() => api('DELETE', undefined, `?id=${r.id}`))
        }}>刪除</button>
      </td>
    </tr>
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
    catch (e) { setErr(e instanceof Error ? e.message : String(e)) }
    setBusy(false)
  }
  const input = (k: keyof typeof f, label: string, ph = '') => (
    <label className="block"><span className="label">{label}</span>
      <input value={f[k]} onChange={e => setF({ ...f, [k]: e.target.value })} placeholder={ph} autoCapitalize="none"
        className="mt-1 w-full rounded-xl border border-black/10 px-3 py-1.5 outline-none focus:border-brand-500" /></label>
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
  const submit = async () => {
    const list = text.split('\n').map(l => l.trim()).filter(Boolean).map(l => {
      const [username = '', display_name = '', grade = '', password = ''] = l.split(/[,，\t]/).map(s => s.trim())
      return { username: username.toLowerCase(), display_name: display_name || username, grade, password: password || genPassword() }
    })
    if (!list.length) return
    setBusy(true); setErr('')
    try { await onCreate(list); setText('') } catch (e) { setErr(e instanceof Error ? e.message : String(e)) }
    setBusy(false)
  }
  return (
    <section className="card space-y-3 p-5">
      <h2 className="font-semibold">批次建立</h2>
      <p className="text-xs text-ink-muted">一行一位：帳號,姓名,年級,密碼（密碼可省略，系統自動產生 6 位數）。可直接從試算表貼上。</p>
      <textarea value={text} onChange={e => setText(e.target.value)} rows={5} placeholder={'s2026001,王小明,七年級\ns2026002,李小華,八年級,135790'}
        className="w-full rounded-xl border border-black/10 px-3 py-2 font-mono text-sm outline-none focus:border-brand-500" />
      {err && <div className="text-sm text-red-600">{err}</div>}
      <button className="btn-primary w-full" disabled={busy || !text.trim()} onClick={submit}>建立 {text.split('\n').filter(l => l.trim()).length || ''} 個帳號</button>
    </section>
  )
}
