import { NextResponse } from 'next/server'
import { type CheckoutSummary, checkinMessage, checkoutMessage, notifyGuardians, taipeiDate } from '@/lib/notify'
import { createServiceClient, getStudentUser } from '@/lib/server-auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// 學生簽到／簽退（K書模式）：寫入到館紀錄，並通知家長（LINE／Email）
export async function POST(req: Request) {
  const me = await getStudentUser(req)
  if (!me) return NextResponse.json({ error: '請先用學生帳號登入' }, { status: 401 })
  let body: { action?: 'in' | 'out'; seat?: string; summary?: CheckoutSummary }
  try { body = await req.json() } catch { return NextResponse.json({ error: '請求格式錯誤' }, { status: 400 }) }
  const db = createServiceClient()
  const now = new Date()
  const date = taipeiDate(now)
  const name = me.displayName ?? me.username ?? '孩子'
  const { data: row } = await db.from('attendance').select('id, check_in_at, check_out_at').eq('student_id', me.studentId).eq('date', date).maybeSingle()

  if (body.action === 'in') {
    const seat = (body.seat ?? '').slice(0, 20) || null
    if (row) await db.from('attendance').update({ check_out_at: null, seat }).eq('id', row.id)   // 同一天離館後又回來
    else await db.from('attendance').insert({ student_id: me.studentId, date, check_in_at: now.toISOString(), seat })
    const notified = await notifyGuardians(db, me.studentId, 'checkin', checkinMessage(name, now, seat))
    return NextResponse.json({ ok: true, notified })
  }
  if (body.action === 'out') {
    if (!row) return NextResponse.json({ error: '今天沒有簽到紀錄' }, { status: 400 })
    const s = body.summary ?? {}
    const summary: CheckoutSummary = {
      focusMinutes: Math.max(0, Math.round(Number(s.focusMinutes) || 0)), answered: Math.max(0, Math.round(Number(s.answered) || 0)),
      correct: s.correct == null ? undefined : Math.max(0, Math.round(Number(s.correct) || 0)),
      mood: s.mood ? String(s.mood).slice(0, 20) : undefined, learned: s.learned ? String(s.learned).slice(0, 100) : undefined,
    }
    await db.from('attendance').update({ check_out_at: now.toISOString(), summary }).eq('id', row.id)
    const notified = await notifyGuardians(db, me.studentId, 'checkout', checkoutMessage(name, new Date(row.check_in_at), now, summary))
    return NextResponse.json({ ok: true, notified })
  }
  return NextResponse.json({ error: 'action 必須是 in 或 out' }, { status: 400 })
}
