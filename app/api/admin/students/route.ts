import { NextResponse } from 'next/server'
import { MIN_PASSWORD, isValidUsername, usernameToEmail } from '@/lib/auth-shared'
import { createServiceClient, getAdminUser } from '@/lib/server-auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// 館方管理學生帳號（做法同 student-app app/api/admin/students）：
// 帳號＋密碼由 Supabase Auth 保存（bcrypt 雜湊，不存明文），students 表放姓名、年級、停用狀態。

const forbidden = () => NextResponse.json({ error: '無管理員權限' }, { status: 403 })
type Activity = { date: string; answered: number; correct: number }

/** 學生列表＋近 7 天練習量（從雲端紀錄的 activity 列算） */
export async function GET(req: Request) {
  if (!(await getAdminUser(req))) return forbidden()
  const db = createServiceClient()
  const { data, error } = await db.from('students').select('id, user_id, username, display_name, grade, disabled, created_at').order('created_at', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const { data: acts } = await db.from('student_store').select('user_id, value, updated_at').eq('key', 'activity')
  const since = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10)
  const byUser = new Map((acts ?? []).map(a => [a.user_id as string, a]))
  const students = (data ?? []).map(s => {
    const a = byUser.get(s.user_id)
    const days = Array.isArray(a?.value) ? (a!.value as Activity[]) : []
    const recent = days.filter(d => d.date >= since)
    return {
      ...s,
      last_active: days.length ? days[days.length - 1].date : null,
      week_answered: recent.reduce((n, d) => n + (d.answered || 0), 0),
      week_days: recent.filter(d => d.answered > 0).length,
    }
  })
  return NextResponse.json({ students })
}

type NewStudent = { username?: string; password?: string; display_name?: string; grade?: string }

/** 建立學生帳號（可一次多筆）；每筆各自回報成功或失敗 */
export async function POST(req: Request) {
  if (!(await getAdminUser(req))) return forbidden()
  let body: { students?: NewStudent[] }
  try { body = await req.json() } catch { return NextResponse.json({ error: '請求格式錯誤' }, { status: 400 }) }
  const list = (body.students ?? []).slice(0, 200)
  if (!list.length) return NextResponse.json({ error: '沒有要建立的帳號' }, { status: 400 })
  const db = createServiceClient()
  const results: { username: string; ok: boolean; error?: string }[] = []
  for (const n of list) {
    const username = (n.username ?? '').trim().toLowerCase()
    const password = n.password ?? ''
    const display_name = (n.display_name ?? '').trim().slice(0, 30) || username
    const grade = (n.grade ?? '').trim().slice(0, 10) || null
    if (!isValidUsername(username)) { results.push({ username, ok: false, error: '帳號限英數與 . _ -，3–30 碼' }); continue }
    if (password.length < MIN_PASSWORD) { results.push({ username, ok: false, error: `密碼至少 ${MIN_PASSWORD} 碼` }); continue }
    const { data: exists } = await db.from('students').select('id').eq('username', username).maybeSingle()
    if (exists) { results.push({ username, ok: false, error: '帳號已存在' }); continue }
    const { data: created, error: authErr } = await db.auth.admin.createUser({
      email: usernameToEmail(username), password, email_confirm: true, user_metadata: { full_name: display_name, username },
    })
    if (authErr || !created.user) { results.push({ username, ok: false, error: authErr?.message ?? '建立失敗' }); continue }
    const { error: insErr } = await db.from('students').insert({ user_id: created.user.id, username, display_name, grade })
    if (insErr) {
      await db.auth.admin.deleteUser(created.user.id)   // 回滾，避免孤兒帳號
      results.push({ username, ok: false, error: insErr.message }); continue
    }
    results.push({ username, ok: true })
  }
  return NextResponse.json({ results })
}

/** 修改姓名／年級、重設密碼、停用或啟用 */
export async function PATCH(req: Request) {
  if (!(await getAdminUser(req))) return forbidden()
  let body: { id?: string; display_name?: string; grade?: string; password?: string; disabled?: boolean }
  try { body = await req.json() } catch { return NextResponse.json({ error: '請求格式錯誤' }, { status: 400 }) }
  if (!body.id) return NextResponse.json({ error: '缺少學生 id' }, { status: 400 })
  const db = createServiceClient()
  const { data: s } = await db.from('students').select('user_id').eq('id', body.id).maybeSingle()
  if (!s) return NextResponse.json({ error: '找不到這位學生' }, { status: 404 })
  if (body.password != null) {
    if (body.password.length < MIN_PASSWORD) return NextResponse.json({ error: `密碼至少 ${MIN_PASSWORD} 碼` }, { status: 400 })
    const { error } = await db.auth.admin.updateUserById(s.user_id, { password: body.password })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }
  const patch: Record<string, unknown> = {}
  if (body.display_name != null) patch.display_name = body.display_name.trim().slice(0, 30)
  if (body.grade != null) patch.grade = body.grade.trim().slice(0, 10) || null
  if (body.disabled != null) patch.disabled = !!body.disabled
  if (Object.keys(patch).length) {
    const { error } = await db.from('students').update(patch).eq('id', body.id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}

/** 刪除帳號（連同雲端學習紀錄，無法復原） */
export async function DELETE(req: Request) {
  if (!(await getAdminUser(req))) return forbidden()
  const id = new URL(req.url).searchParams.get('id')
  if (!id) return NextResponse.json({ error: '缺少學生 id' }, { status: 400 })
  const db = createServiceClient()
  const { data: s } = await db.from('students').select('user_id').eq('id', id).maybeSingle()
  if (!s) return NextResponse.json({ error: '找不到這位學生' }, { status: 404 })
  // students、student_store 都設了 on delete cascade，刪 auth 使用者即全部刪除
  const { error } = await db.auth.admin.deleteUser(s.user_id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
