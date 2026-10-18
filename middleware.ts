import { NextResponse, type NextRequest } from 'next/server'

// 整站通行碼（選用，做法同 OLE-QS 的 web/proxy.ts）：
// 設了 SITE_ACCESS_CODE 時，裝置要先輸入一次通行碼（館方在平板上設定一次），沒有通行碼的人看不到頁面、也叫不到 API——
// 無人館用來擋館外的人使用、避免 AI 額度被外人消耗。沒設就不啟用。
async function sha256(s: string) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('')
}

export async function middleware(req: NextRequest) {
  const code = process.env.SITE_ACCESS_CODE
  if (!code) return NextResponse.next()
  if (req.cookies.get('sls_access')?.value === (await sha256(code))) return NextResponse.next()
  const { pathname, search } = req.nextUrl
  if (pathname.startsWith('/api/')) return NextResponse.json({ error: '這台裝置還沒輸入通行碼' }, { status: 401 })
  const url = new URL('/access', req.url)
  url.searchParams.set('next', pathname + search)
  return NextResponse.redirect(url)
}

export const config = {
  // 不攔：靜態檔、PWA 檔案、輸入通行碼的頁面與 API
  matcher: ['/((?!_next/|icons/|favicon|manifest.webmanifest|sw.js|access|api/access).*)'],
}
