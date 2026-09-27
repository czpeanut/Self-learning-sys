// 簡易限流（無人館沒人盯著，避免單一裝置狂按 AI 詳解燒額度）
// ⚠️ 記憶體版：Serverless 多個實例各算各的，只能擋明顯濫用；正式版改用 Supabase／Redis 以帳號計數。

const buckets = new Map<string, number[]>()

export function rateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now()
  const hits = (buckets.get(key) ?? []).filter(t => now - t < windowMs)
  if (hits.length >= limit) { buckets.set(key, hits); return false }
  hits.push(now)
  buckets.set(key, hits)
  if (buckets.size > 5000) buckets.clear()
  return true
}

export function clientKey(req: Request): string {
  return req.headers.get('x-forwarded-for')?.split(',')[0].trim() || req.headers.get('x-real-ip') || 'local'
}
