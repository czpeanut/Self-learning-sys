// API 共用小工具（伺服器端）
import { NextResponse } from 'next/server'

export const fail = (error: string, status = 400) => NextResponse.json({ error }, { status })
export const forbidden = () => fail('沒有權限', 403)
export async function readJSON<T>(req: Request): Promise<T | null> {
  try { return (await req.json()) as T } catch { return null }
}
/** Supabase 查詢結果：有錯就丟出（由 route 轉成 500） */
export function must<T>(r: { data: T | null; error: { message: string } | null }): T {
  if (r.error) throw new Error(r.error.message)
  return (r.data ?? ([] as unknown)) as T
}
export const isMonth = (s: string | null): s is string => !!s && /^\d{4}-\d{2}$/.test(s)
export const isDate = (s: unknown): s is string => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s)
/** route 包一層：未預期的錯誤 → 500 JSON */
export function handle(fn: (req: Request) => Promise<Response>) {
  return async (req: Request) => {
    try { return await fn(req) } catch (e) { return fail(e instanceof Error ? e.message : String(e), 500) }
  }
}
