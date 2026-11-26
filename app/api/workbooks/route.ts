import { NextResponse } from 'next/server'
import { forbidden, handle, must } from '@/lib/api-util'
import { createServiceClient, getStudentUser } from '@/lib/server-auth'
import { publicItems, summarize, toAttempts } from '@/lib/workbook'
import { type WorkbookRow, workbookTitle } from '@/lib/workbook-server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// 學生：自己的專屬教材（未閱卷的題目不給答案）＋閱卷後的作答紀錄（前端併進段考準備度、錯題本）
export const GET = handle(async req => {
  const me = await getStudentUser(req)
  if (!me) return forbidden()
  const db = createServiceClient()
  const rows = must<WorkbookRow[]>(await db.from('workbooks').select('*')
    .eq('student_id', me.studentId).order('created_at', { ascending: false }))
  return NextResponse.json({
    workbooks: rows.map(w => ({
      id: w.id, code: w.code, title: workbookTitle(w), book: w.book, exam_seq: w.exam_seq, round: w.round, status: w.status,
      sent_at: w.sent_at, graded_at: w.graded_at, created_at: w.created_at, layout: w.layout ?? null,
      items: publicItems(w.items, w.results ?? {}), results: w.results ?? {}, diagnosis: w.diagnosis ?? [],
      summary: summarize(w.items, w.results ?? {}), attempts: toAttempts(w.items, w.results ?? {}),
    })),
  })
})
