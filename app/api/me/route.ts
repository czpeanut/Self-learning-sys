import { NextResponse } from 'next/server'
import { getAuthedUser, resolveRole } from '@/lib/server-auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// 目前登入者的身分（student／admin／blocked）與學生檔案；前端登入後呼叫一次
export async function GET(req: Request) {
  const u = await getAuthedUser(req)
  if (!u) return NextResponse.json({ error: '請先登入' }, { status: 401 })
  try {
    return NextResponse.json(await resolveRole(u))
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : '身分查詢失敗' }, { status: 500 })
  }
}
