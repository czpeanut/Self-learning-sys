import { NextResponse } from 'next/server'
import { fail, handle, must, readJSON } from '@/lib/api-util'
import { notifyGuardians } from '@/lib/notify'
import { type TestQuestion, type TestResult, gradeTest, toPublic } from '@/lib/placement'
import { createServiceClient, getStudentUser } from '@/lib/server-auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// 學生的程度檢測：列出派給我的檢測、開始作答（題目不含答案）、交卷（伺服器批改）

type TestRow = { id: string; title: string; subject: string; book: string; units: string[]; questions: TestQuestion[]; time_limit_min: number }
type Assign = { id: string; test_id: string; student_id: string; status: 'assigned' | 'started' | 'submitted'; due_date: string | null; started_at: string | null; submitted_at: string | null; score: number | null; result: TestResult | null; answers: Record<string, number | null> | null }

export const GET = handle(async req => {
  const me = await getStudentUser(req)
  if (!me) return fail('請先用學生帳號登入', 401)
  const db = createServiceClient()
  const id = new URL(req.url).searchParams.get('id')
  const mine = must<Assign[]>(await db.from('test_assignments').select('*').eq('student_id', me.studentId))
  if (!id) {
    const tests = mine.length ? must<Omit<TestRow, 'questions'>[]>(await db.from('tests').select('id, title, subject, book, units, time_limit_min').in('id', mine.map(a => a.test_id))) : []
    return NextResponse.json({
      tests: mine.map(a => {
        const t = tests.find(x => x.id === a.test_id)
        return { id: a.id, title: t?.title ?? '', book: t?.book, time_limit_min: t?.time_limit_min, status: a.status, due_date: a.due_date, submitted_at: a.submitted_at, score: a.score, level: a.result?.level ?? null }
      }).sort((x, y) => (x.status === 'submitted' ? 1 : 0) - (y.status === 'submitted' ? 1 : 0)),
    })
  }
  const a = mine.find(x => x.id === id)
  if (!a) return fail('找不到這份檢測', 404)
  const t = must<TestRow>(await db.from('tests').select('*').eq('id', a.test_id).single())
  // 交卷前不給答案
  return NextResponse.json({
    assignment: { id: a.id, status: a.status, started_at: a.started_at, due_date: a.due_date, score: a.score, result: a.result, answers: a.answers },
    test: { title: t.title, subject: t.subject, book: t.book, time_limit_min: t.time_limit_min, questions: a.status === 'submitted' ? t.questions : t.questions.map(toPublic) },
  })
})

export const POST = handle(async req => {
  const me = await getStudentUser(req)
  if (!me) return fail('請先用學生帳號登入', 401)
  const b = await readJSON<{ id?: string; action?: 'start' | 'submit'; answers?: Record<string, number | null> }>(req)
  if (!b?.id) return fail('請求格式錯誤')
  const db = createServiceClient()
  const a = must<Assign | null>(await db.from('test_assignments').select('*').eq('id', b.id).eq('student_id', me.studentId).maybeSingle())
  if (!a) return fail('找不到這份檢測', 404)
  if (a.status === 'submitted') return fail('這份檢測已經交卷')

  if (b.action === 'start') {
    if (a.status === 'assigned') must(await db.from('test_assignments').update({ status: 'started', started_at: new Date().toISOString() }).eq('id', a.id))
    return NextResponse.json({ ok: true })
  }
  if (b.action === 'submit') {
    const t = must<TestRow>(await db.from('tests').select('*').eq('id', a.test_id).single())
    const answers: Record<string, number | null> = {}
    for (const q of t.questions) {
      const v = b.answers?.[q.id]
      answers[q.id] = typeof v === 'number' && Number.isInteger(v) && v >= 0 && v < q.options.length ? v : null
    }
    const result = gradeTest(t.questions, answers)
    must(await db.from('test_assignments').update({ status: 'submitted', submitted_at: new Date().toISOString(), answers, score: result.score, result }).eq('id', a.id))
    const name = me.displayName ?? me.username ?? '孩子'
    await notifyGuardians(db, me.studentId, 'test', {
      subject: `${name} 的程度檢測成績`,
      text: `📝 ${name} 完成「${t.title}」\n得分 ${result.score} 分（${result.level.label}），答對 ${result.correct}/${result.total} 題。` +
        (result.weaknesses.length ? `\n需要加強：${result.weaknesses.slice(0, 3).join('、')}` : ''),
    })
    return NextResponse.json({ result, questions: t.questions, answers })
  }
  return fail('未知的 action')
})
