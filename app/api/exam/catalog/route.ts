import { NextResponse } from 'next/server'
import { bankBlocked, catalog } from '@/lib/pool'

// 某冊的題型目錄與段考頻率（不含題目）
export async function GET(req: Request) {
  const p = new URL(req.url).searchParams
  const blocked = bankBlocked()
  if (blocked) return NextResponse.json({ error: blocked }, { status: 503 })
  const c = catalog(p.get('subject') ?? '數學', p.get('book') ?? '')
  if (!c) return NextResponse.json({ error: '這一冊目前沒有題庫資料（題目池要先建置：npm run bank）' }, { status: 404 })
  return NextResponse.json(c, { headers: { 'Cache-Control': 'public, max-age=3600' } })
}
