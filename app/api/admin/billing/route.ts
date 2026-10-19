import { NextResponse } from 'next/server'
import { fail, forbidden, handle, isDate, isMonth, must, readJSON } from '@/lib/api-util'
import { type Invoice, type LedgerEntry, type PayMethod, type Payment, type Plan, METHOD_LABEL, balanceOf, monthReport, monthlyInvoicesToCreate, net, statusAfter, toCSV } from '@/lib/billing'
import { notifyGuardians, taipeiDate } from '@/lib/notify'
import { createServiceClient, getAdminUser } from '@/lib/server-auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// 收費與帳務（只有管理員）：方案、開單、收款、其他收支、月報表、CSV 匯出

type DB = ReturnType<typeof createServiceClient>
const load = async (db: DB) => ({
  plans: must<Plan[]>(await db.from('plans').select('*').order('created_at')),
  invoices: must<Invoice[]>(await db.from('invoices').select('*').order('created_at', { ascending: false })),
  payments: must<Payment[]>(await db.from('payments').select('*').order('paid_at', { ascending: false })),
  students: must<{ id: string; username: string; display_name: string; grade: string | null; plan_id: string | null; disabled: boolean }[]>(
    await db.from('students').select('id, username, display_name, grade, plan_id, disabled')),
})

export const GET = handle(async req => {
  if (!(await getAdminUser(req))) return forbidden()
  const url = new URL(req.url)
  const month = isMonth(url.searchParams.get('month')) ? url.searchParams.get('month')! : taipeiDate().slice(0, 7)
  const db = createServiceClient()
  const { plans, invoices, payments, students } = await load(db)
  const ledger = must<LedgerEntry[]>(await db.from('ledger').select('*').gte('date', `${month}-01`).lte('date', `${month}-31`).order('date'))
  const name = new Map(students.map(s => [s.id, s.display_name]))
  const exp = url.searchParams.get('export')
  if (exp) {
    let rows: (string | number | null)[][] = []
    if (exp === 'invoices') {
      rows = [['學生', '項目', '月份', '金額', '折扣', '應收', '已收', '未收', '繳費期限', '狀態']]
      for (const i of invoices.filter(i => i.period === month || i.created_at?.startsWith(month)))
        rows.push([name.get(i.student_id) ?? '', i.title, i.period, i.amount, i.discount, net(i), net(i) - balanceOf(i, payments), balanceOf(i, payments), i.due_date, { unpaid: '未繳', paid: '已繳', void: '作廢' }[i.status]])
    } else if (exp === 'payments') {
      rows = [['收款日', '學生', '金額', '方式', '經手', '備註']]
      for (const p of payments.filter(p => p.paid_at.startsWith(month))) rows.push([p.paid_at, name.get(p.student_id) ?? '', p.amount, METHOD_LABEL[p.method], p.received_by ?? '', p.note ?? ''])
    } else if (exp === 'ledger') {
      rows = [['日期', '收入／支出', '類別', '金額', '備註']]
      for (const l of ledger) rows.push([l.date, l.kind === 'income' ? '收入' : '支出', l.category, l.amount, l.note ?? ''])
    } else return fail('未知的匯出種類')
    return new Response(toCSV(rows), { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="${exp}-${month}.csv"` } })
  }
  return NextResponse.json({
    month, plans, students, ledger,
    invoices: invoices.filter(i => i.period === month || i.status === 'unpaid' || i.created_at?.startsWith(month)).map(i => ({ ...i, balance: balanceOf(i, payments), net: net(i) })),
    payments: payments.filter(p => p.paid_at.startsWith(month)),
    report: monthReport(month, invoices, payments, ledger, taipeiDate()),
  })
})

type Body = {
  action?: string; id?: string; name?: string; price?: number; cycle?: 'monthly' | 'once'; active?: boolean
  student_id?: string; plan_id?: string | null; period?: string; title?: string; amount?: number; discount?: number; due_date?: string; note?: string
  invoice_id?: string; method?: PayMethod; paid_at?: string; kind?: 'income' | 'expense'; category?: string; date?: string
}
const int = (v: unknown) => Math.max(0, Math.round(Number(v) || 0))
const txt = (v: unknown, n: number) => (typeof v === 'string' ? v.trim().slice(0, n) : '') || null

export const POST = handle(async req => {
  const me = await getAdminUser(req)
  if (!me) return forbidden()
  const b = await readJSON<Body>(req)
  if (!b) return fail('請求格式錯誤')
  const db = createServiceClient()
  const ok = (extra: object = {}) => NextResponse.json({ ok: true, ...extra })

  switch (b.action) {
    case 'plan-save': {
      const row = { name: txt(b.name, 30) ?? '方案', price: int(b.price), cycle: b.cycle === 'once' ? 'once' : 'monthly', active: b.active ?? true }
      if (b.id) must(await db.from('plans').update(row).eq('id', b.id))
      else must(await db.from('plans').insert(row))
      return ok()
    }
    case 'plan-delete':
      must(await db.from('plans').update({ active: false }).eq('id', b.id ?? ''))    // 停用而不刪，舊帳單還查得到
      return ok()
    case 'set-plan':
      must(await db.from('students').update({ plan_id: b.plan_id || null }).eq('id', b.student_id ?? ''))
      return ok()
    case 'generate': {   // 開某月的月費單
      if (!isMonth(b.period ?? null)) return fail('月份格式 YYYY-MM')
      const { plans, invoices, students } = await load(db)
      const rows = monthlyInvoicesToCreate(students, plans, b.period!, invoices)
      if (rows.length) must(await db.from('invoices').insert(rows))
      return ok({ created: rows.length })
    }
    case 'invoice-create': {
      if (!b.student_id || !int(b.amount)) return fail('請填學生與金額')
      must(await db.from('invoices').insert({
        student_id: b.student_id, title: txt(b.title, 60) ?? '收費', amount: int(b.amount), discount: int(b.discount),
        period: isMonth(b.period ?? null) ? b.period : null, due_date: isDate(b.due_date) ? b.due_date : null, note: txt(b.note, 200),
      }))
      return ok()
    }
    case 'invoice-update': {   // 調整折扣、期限、備註
      if (!b.id) return fail('缺少 id')
      const patch: Record<string, unknown> = {}
      if (b.discount != null) patch.discount = int(b.discount)
      if (b.due_date !== undefined) patch.due_date = isDate(b.due_date) ? b.due_date : null
      if (b.note !== undefined) patch.note = txt(b.note, 200)
      must(await db.from('invoices').update(patch).eq('id', b.id))
      const inv = must<Invoice>(await db.from('invoices').select('*').eq('id', b.id).single())
      const pays = must<Payment[]>(await db.from('payments').select('*').eq('invoice_id', b.id))
      must(await db.from('invoices').update({ status: statusAfter(inv, pays) }).eq('id', b.id))
      return ok()
    }
    case 'invoice-void':
      must(await db.from('invoices').update({ status: 'void' }).eq('id', b.id ?? ''))
      return ok()
    case 'pay': {
      const inv = b.invoice_id ? must<Invoice | null>(await db.from('invoices').select('*').eq('id', b.invoice_id).maybeSingle()) : null
      const studentId = inv?.student_id ?? b.student_id
      if (!studentId || !int(b.amount)) return fail('請填金額')
      if (inv?.status === 'void') return fail('這張帳單已作廢')
      must(await db.from('payments').insert({
        invoice_id: inv?.id ?? null, student_id: studentId, amount: int(b.amount), method: b.method && b.method in METHOD_LABEL ? b.method : 'cash',
        paid_at: isDate(b.paid_at) ? b.paid_at : taipeiDate(), received_by: me.displayName ?? me.email, note: txt(b.note, 200),
      }))
      if (inv) {
        const pays = must<Payment[]>(await db.from('payments').select('*').eq('invoice_id', inv.id))
        must(await db.from('invoices').update({ status: statusAfter(inv, pays) }).eq('id', inv.id))
      }
      return ok()
    }
    case 'payment-delete': {
      const p = must<Payment | null>(await db.from('payments').select('*').eq('id', b.id ?? '').maybeSingle())
      if (!p) return fail('找不到這筆收款', 404)
      must(await db.from('payments').delete().eq('id', p.id))
      if (p.invoice_id) {
        const inv = must<Invoice>(await db.from('invoices').select('*').eq('id', p.invoice_id).single())
        const pays = must<Payment[]>(await db.from('payments').select('*').eq('invoice_id', p.invoice_id))
        must(await db.from('invoices').update({ status: statusAfter(inv, pays) }).eq('id', inv.id))
      }
      return ok()
    }
    case 'ledger-add': {
      if (!int(b.amount)) return fail('請填金額')
      must(await db.from('ledger').insert({
        date: isDate(b.date) ? b.date : taipeiDate(), kind: b.kind === 'income' ? 'income' : 'expense', category: txt(b.category, 20) ?? '其他',
        amount: int(b.amount), note: txt(b.note, 200), created_by: me.email,
      }))
      return ok()
    }
    case 'ledger-delete':
      must(await db.from('ledger').delete().eq('id', b.id ?? ''))
      return ok()
    case 'notify-invoice': {   // 傳繳費通知給家長
      const inv = must<Invoice>(await db.from('invoices').select('*').eq('id', b.id ?? '').single())
      const pays = must<Payment[]>(await db.from('payments').select('*').eq('invoice_id', inv.id))
      const s = must<{ display_name: string }>(await db.from('students').select('display_name').eq('id', inv.student_id).single())
      const sum = await notifyGuardians(db, inv.student_id, 'invoice', {
        subject: `${s.display_name} 繳費通知：${inv.title}`,
        text: `💳 繳費通知\n${s.display_name}｜${inv.title}\n應繳 ${balanceOf(inv, pays).toLocaleString()} 元${inv.due_date ? `，請於 ${inv.due_date} 前繳納` : ''}。\n如已繳費請忽略此訊息，謝謝！`,
      })
      return ok({ notified: sum })
    }
  }
  return fail('未知的 action')
})
