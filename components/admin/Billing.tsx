'use client'

// 收費帳務（只有管理員）：月報表、收費方案、開月費單、收款、繳費通知、其他收支、CSV 匯出
import { useCallback, useEffect, useState } from 'react'
import { Tile } from '@/components/ui'
import { EXPENSE_CATEGORIES, type Invoice, type LedgerEntry, METHOD_LABEL, type MonthReport, type PayMethod, type Payment, type Plan } from '@/lib/billing'
import { adminApi, download, errMsg, money } from './api'

type Data = {
  month: string; plans: Plan[]; ledger: LedgerEntry[]; payments: Payment[]; report: MonthReport
  students: { id: string; username: string; display_name: string; grade: string | null; plan_id: string | null; disabled: boolean }[]
  invoices: (Invoice & { balance: number; net: number })[]
}
const STATUS = { unpaid: '未繳', paid: '已繳', void: '作廢' }
const thisMonth = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Taipei' }).slice(0, 7)
const post = (body: object) => adminApi('/api/admin/billing', 'POST', body)

export default function Billing() {
  const [month, setMonth] = useState(thisMonth())
  const [d, setD] = useState<Data | null>(null)
  const [err, setErr] = useState('')
  const [msg, setMsg] = useState('')
  const load = useCallback(async () => {
    try { setD(await adminApi<Data>(`/api/admin/billing?month=${month}`)); setErr('') } catch (e) { setErr(errMsg(e)) }
  }, [month])
  useEffect(() => { void load() }, [load])
  const act = async (fn: () => Promise<unknown>, done?: string) => { try { setMsg(''); await fn(); await load(); if (done) setMsg(done) } catch (e) { setErr(errMsg(e)) } }
  if (!d) return err ? <div className="leaf-sm bg-red-50 px-4 py-2 text-sm text-red-700">{err}</div> : null

  const r = d.report
  const name = new Map(d.students.map(s => [s.id, s.display_name]))
  const missingPlan = d.students.filter(s => !s.disabled && !s.plan_id).length

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <input type="month" value={month} onChange={e => setMonth(e.target.value)} className="leaf-sm border border-black/10 px-2 py-1" />
        <div className="ml-auto flex flex-wrap gap-2 text-sm">
          {(['invoices', 'payments', 'ledger'] as const).map(k => (
            <button key={k} className="btn-outline py-1" onClick={() => void download(`/api/admin/billing?month=${month}&export=${k}`, `${k}-${month}.csv`).catch(e => setErr(errMsg(e)))}>
              匯出{{ invoices: '帳單', payments: '收款', ledger: '收支' }[k]}
            </button>
          ))}
        </div>
      </div>
      {err && <div className="leaf-sm bg-red-50 px-4 py-2 text-sm text-red-700">{err}</div>}
      {msg && <div className="leaf-sm bg-green-50 px-4 py-2 text-sm text-green-800">{msg}</div>}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Tile label={`${month} 應收`} value={money(r.billed)} sub="這個月份開出的帳單（扣折扣）" />
        <Tile label="本月實收" value={money(r.collected)} sub={Object.entries(r.byMethod).map(([m, v]) => `${METHOD_LABEL[m as PayMethod]} ${money(v)}`).join('、') || '—'} />
        <Tile label="目前未收（全部月份）" value={money(r.receivable)} sub={`${r.unpaidCount} 張未繳 · 逾期 ${r.overdue.length} 張`} />
        <Tile label="本月淨額" value={money(r.net)} sub={`實收＋其他收入 ${money(r.otherIncome)}－支出 ${money(r.expense)}`} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Plans plans={d.plans} act={act} />
        <section className="card space-y-3 p-5 text-sm">
          <h2 className="font-semibold">學生方案</h2>
          {missingPlan > 0 && <p className="text-xs text-amber-800">{missingPlan} 位學生還沒設定方案，開月費單時會跳過</p>}
          <div className="max-h-64 divide-y divide-black/5 overflow-y-auto">
            {d.students.filter(s => !s.disabled).map(s => (
              <div key={s.id} className="flex items-center justify-between py-1.5">
                <span>{s.display_name} <span className="text-xs text-ink-muted">{s.grade}</span></span>
                <select value={s.plan_id ?? ''} onChange={e => void act(() => post({ action: 'set-plan', student_id: s.id, plan_id: e.target.value || null }))} className="leaf-sm border border-black/10 px-2 py-0.5">
                  <option value="">（未設定）</option>
                  {d.plans.filter(p => p.active || p.id === s.plan_id).map(p => <option key={p.id} value={p.id}>{p.name} {money(p.price)}</option>)}
                </select>
              </div>
            ))}
          </div>
          <button className="btn-primary w-full" onClick={() => void act(async () => {
            const x = await post({ action: 'generate', period: month }) as { created: number }
            setMsg(`已開出 ${x.created} 張 ${month} 月費單（已開過的不會重複開）`)
          })}>開 {month} 月費單</button>
        </section>
      </div>

      <Invoices d={d} name={name} act={act} setMsg={setMsg} />

      {r.overdue.length > 0 && (
        <section className="card p-5 text-sm">
          <h2 className="font-semibold text-red-700">逾期未繳（{r.overdue.length}）</h2>
          <ul className="mt-2 divide-y divide-black/5">
            {r.overdue.map(o => <li key={o.invoice.id} className="flex justify-between py-1.5"><span>{name.get(o.invoice.student_id)} · {o.invoice.title}</span><span className="tabular-nums">{money(o.balance)} · 逾期 {o.days} 天</span></li>)}
          </ul>
        </section>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="card p-5 text-sm">
          <h2 className="font-semibold">本月收款（{d.payments.length}）</h2>
          <div className="mt-2 max-h-72 divide-y divide-black/5 overflow-y-auto">
            {d.payments.map(p => (
              <div key={p.id} className="flex items-center justify-between py-1.5">
                <span>{p.paid_at} · {name.get(p.student_id)} · {METHOD_LABEL[p.method]}{p.note && <span className="text-xs text-ink-muted"> · {p.note}</span>}</span>
                <span className="tabular-nums">{money(p.amount)} <button className="ml-2 text-xs text-red-600 hover:underline" onClick={() => { if (confirm('刪除這筆收款？帳單會改回未繳')) void act(() => post({ action: 'payment-delete', id: p.id })) }}>刪除</button></span>
              </div>
            ))}
            {d.payments.length === 0 && <div className="py-2 text-ink-muted">這個月還沒有收款</div>}
          </div>
        </section>
        <Ledger ledger={d.ledger} month={month} act={act} />
      </div>
    </div>
  )
}

function Plans({ plans, act }: { plans: Plan[]; act: (fn: () => Promise<unknown>) => Promise<void> }) {
  const [f, setF] = useState({ name: '', price: '', cycle: 'monthly' })
  return (
    <section className="card space-y-3 p-5 text-sm">
      <h2 className="font-semibold">收費方案</h2>
      <div className="divide-y divide-black/5">
        {plans.map(p => (
          <div key={p.id} className={`flex items-center justify-between py-1.5 ${p.active ? '' : 'text-ink-muted line-through'}`}>
            <span>{p.name} <span className="text-xs text-ink-muted">{p.cycle === 'monthly' ? '每月' : '一次性'}</span></span>
            <span className="tabular-nums">{money(p.price)}
              {p.active && <button className="ml-2 text-xs text-red-600 hover:underline" onClick={() => { if (confirm(`停用方案「${p.name}」？（已開的帳單不受影響）`)) void act(() => post({ action: 'plan-delete', id: p.id })) }}>停用</button>}
            </span>
          </div>
        ))}
        {plans.length === 0 && <div className="py-2 text-ink-muted">還沒有方案，例如「月費（不限時）3,000」「計次 10 次 2,000」</div>}
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <input value={f.name} onChange={e => setF({ ...f, name: e.target.value })} placeholder="方案名稱" className="w-32 leaf-sm border border-black/10 px-2 py-1" />
        <input value={f.price} onChange={e => setF({ ...f, price: e.target.value.replace(/\D/g, '') })} placeholder="金額" inputMode="numeric" className="w-24 leaf-sm border border-black/10 px-2 py-1" />
        <select value={f.cycle} onChange={e => setF({ ...f, cycle: e.target.value })} className="leaf-sm border border-black/10 px-2 py-1"><option value="monthly">每月</option><option value="once">一次性</option></select>
        <button className="btn-primary py-1" disabled={!f.name || !f.price} onClick={() => void act(async () => { await post({ action: 'plan-save', name: f.name, price: Number(f.price), cycle: f.cycle }); setF({ name: '', price: '', cycle: 'monthly' }) })}>新增方案</button>
      </div>
    </section>
  )
}

function Invoices({ d, name, act, setMsg }: { d: Data; name: Map<string, string>; act: (fn: () => Promise<unknown>, done?: string) => Promise<void>; setMsg: (s: string) => void }) {
  const [f, setF] = useState({ student_id: '', title: '', amount: '', due_date: '' })
  const [filter, setFilter] = useState<'all' | 'unpaid'>('unpaid')
  const list = d.invoices.filter(i => filter === 'all' || i.status === 'unpaid')
  return (
    <section className="card space-y-3 p-5 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold">帳單</h2>
        <div className="flex leaf-sm bg-black/5 p-0.5">
          {(['unpaid', 'all'] as const).map(k => <button key={k} onClick={() => setFilter(k)} className={`rounded-md px-2.5 py-0.5 ${filter === k ? 'bg-white shadow-sm' : 'text-ink-soft'}`}>{k === 'unpaid' ? '未繳' : `本月全部`}</button>)}
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px]">
          <thead className="text-left text-xs text-ink-muted"><tr><th className="py-1 font-normal">學生</th><th className="font-normal">項目</th><th className="font-normal">應收</th><th className="font-normal">未收</th><th className="font-normal">期限</th><th className="font-normal">狀態</th><th /></tr></thead>
          <tbody>
            {list.map(i => (
              <tr key={i.id} className="border-t border-black/5">
                <td className="py-1.5">{name.get(i.student_id)}</td>
                <td>{i.title}{i.discount > 0 && <span className="ml-1 text-xs text-ink-muted">（折 {money(i.discount)}）</span>}</td>
                <td className="tabular-nums">{money(i.net)}</td>
                <td className="tabular-nums">{i.status === 'void' ? '—' : money(i.balance)}</td>
                <td>{i.due_date ?? '—'}</td>
                <td className={i.status === 'paid' ? 'text-green-700' : i.status === 'void' ? 'text-ink-muted' : ''}>{STATUS[i.status]}</td>
                <td className="whitespace-nowrap text-right text-xs">
                  {i.status === 'unpaid' && <>
                    <button className="text-brand-600 hover:underline" onClick={() => {
                      const amt = prompt(`${name.get(i.student_id)}「${i.title}」收款金額`, String(i.balance))
                      if (!amt) return
                      const m = prompt('收款方式：1 現金、2 轉帳、3 刷卡、4 LINE Pay、5 其他', '1')
                      const method = (['cash', 'transfer', 'card', 'linepay', 'other'] as const)[Number(m) - 1] ?? 'cash'
                      void act(() => post({ action: 'pay', invoice_id: i.id, amount: Number(amt), method }))
                    }}>收款</button>
                    <button className="ml-3 text-brand-600 hover:underline" onClick={() => void act(async () => {
                      const x = await post({ action: 'notify-invoice', id: i.id }) as { notified: { sent: number; skipped: number; failed: number } }
                      const n = x.notified
                      setMsg(n.sent + n.failed + n.skipped === 0 ? '這位學生沒有可通知的家長（沒有聯絡人，或家長關閉了成績與繳費通知）' : `繳費通知：送出 ${n.sent}、失敗 ${n.failed}、略過 ${n.skipped}（略過＝管道還沒設定）`)
                    })}>通知家長</button>
                    <button className="ml-3 text-ink-soft hover:underline" onClick={() => {
                      const v = prompt('折扣金額', String(i.discount))
                      if (v != null) void act(() => post({ action: 'invoice-update', id: i.id, discount: Number(v) }))
                    }}>折扣</button>
                    <button className="ml-3 text-red-600 hover:underline" onClick={() => { if (confirm('作廢這張帳單？')) void act(() => post({ action: 'invoice-void', id: i.id })) }}>作廢</button>
                  </>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {list.length === 0 && <div className="py-3 text-ink-muted">沒有帳單</div>}
      </div>
      <div className="flex flex-wrap items-end gap-2 border-t border-black/5 pt-3">
        <span className="label">單筆收費</span>
        <select value={f.student_id} onChange={e => setF({ ...f, student_id: e.target.value })} className="leaf-sm border border-black/10 px-2 py-1">
          <option value="">選學生</option>{d.students.filter(s => !s.disabled).map(s => <option key={s.id} value={s.id}>{s.display_name}</option>)}
        </select>
        <input value={f.title} onChange={e => setF({ ...f, title: e.target.value })} placeholder="項目（講義費、入會費…）" className="w-44 leaf-sm border border-black/10 px-2 py-1" />
        <input value={f.amount} onChange={e => setF({ ...f, amount: e.target.value.replace(/\D/g, '') })} placeholder="金額" inputMode="numeric" className="w-24 leaf-sm border border-black/10 px-2 py-1" />
        <input type="date" value={f.due_date} onChange={e => setF({ ...f, due_date: e.target.value })} className="leaf-sm border border-black/10 px-2 py-1" />
        <button className="btn-primary py-1" disabled={!f.student_id || !f.amount} onClick={() => void act(async () => {
          await post({ action: 'invoice-create', ...f, amount: Number(f.amount) }); setF({ student_id: '', title: '', amount: '', due_date: '' })
        })}>開單</button>
      </div>
    </section>
  )
}

function Ledger({ ledger, month, act }: { ledger: LedgerEntry[]; month: string; act: (fn: () => Promise<unknown>) => Promise<void> }) {
  const [f, setF] = useState({ kind: 'expense', category: EXPENSE_CATEGORIES[0], amount: '', date: '', note: '' })
  return (
    <section className="card space-y-3 p-5 text-sm">
      <h2 className="font-semibold">{month} 其他收支</h2>
      <div className="max-h-56 divide-y divide-black/5 overflow-y-auto">
        {ledger.map(l => (
          <div key={l.id} className="flex items-center justify-between py-1.5">
            <span>{l.date} · {l.category}{l.note && <span className="text-xs text-ink-muted"> · {l.note}</span>}</span>
            <span className={`tabular-nums ${l.kind === 'expense' ? 'text-red-700' : 'text-green-700'}`}>{l.kind === 'expense' ? '−' : '+'}{money(l.amount)}
              <button className="ml-2 text-xs text-ink-muted hover:underline" onClick={() => { if (confirm('刪除這筆？')) void act(() => post({ action: 'ledger-delete', id: l.id })) }}>刪除</button></span>
          </div>
        ))}
        {ledger.length === 0 && <div className="py-2 text-ink-muted">還沒有紀錄（房租、水電、耗材…）</div>}
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <select value={f.kind} onChange={e => setF({ ...f, kind: e.target.value })} className="leaf-sm border border-black/10 px-2 py-1"><option value="expense">支出</option><option value="income">收入</option></select>
        <input list="ledger-cats" value={f.category} onChange={e => setF({ ...f, category: e.target.value })} className="w-24 leaf-sm border border-black/10 px-2 py-1" />
        <datalist id="ledger-cats">{EXPENSE_CATEGORIES.map(c => <option key={c} value={c} />)}</datalist>
        <input value={f.amount} onChange={e => setF({ ...f, amount: e.target.value.replace(/\D/g, '') })} placeholder="金額" inputMode="numeric" className="w-24 leaf-sm border border-black/10 px-2 py-1" />
        <input type="date" value={f.date} onChange={e => setF({ ...f, date: e.target.value })} className="leaf-sm border border-black/10 px-2 py-1" />
        <input value={f.note} onChange={e => setF({ ...f, note: e.target.value })} placeholder="備註" className="w-28 leaf-sm border border-black/10 px-2 py-1" />
        <button className="btn-primary py-1" disabled={!f.amount} onClick={() => void act(async () => { await post({ action: 'ledger-add', ...f, amount: Number(f.amount) }); setF({ ...f, amount: '', note: '' }) })}>記一筆</button>
      </div>
    </section>
  )
}
