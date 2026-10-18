'use client'

// 前端 Supabase client（沒設定 Supabase 時為 null，系統改用裝置帳號）

import { type SupabaseClient, createClient } from '@supabase/supabase-js'
import { CLOUD } from './auth-shared'
import { cleanEnv } from './env'

export const supabase: SupabaseClient | null = CLOUD
  ? createClient(cleanEnv(process.env.NEXT_PUBLIC_SUPABASE_URL), cleanEnv(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY), {
      auth: {
        // 同 student-app：Google 登入導回後由 LoginGate 明確呼叫 setSession，錯誤才看得到
        flowType: 'implicit',
        detectSessionInUrl: false,
        persistSession: true,
        storageKey: 'sls-auth',
      },
    })
  : null

/** 目前登入者的 access token（呼叫需要登入的 API 用） */
export async function accessToken(): Promise<string | null> {
  if (!supabase) return null
  const { data } = await supabase.auth.getSession()
  return data.session?.access_token ?? null
}

/** 帶登入憑證的 fetch（同 student-app lib/api.ts authFetch）；裝置帳號模式等同一般 fetch */
export async function authFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const token = await accessToken()
  const headers = new Headers(init.headers)
  if (token) headers.set('Authorization', `Bearer ${token}`)
  return fetch(input, { ...init, headers })
}
