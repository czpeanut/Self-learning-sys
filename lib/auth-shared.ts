// 帳號共用規則（前後端都能用，只依賴 NEXT_PUBLIC_* 環境變數）；做法同 student-app lib/admin.ts

import { cleanEnv } from './env'

/** 有設定 Supabase → 雲端帳號＋雲端紀錄；沒設定 → 雛形的裝置帳號（lib/accounts.ts） */
export const CLOUD = !!cleanEnv(process.env.NEXT_PUBLIC_SUPABASE_URL) && !!cleanEnv(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)

// 館方發給學生的帳號，內部用合成 email 對應到 Supabase Auth；學生只輸入「帳號＋密碼」
export const STUDENT_EMAIL_DOMAIN = 'student.local'
export const usernameToEmail = (username: string) => `${username.trim().toLowerCase()}@${STUDENT_EMAIL_DOMAIN}`
export const isStudentEmail = (email?: string | null) => !!email && email.toLowerCase().endsWith(`@${STUDENT_EMAIL_DOMAIN}`)
/** 帳號：英數與 . _ -，3–30 碼 */
export const isValidUsername = (u: string) => /^[a-zA-Z0-9._-]{3,30}$/.test(u.trim())
export const MIN_PASSWORD = 6

/** 管理員 Google email 白名單（NEXT_PUBLIC_ADMIN_EMAILS，逗號分隔）；只用來控制畫面，權限一律在伺服器端再驗一次 */
export function isAdminEmail(email?: string | null): boolean {
  if (!email) return false
  return cleanEnv(process.env.NEXT_PUBLIC_ADMIN_EMAILS).toLowerCase().split(',').map(s => s.trim()).filter(Boolean).includes(email.toLowerCase())
}

/**
 * student＝帳密學生；admin＝館方管理員（Google，全部功能含收費帳務）；
 * teacher＝後台老師（Google，學生、檢測、成績單；不是館內現場老師）；blocked＝不在名單的帳號或已停用的學生
 */
export type Role = 'student' | 'admin' | 'teacher' | 'blocked'
export const isStaff = (r: Role | undefined) => r === 'admin' || r === 'teacher'
