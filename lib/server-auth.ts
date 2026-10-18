// API 端的身分驗證（伺服器端；前端畫面的權限控制不可信，一律在這裡再驗一次）

import { createClient } from '@supabase/supabase-js'
import { CLOUD, isAdminEmail, isStudentEmail, type Role } from './auth-shared'
import { cleanEnv } from './env'

const url = () => cleanEnv(process.env.NEXT_PUBLIC_SUPABASE_URL)
export const createServiceClient = () =>
  createClient(url(), cleanEnv(process.env.SUPABASE_SERVICE_ROLE_KEY), { auth: { persistSession: false, autoRefreshToken: false } })

const bearer = (req: Request) => (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '').trim()

/** 驗證 Bearer token 是有效的登入使用者 */
export async function getAuthedUser(req: Request): Promise<{ id: string; email: string | null } | null> {
  const token = bearer(req)
  if (!CLOUD || !token) return null
  const supa = createClient(url(), cleanEnv(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY), { auth: { persistSession: false } })
  const { data: { user }, error } = await supa.auth.getUser(token)
  if (error || !user) return null
  return { id: user.id, email: user.email ?? null }
}

export type Me = { role: Role; id: string; email: string | null; studentId?: string; username?: string; displayName?: string; grade?: string | null }

/** 判斷身分：帳密學生（students 表、未停用）／管理員（白名單或 staff 表 role=admin）／其他擋下 */
export async function resolveRole(user: { id: string; email: string | null }): Promise<Me> {
  const db = createServiceClient()
  if (isStudentEmail(user.email)) {
    const { data } = await db.from('students').select('id, username, display_name, grade, disabled').eq('user_id', user.id).maybeSingle()
    if (!data || data.disabled) return { role: 'blocked', id: user.id, email: user.email }
    return { role: 'student', id: user.id, email: user.email, studentId: data.id, username: data.username, displayName: data.display_name, grade: data.grade }
  }
  if (isAdminEmail(user.email)) return { role: 'admin', id: user.id, email: user.email }
  if (user.email) {
    const { data } = await db.from('staff').select('role, display_name').eq('email', user.email.toLowerCase()).maybeSingle()
    if (data?.role === 'admin') return { role: 'admin', id: user.id, email: user.email, displayName: data.display_name ?? undefined }
  }
  return { role: 'blocked', id: user.id, email: user.email }
}

export async function getAdminUser(req: Request): Promise<Me | null> {
  const u = await getAuthedUser(req)
  if (!u) return null
  const me = await resolveRole(u)
  return me.role === 'admin' ? me : null
}

/**
 * 需要登入的 API（AI 出題／詳解／評語）：雲端模式下只有登入的學生或管理員能用，避免 AI 額度被外人消耗。
 * 裝置帳號模式（沒設定 Supabase）不檢查，維持雛形行為（可另用 SITE_ACCESS_CODE 擋館外）。
 * 回傳 null＝通過；否則回傳錯誤訊息。
 */
export async function requireLogin(req: Request): Promise<string | null> {
  if (!CLOUD) return null
  const u = await getAuthedUser(req)
  if (!u) return '請先登入'
  const me = await resolveRole(u)
  return me.role === 'blocked' ? '這個帳號沒有使用權限' : null
}
