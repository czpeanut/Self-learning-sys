import { NextResponse } from 'next/server'
import { fail, forbidden, handle, must, readJSON } from '@/lib/api-util'
import { catalog } from '@/lib/pool'
import { createServiceClient, getStaffUser } from '@/lib/server-auth'
import {
  type Diagnosis, type ItemResult, type Layout, MAX_PAGES, type WorkbookItem,
  aggregateDiagnosis, statusOf, summarize, workbookCode,
} from '@/lib/workbook'
import { SUBJECT, type WorkbookRow, buildItems, prepareItems, studentAttempts, workbookTitle } from '@/lib/workbook-server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

// 專屬教材（館方人員）：產生教材、列印版面、標記寄出、人工閱卷、下一輪；列表就是全體學生的即時狀態


export const GET = handle(async req => {
  if (!(await getStaffUser(req))) return forbidden()
  const db = createServiceClient()
  const id = new URL(req.url).searchParams.get('id')
  const names = new Map(must<{ id: string; display_name: string; username: string; grade: string | null }[]>(
    await db.from('students').select('id, display_name, username, grade')).map(s => [s.id, s]))
  if (id) {
    const w = must<WorkbookRow>(await db.from('workbooks').select('*').eq('id', id).single())
    return NextResponse.json({ workbook: { ...w, title: workbookTitle(w), name: names.get(w.student_id)?.display_name ?? '' } })
  }
  const rows = must<WorkbookRow[]>(await db.from('workbooks').select('*').order('created_at', { ascending: false }).limit(500))
  return NextResponse.json({
    workbooks: rows.map(w => ({
      id: w.id, code: w.code, student_id: w.student_id, name: names.get(w.student_id)?.display_name ?? '', username: names.get(w.student_id)?.username ?? '',
      grade: names.get(w.student_id)?.grade ?? null, book: w.book, exam_seq: w.exam_seq, round: w.round, status: w.status, title: workbookTitle(w),
      summary: summarize(w.items, w.results ?? {}), diagnosis: (w.diagnosis ?? []).slice(0, 4), created_at: w.created_at, sent_at: w.sent_at, graded_at: w.graded_at,
    })),
  })
})

type Body = {
  action?: 'create' | 'next' | 'prepare' | 'layout' | 'sent' | 'grade' | 'delete'
  id?: string; student_ids?: string[]; book?: string; exam_seq?: number; units?: string[]
  layout?: Layout; no?: number; result?: Partial<ItemResult> & { prereqKeys?: string[] }
}

async function create(db: ReturnType<typeof createServiceClient>, studentId: string, book: string, examSeq: number, units: string[], by: string, prev: WorkbookRow | null) {
  const attempts = await studentAttempts(db, studentId)
  const used = new Set<string>()
  const { data: olds } = await db.from('workbooks').select('items').eq('student_id', studentId).eq('book', book).eq('exam_seq', examSeq)
  for (const o of olds ?? []) for (const it of o.items as WorkbookItem[]) used.add(it.qid)
  const items = buildItems({ book, units, attempts, diagnosis: prev?.diagnosis ?? null, usedQids: used })
  if (!items.length) return { error: '範圍內的題型都熟練了，不需要再出教材' }
  const round = (prev?.round ?? 0) + 1
  const row = { code: workbookCode(), student_id: studentId, subject: SUBJECT, book, exam_seq: examSeq, units, round, items, results: {}, status: 'draft', created_by: by }
  const r = await db.from('workbooks').insert(row).select('id').single()
  if (r.error) return { error: r.error.message.includes('duplicate') ? `已經有第 ${round} 輪` : r.error.message }
  return { id: r.data.id as string, count: items.length }
}

