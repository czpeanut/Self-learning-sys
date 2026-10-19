// ── 收費與帳務（純函式）：月費開單、餘額、月報表 ─────────────────────
// 金額一律是新台幣整數（元）。

export type Plan = { id: string; name: string; price: number; cycle: 'monthly' | 'once'; active: boolean }
export type Invoice = {
  id: string; student_id: string; plan_id: string | null; title: string; period: string | null
  amount: number; discount: number; due_date: string | null; status: 'unpaid' | 'paid' | 'void'; note?: string | null; created_at?: string
}
export type Payment = { id: string; invoice_id: string | null; student_id: string; amount: number; method: PayMethod; paid_at: string; received_by?: string | null; note?: string | null }
export type PayMethod = 'cash' | 'transfer' | 'card' | 'linepay' | 'other'
export const METHOD_LABEL: Record<PayMethod, string> = { cash: '現金', transfer: '轉帳', card: '刷卡', linepay: 'LINE Pay', other: '其他' }
export type LedgerEntry = { id: string; date: string; kind: 'income' | 'expense'; category: string; amount: number; note?: string | null }
export const EXPENSE_CATEGORIES = ['房租', '水電', '網路', '人事', '耗材', '設備', 'AI 與軟體', '行銷', '其他']

export const net = (i: Pick<Invoice, 'amount' | 'discount'>) => Math.max(0, i.amount - i.discount)
export const paidOf = (invoiceId: string, payments: Payment[]) => payments.filter(p => p.invoice_id === invoiceId).reduce((s, p) => s + p.amount, 0)
export const balanceOf = (inv: Invoice, payments: Payment[]) => (inv.status === 'void' ? 0 : Math.max(0, net(inv) - paidOf(inv.id, payments)))
/** 收款後的狀態：付清 → paid */
export const statusAfter = (inv: Invoice, payments: Payment[]): Invoice['status'] =>
  inv.status === 'void' ? 'void' : paidOf(inv.id, payments) >= net(inv) ? 'paid' : 'unpaid'

const monthOf = (d: string) => d.slice(0, 7)
/** 該月最後一天之前的第 10 天當繳費期限（例：2026-10 → 2026-10-10） */
export const defaultDue = (period: string) => `${period}-10`

/** 某月要開的月費單：使用中、有月費方案、這個月還沒開過的學生 */
export function monthlyInvoicesToCreate(
  students: { id: string; plan_id: string | null; disabled: boolean }[], plans: Plan[], period: string, existing: Invoice[],
): Omit<Invoice, 'id' | 'status'>[] {
  const has = new Set(existing.filter(i => i.period === period && i.status !== 'void').map(i => `${i.student_id}|${i.plan_id}`))
  const out: Omit<Invoice, 'id' | 'status'>[] = []
  for (const s of students) {
    const p = plans.find(x => x.id === s.plan_id)
    if (s.disabled || !p || !p.active || p.cycle !== 'monthly' || has.has(`${s.id}|${p.id}`)) continue
    out.push({ student_id: s.id, plan_id: p.id, title: `${period} ${p.name}`, period, amount: p.price, discount: 0, due_date: defaultDue(period) })
  }
  return out
}

export type MonthReport = {
  period: string
  billed: number            // 這個月份的應收（扣折扣、不含作廢）
  collected: number         // 這個月實際收到（依收款日期）
  byMethod: Record<string, number>
  otherIncome: number
  expense: number
  byCategory: Record<string, number>
  net: number               // 實收＋其他收入－支出
  receivable: number        // 目前所有未收（全部月份）
  overdue: { invoice: Invoice; balance: number; days: number }[]
  unpaidCount: number
}

export function monthReport(period: string, invoices: Invoice[], payments: Payment[], ledger: LedgerEntry[], today: string): MonthReport {
  const live = invoices.filter(i => i.status !== 'void')
  const billed = live.filter(i => i.period === period || (!i.period && monthOf(i.created_at ?? '') === period)).reduce((s, i) => s + net(i), 0)
  const monthPays = payments.filter(p => monthOf(p.paid_at) === period)
  const byMethod: Record<string, number> = {}
  for (const p of monthPays) byMethod[p.method] = (byMethod[p.method] ?? 0) + p.amount
  const collected = monthPays.reduce((s, p) => s + p.amount, 0)
  const monthLedger = ledger.filter(l => monthOf(l.date) === period)
  const otherIncome = monthLedger.filter(l => l.kind === 'income').reduce((s, l) => s + l.amount, 0)
  const expenses = monthLedger.filter(l => l.kind === 'expense')
  const byCategory: Record<string, number> = {}
  for (const l of expenses) byCategory[l.category] = (byCategory[l.category] ?? 0) + l.amount
  const expense = expenses.reduce((s, l) => s + l.amount, 0)
  const open = live.map(i => ({ invoice: i, balance: balanceOf(i, payments) })).filter(x => x.balance > 0)
  const dayMs = 86400000
  const overdue = open
    .filter(x => x.invoice.due_date && x.invoice.due_date < today)
    .map(x => ({ ...x, days: Math.round((Date.parse(today) - Date.parse(x.invoice.due_date!)) / dayMs) }))
    .sort((a, b) => b.days - a.days)
  return {
    period, billed, collected, byMethod, otherIncome, expense, byCategory,
    net: collected + otherIncome - expense,
    receivable: open.reduce((s, x) => s + x.balance, 0),
    overdue, unpaidCount: open.length,
  }
}

/** CSV（Excel 開啟用，含 BOM） */
export function toCSV(rows: (string | number | null | undefined)[][]): string {
  const esc = (v: string | number | null | undefined) => { const s = v == null ? '' : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s }
  return '﻿' + rows.map(r => r.map(esc).join(',')).join('\r\n')
}
