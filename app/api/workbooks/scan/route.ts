import { NextResponse } from 'next/server'
import { fail, forbidden, handle, must, readJSON } from '@/lib/api-util'
import { hasGemini } from '@/lib/ai'
import { geminiErrorResponse } from '@/lib/gemini'
import { createServiceClient, getAuthedUser, resolveRole } from '@/lib/server-auth'
import { type Diagnosis, type Layout, aggregateDiagnosis, statusOf } from '@/lib/workbook'
import { type ScanRegion, type WorkbookRow, aiGrade } from '@/lib/workbook-server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

// 拍照閱卷：一次一頁。前端已用定位符校正、裁好作答區並判讀劃記（regions）；找不到定位符時送整頁（page）由 AI 找題號
// 館方人員或學生本人都可以上傳

const MAX_IMG = 900_000   // base64 字元數
type Body = { id?: string; page?: number; regions?: ScanRegion[]; image?: string }

export const POST = handle(async req => {
  const u = await getAuthedUser(req)
  if (!u) return forbidden()
  const me = await resolveRole(u)
  const b = await readJSON<Body>(req)
  if (!b?.id) return fail('缺少教材 id')
  const db = createServiceClient()
  const w = must<WorkbookRow>(await db.from('workbooks').select('*').eq('id', b.id).single())
  const staff = me.role === 'admin' || me.role === 'teacher'
  if (!staff && !(me.role === 'student' && me.studentId === w.student_id)) return forbidden()

  let regions: ScanRegion[] | undefined
  if (Array.isArray(b.regions)) {
    const layout = w.layout as Layout | null
    const onPage = new Set(layout?.pages.find(p => p.page === b.page)?.regions.map(r => r.no) ?? [])
    regions = b.regions.filter(r => Number.isInteger(r.no) && onPage.has(r.no)).slice(0, 12).map(r => ({
      no: r.no, chosen: Number.isInteger(r.chosen) ? r.chosen : null, image: typeof r.image === 'string' && r.image.length < MAX_IMG ? r.image : undefined,
    }))
    if (!regions.length) return fail('這一頁沒有可以閱卷的作答區')
  } else if (typeof b.image !== 'string' || b.image.length > MAX_IMG * 3) return fail('照片太大或格式錯誤')
  else if (!hasGemini()) return fail('找不到四角定位方塊或頁碼，請讓四角方塊入鏡、平放後重拍', 422)

  let graded
  try { graded = await aiGrade(w.items, regions ? { regions } : { page: b.image }) } catch (e) {
    const { status, body } = geminiErrorResponse(e)
    return NextResponse.json(body, { status })
  }
  // 人工改過的題目不被照片覆蓋
  const results = { ...w.results }
  for (const [no, r] of Object.entries(graded)) if (results[no]?.source !== 'manual') results[no] = r
  const status = statusOf(w.items, results, !!w.sent_at)
  must(await db.from('workbooks').update({
    results, status, diagnosis: aggregateDiagnosis(w.items, results) as Diagnosis, graded_at: status === 'graded' ? (w.graded_at ?? new Date().toISOString()) : null,
  }).eq('id', w.id))
  return NextResponse.json({ graded: Object.keys(graded).map(Number), status })
})
