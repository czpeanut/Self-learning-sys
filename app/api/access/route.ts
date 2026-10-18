import { createHash } from 'crypto'
import { NextResponse } from 'next/server'

// 輸入通行碼 → 寫入 cookie（一年有效：館內平板設定一次即可）
export async function POST(req: Request) {
  const want = process.env.SITE_ACCESS_CODE ?? ''
  let code = ''
  try { code = String((await req.json()).code ?? '') } catch { /* 空白 */ }
  if (!want || code !== want) return NextResponse.json({ error: '通行碼不對' }, { status: 401 })
  const res = NextResponse.json({ ok: true })
  res.cookies.set('sls_access', createHash('sha256').update(want).digest('hex'),
    { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', maxAge: 60 * 60 * 24 * 365, path: '/' })
  return res
}