export const POST = handle(async req => {
  const me = await getStaffUser(req)
  if (!me) return forbidden()
  const b = await readJSON<Body>(req)
  if (!b) return fail('請求格式錯誤')
  const db = createServiceClient()
  const by = me.email ?? me.displayName ?? ''

  if (b.action === 'create') {
    const book = b.book ?? ''
    const cat = catalog(SUBJECT, book)
    if (!cat) return fail('找不到這一冊的題目池（目前只有數學）')
    const units = (b.units ?? []).filter(u => cat.units.some(x => x.code === u))
    const seq = Number(b.exam_seq)
    if (!units.length) return fail('請選擇段考範圍')
    if (![1, 2, 3].includes(seq)) return fail('段考次別錯誤')
    const ids = (b.student_ids ?? []).slice(0, 60)
    if (!ids.length) return fail('請選擇學生')
    const out = []
    for (const sid of ids) {
      // 同一次段考已經有教材 → 接著出下一輪（帶上一輪的診斷）
      const { data: last } = await db.from('workbooks').select('*').eq('student_id', sid).eq('book', book).eq('exam_seq', seq).order('round', { ascending: false }).limit(1).maybeSingle()
      out.push({ student_id: sid, ...(await create(db, sid, book, seq, units, by, (last as WorkbookRow | null) ?? null)) })
    }
    return NextResponse.json({ results: out })
  }

  if (!b.id) return fail('缺少教材 id')
  const w = must<WorkbookRow>(await db.from('workbooks').select('*').eq('id', b.id).single())

  if (b.action === 'next') {
    if (w.status !== 'graded' && w.status !== 'grading') return fail('這一輪還沒閱卷')
    const r = await create(db, w.student_id, w.book, w.exam_seq, w.units, by, w)
    return 'error' in r ? fail(r.error!) : NextResponse.json(r)
  }
  if (b.action === 'prepare') {
    // 列印前：圖解觀念卡＋步驟提示，一次做一批，前端反覆呼叫到 remaining＝0
    const { items, remaining } = await prepareItems(db, w.items)
    must(await db.from('workbooks').update({ items }).eq('id', w.id))
    return NextResponse.json({ remaining, total: items.length })
  }
  if (b.action === 'layout') {
    const l = b.layout
    if (!l || !Array.isArray(l.pages) || l.pages.length > MAX_PAGES) return fail(`版面錯誤（最多 ${MAX_PAGES} 頁）`)
    must(await db.from('workbooks').update({ layout: l }).eq('id', w.id))
    return NextResponse.json({ ok: true })
  }
  if (b.action === 'sent') {
    must(await db.from('workbooks').update({ status: statusOf(w.items, w.results, true), sent_at: new Date().toISOString() }).eq('id', w.id))
    return NextResponse.json({ ok: true })
  }
  if (b.action === 'grade') {
    // 人工閱卷／修正 AI 判讀：選項以題庫答案判對錯
    const it = w.items.find(x => x.no === b.no)
    if (!it || !b.result) return fail('找不到這一題')
    const results = { ...w.results }
    if (b.result.chosen === undefined && !b.result.status) delete results[String(it.no)]
    else {
      const chosen = typeof b.result.chosen === 'number' && b.result.chosen >= 0 && b.result.chosen < it.options.length ? b.result.chosen : null
      const old = results[String(it.no)]
      const status = b.result.status === 'blank' ? 'blank' : chosen == null ? (old?.status ?? 'blank') : chosen === it.answer ? 'correct' : 'wrong'
      const prereq = Array.isArray(b.result.prereq) ? b.result.prereq.slice(0, 3).map(p => ({ book: String(p.book), unit: String(p.unit), type: String(p.type), typeName: String(p.typeName).slice(0, 60), why: String(p.why ?? '').slice(0, 20) })) : (old?.prereq ?? [])
      results[String(it.no)] = {
        status, chosen: chosen ?? old?.chosen ?? null, steps: old?.steps ?? [], firstWrongStep: b.result.firstWrongStep ?? old?.firstWrongStep ?? null,
        note: String(b.result.note ?? old?.note ?? '').slice(0, 24), prereq, source: 'manual', at: old?.at ?? Date.now(),
      }
    }
    const status = statusOf(w.items, results, !!w.sent_at)
    must(await db.from('workbooks').update({
      results, status, diagnosis: aggregateDiagnosis(w.items, results) as Diagnosis, graded_at: status === 'graded' ? (w.graded_at ?? new Date().toISOString()) : null,
    }).eq('id', w.id))
    return NextResponse.json({ ok: true })
  }
  if (b.action === 'delete') {
    must(await db.from('workbooks').delete().eq('id', w.id))
    return NextResponse.json({ ok: true })
  }
  return fail('未知的動作')
})
