import { NextResponse } from 'next/server'
import { fail, forbidden, handle, isDate, must, readJSON } from '@/lib/api-util'
import { BOOK_NAME } from '@/lib/exam'
import { type TestQuestion, type TestResult, type TypeSlot, TEST_MAX, TEST_MIN, difficultyFor, percentile, planTest } from '@/lib/placement'
import { catalog, drawFromPool } from '@/lib/pool'
import { typeWeight } from '@/lib/readiness'
import { createServiceClient, getStaffUser } from '@/lib/server-auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// 程度檢測（館方人員）：出卷（從 OLE-QS 段考真題題目池依題型頻率配題）、派發給學生、看結果

type TestRow = { id: string; title: string; subject: string; book: string; units: string[]; questions: TestQuestion[]; time_limit_min: number; created_by: string | null; created_at: string }
type Assign = { id: string; test_id: string; student_id: string; status: string; assigned_at: string; due_date: string | null; started_at: string | null; submitted_at: string | null; score: number | null; result: TestResult | null }

export const GET = handle(async req => {
  if (!(await getStaffUser(req))) return forbidden()
  const db = createServiceClient()
  const id = new URL(req.url).searchParams.get('id')
  const assigns = must<Assign[]>(await db.from('test_assignments').select('id, test_id, student_id, status, assigned_at, due_date, started_at, submitted_at, score, result'))
  if (!id) {
    const tests = must<Omit<TestRow, 'questions'>[]>(await db.from('tests').select('id, title, subject, book, units, time_limit_min, created_by, created_at').order('created_at', { ascending: false }))
    return NextResponse.json({
      tests: tests.map(t => {
        const mine = assigns.filter(a => a.test_id === t.id)
        const done = mine.filter(a => a.status === 'submitted')
        return { ...t, assigned: mine.length, submitted: done.length, avg: done.length ? Math.round(done.reduce((s, a) => s + (a.score ?? 0), 0) / done.length * 10) / 10 : null }
      }),
    })
  }
  const test = must<TestRow>(await db.from('tests').select('*').eq('id', id).single())
  const names = new Map(must<{ id: string; display_name: string; username: string }[]>(await db.from('students').select('id, display_name, username')).map(s => [s.id, s]))
  const mine = assigns.filter(a => a.test_id === id)
  const scores = mine.filter(a => a.status === 'submitted').map(a => a.score ?? 0)
  return NextResponse.json({
    test,
    assignments: mine.map(a => ({ ...a, name: names.get(a.student_id)?.display_name ?? '', username: names.get(a.student_id)?.username ?? '', percentile: a.status === 'submitted' ? percentile(a.score ?? 0, scores) : null })),
  })
})

type Body = { action?: 'create' | 'assign' | 'delete' | 'reset'; title?: string; book?: string; units?: string[]; count?: number; time_limit_min?: number; test_id?: string; student_ids?: string[]; due_date?: string; id?: string }

export const POST = handle(async req => {
  const me = await getStaffUser(req)
  if (!me) return forbidden()
  const b = await readJSON<Body>(req)
  if (!b) return fail('請求格式錯誤')
  const db = createServiceClient()

  if (b.action === 'create') {
    const book = b.book ?? ''
    const cat = catalog('數學', book)
    if (!cat) return fail('找不到這一冊的題目池（目前只有數學）')
    const units = (b.units ?? []).filter(u => cat.units.some(x => x.code === u))
    if (!units.length) return fail('請選擇至少一個單元')
    const count = Math.max(TEST_MIN, Math.min(TEST_MAX, Math.round(Number(b.count) || 20)))
    const slots: TypeSlot[] = cat.units.filter(u => units.includes(u.code)).flatMap(u => u.types.filter(t => t.code !== 'OTHER').map(t => ({
      unit: u.code, unitTitle: u.title, type: t.code, typeName: t.name, weight: typeWeight(cat, u.code, t.code), available: t.n,
    })))
    const plan = planTest(slots, count)
    const total = plan.reduce((n, p) => n + p.count, 0)
    const used = new Set<string>()
    const questions: TestQuestion[] = []
    let k = 0
    for (const { slot, count: c } of plan) {
      for (let i = 0; i < c; i++) {
        const [q] = drawFromPool('數學', { book, unit: slot.unit, type: slot.type }, 1, difficultyFor(k++, total), used)
        if (!q || used.has(q.id)) continue
        used.add(q.id)
        questions.push({ id: q.id, unit: slot.unit, unitTitle: slot.unitTitle, type: slot.type, typeName: slot.typeName, difficulty: q.difficulty,
          stem: q.stem, options: q.options, answer: q.answerIndex, cite: q.cite ?? '', answerStatus: q.answerStatus })
      }
    }
    if (questions.length < TEST_MIN) return fail('題目池的題目不夠，請多選幾個單元')
    // 依單元、再依難度由易到難排列
    questions.sort((a, b2) => a.unit.localeCompare(b2.unit, undefined, { numeric: true }) || a.difficulty - b2.difficulty)
    const title = (b.title ?? '').trim().slice(0, 60) || `${BOOK_NAME[book]}數學 程度檢測（${units.join('、')}）`
    const row = must<{ id: string }>(await db.from('tests').insert({
      title, subject: '數學', book, units, questions, time_limit_min: Math.max(5, Math.min(180, Math.round(Number(b.time_limit_min) || 40))), created_by: me.email,
    }).select('id').single())
    return NextResponse.json({ id: row.id, questions: questions.length })
  }
  if (b.action === 'assign') {
    if (!b.test_id || !b.student_ids?.length) return fail('請選擇檢測與學生')
    const rows = b.student_ids.slice(0, 500).map(student_id => ({ test_id: b.test_id, student_id, due_date: isDate(b.due_date) ? b.due_date : null }))
    // 已派過的不重複（unique test_id+student_id）
    must(await db.from('test_assignments').upsert(rows, { onConflict: 'test_id,student_id', ignoreDuplicates: true }))
    return NextResponse.json({ ok: true, assigned: rows.length })
  }
  if (b.action === 'reset') {   // 讓學生重考（清掉作答）
    if (!b.id) return fail('缺少 id')
    must(await db.from('test_assignments').update({ status: 'assigned', started_at: null, submitted_at: null, answers: null, score: null, result: null }).eq('id', b.id))
    return NextResponse.json({ ok: true })
  }
  if (b.action === 'delete') {
    if (!b.id) return fail('缺少 id')
    must(await db.from('tests').delete().eq('id', b.id))
    return NextResponse.json({ ok: true })
  }
  return fail('未知的 action')
})
