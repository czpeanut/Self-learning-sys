'use client'

// 雲端登入／登出流程（Supabase Auth）：學生帳密、管理員 Google；做法同 student-app lib/auth-context.tsx

import { logout as clearCurrent } from './accounts'
import { usernameToEmail } from './auth-shared'
import type { Me } from './server-auth'
import { stopSync } from './cloud-sync'
import { supabase } from './supabase'

export type { Me }

export async function signInStudent(username: string, password: string): Promise<string | null> {
  if (!supabase) return '尚未設定雲端帳號'
  const { error } = await supabase.auth.signInWithPassword({ email: usernameToEmail(username), password })
  if (!error) return null
  return /fetch|network/i.test(error.message) ? '連不上伺服器，請檢查網路' : '帳號或密碼錯誤'
}

export async function signInAdminWithGoogle() {
  await supabase?.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: location.origin + '/admin' } })
}

export async function fetchMe(token: string): Promise<Me | { error: string }> {
  try {
    const res = await fetch('/api/me', { headers: { Authorization: `Bearer ${token}` } })
    const d = await res.json()
    return res.ok ? (d as Me) : { error: d.error ?? `HTTP ${res.status}` }
  } catch (e) {
    return { error: e instanceof Error ? e.message : '連線失敗' }
  }
}

/** 登出：先把紀錄傳上雲端、清掉這台裝置的快取，再登出 Supabase；回傳紀錄是否都已上傳 */
export async function cloudSignOut(): Promise<boolean> {
  const ok = await stopSync()
  clearCurrent()
  await supabase?.auth.signOut().catch(() => {})
  return ok
}

// Google 登入導回時 token 在網址 hash：模組載入時先快照（同 student-app lib/oauth-fragment.ts）
const INITIAL_FRAGMENT = typeof window !== 'undefined' ? window.location.hash.replace(/^#/, '') : ''
let fragmentHandled = false

/** 處理 Google 登入導回的 access_token；回傳錯誤訊息或 null */
export async function consumeOAuthFragment(): Promise<string | null> {
  if (!supabase || fragmentHandled || !INITIAL_FRAGMENT) return null
  fragmentHandled = true
  const p = new URLSearchParams(INITIAL_FRAGMENT)
  if (p.get('error')) return `${p.get('error')}: ${p.get('error_description') ?? ''}`
  const access_token = p.get('access_token')
  if (!access_token) return null
  const { error } = await supabase.auth.setSession({ access_token, refresh_token: p.get('refresh_token') ?? '' })
  window.history.replaceState(null, '', window.location.pathname)
  return error ? `登入失敗：${error.message}` : null
}
