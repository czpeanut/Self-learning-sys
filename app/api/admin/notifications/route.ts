import { NextResponse } from 'next/server'
import { forbidden, handle, must } from '@/lib/api-util'
import { channels } from '@/lib/notify'
import { createServiceClient, getStaffUser } from '@/lib/server-auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// 家長通知紀錄（最近 200 則）＋各管道是否已設定
export const GET = handle(async req => {
  if (!(await getStaffUser(req))) return forbidden()
  const db = createServiceClient()
  const logs = must<{ id: number; student_id: string | null; guardian_id: string | null; channel: string; kind: string; status: string; detail: string | null; created_at: string }[]>(
    await db.from('notifications').select('*').order('created_at', { ascending: false }).limit(200))
  const names = new Map(must<{ id: string; display_name: string }[]>(await db.from('students').select('id, display_name')).map(s => [s.id, s.display_name]))
  const gnames = new Map(must<{ id: string; name: string }[]>(await db.from('guardians').select('id, name')).map(g => [g.id, g.name]))
  return NextResponse.json({
    channels: channels(),
    logs: logs.map(l => ({ ...l, student: l.student_id ? names.get(l.student_id) ?? '' : '', guardian: l.guardian_id ? gnames.get(l.guardian_id) ?? '' : '' })),
  })
})
