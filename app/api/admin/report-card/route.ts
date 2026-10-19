import { NextResponse } from 'next/server'
import { fail, forbidden, handle, must } from '@/lib/api-util'
import { taipeiDate } from '@/lib/notify'
import { type TestResult, levelOf, percentile } from '@/lib/placement'
import { createServiceClient, getStaffUser } from '@/lib/server-auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// 學生學習程度成績單：程度檢測成績（含同卷百分等級）＋區間內的練習量、正確率、各章掌握度＋到館紀錄

type Activity = { date: string; answered: number; correct: number; minutes: number }
type Mastery = { subject: string; chapter: string; kp: string; score: number; attempts: number }

export const GET = handle(async req => {
  if (!(await getStaffUser(req))) return forbidden()
  const url = new URL(req.url)
  const id = url.searchParams.get('student')
  if (!id) return fail('缺少學生')
  const to = url.searchParams.get('to') ?? taipeiDate()
  const from = url.searchParams.get('from') ?? new Date(Date.parse(to) - 29 * 86400000).toISOString().slice(0, 10)
  const db = createServiceClient()
  const s = must<{ id: string; user_id: string; username: string; display_name: string; grade: string | null; school: string | null }>(
    await db.from('students').select('id, user_id, username, display_name, grade, school').eq('id', id).single())

  // 程度檢測
  const assigns = must<{ test_id: string; score: number | null; submitted_at: string | null; result: TestResult | null; status: string }[]>(
    await db.from('test_assignments').select('test_id, score, submitted_at, result, status').eq('student_id', id).eq('status', 'submitted'))
  const testIds = assigns.map(a => a.test_id)
  const tests = testIds.length ? must<{ id: string; title: string; book: string }[]>(await db.from('tests').select('id, title, book').in('id', testIds)) : []
  const peers = testIds.length ? must<{ test_id: string; score: number | null }[]>(await db.from('test_assignments').select('test_id, score').in('test_id', testIds).eq('status', 'submitted')) : []
  const testRows = assigns.map(a => {
    const t = tests.find(x => x.id === a.test_id)
    const all = peers.filter(p => p.test_id === a.test_id).map(p => p.score ?? 0)
    return {
      title: t?.title ?? '', date: a.submitted_at?.slice(0, 10) ?? '', score: a.score ?? 0, level: a.result?.level ?? levelOf(a.score ?? 0),
      correct: a.result?.correct ?? 0, total: a.result?.total ?? 0, percentile: percentile(a.score ?? 0, all), takers: all.length,
      byUnit: a.result?.byUnit ?? [], strengths: a.result?.strengths ?? [], weaknesses: a.result?.weaknesses ?? [],
    }
  }).sort((x, y) => y.date.localeCompare(x.date))

  // 練習（雲端紀錄 student_store）
  const rows = must<{ key: string; value: unknown }[]>(await db.from('student_store').select('key, value').eq('user_id', s.user_id).in('key', ['activity', 'profile']))
  const mrows = must<{ key: string; value: unknown }[]>(await db.from('student_store').select('key, value').eq('user_id', s.user_id).like('key', 'mastery/%'))
  const activity = ((rows.find(r => r.key === 'activity')?.value ?? []) as Activity[]).filter(d => d.date >= from && d.date <= to)
  const answered = activity.reduce((n, d) => n + (d.answered || 0), 0)
  const correct = activity.reduce((n, d) => n + (d.correct || 0), 0)
  const chapters = new Map<string, { subject: string; chapter: string; sum: number; n: number; kps: number; weak: string[] }>()
  for (const r of mrows) {
    const m = r.value as Mastery
    if (!m || !m.attempts) continue
    const k = `${m.subject}|${m.chapter}`
    const c = chapters.get(k) ?? { subject: m.subject, chapter: m.chapter, sum: 0, n: 0, kps: 0, weak: [] }
    c.sum += m.score; c.n++; c.kps++
    if (m.score < 55) c.weak.push(m.kp)
    chapters.set(k, c)
  }

  // 到館
  const att = must<{ date: string; check_in_at: string; check_out_at: string | null; summary: { focusMinutes?: number } | null }[]>(
    await db.from('attendance').select('date, check_in_at, check_out_at, summary').eq('student_id', id).gte('date', from).lte('date', to))
  const stayMin = att.reduce((n, a) => n + (a.check_out_at ? Math.round((Date.parse(a.check_out_at) - Date.parse(a.check_in_at)) / 60000) : 0), 0)
  const focusMin = att.reduce((n, a) => n + (a.summary?.focusMinutes ?? 0), 0)

  return NextResponse.json({
    student: { name: s.display_name, username: s.username, grade: s.grade, school: s.school },
    range: { from, to },
    tests: testRows,
    practice: {
      answered, correct, accuracy: answered ? correct / answered : null, days: activity.filter(d => d.answered > 0).length,
      minutes: Math.round(activity.reduce((n, d) => n + (d.minutes || 0), 0)),
      chapters: Array.from(chapters.values()).map(c => ({ subject: c.subject, chapter: c.chapter, score: Math.round(c.sum / c.n), kps: c.kps, weak: c.weak.slice(0, 4) })).sort((a, b) => a.score - b.score),
    },
    attendance: { days: att.length, stayMinutes: stayMin, focusMinutes: focusMin },
  })
})
