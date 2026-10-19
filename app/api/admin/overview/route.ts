import { NextResponse } from 'next/server'
import { forbidden, handle, must } from '@/lib/api-util'
import { type AttendanceRow, type StudentLite, usageStats } from '@/lib/erp-stats'
import { channels, taipeiDate } from '@/lib/notify'
import { createServiceClient, getStaffUser } from '@/lib/server-auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// ERP 總覽：學生數量、在館人數、活躍度、待完成檢測、通知管道狀態
export const GET = handle(async req => {
  const me = await getStaffUser(req)
  if (!me) return forbidden()
  const db = createServiceClient()
  const today = taipeiDate()
  const since = new Date(Date.now() - 40 * 86400000).toISOString().slice(0, 10)
  const students = must<StudentLite[]>(await db.from('students').select('id, user_id, grade, disabled, created_at'))
  const attendance = must<(AttendanceRow & { seat: string | null })[]>(await db.from('attendance').select('student_id, date, check_in_at, check_out_at, seat').gte('date', since))
  const activity = must<{ user_id: string; value: unknown }[]>(await db.from('student_store').select('user_id, value').eq('key', 'activity'))
  const pending = must<{ id: string }[]>(await db.from('test_assignments').select('id').neq('status', 'submitted'))
  const usage = usageStats({ students, attendance, activity, today })
  // 現在在館的學生（姓名、座位、到館時間）
  const names = new Map(must<{ id: string; display_name: string }[]>(await db.from('students').select('id, display_name')).map(s => [s.id, s.display_name]))
  const inCenter = attendance.filter(a => a.date === today && !a.check_out_at)
    .map(a => ({ name: names.get(a.student_id) ?? '', seat: a.seat, since: a.check_in_at }))
    .sort((a, b) => a.since.localeCompare(b.since))
  return NextResponse.json({ me: { role: me.role, email: me.email, name: me.displayName ?? me.email }, today, usage, inCenter, pendingTests: pending.length, channels: channels() })
})
