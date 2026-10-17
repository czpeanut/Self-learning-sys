import { NextResponse } from 'next/server'
import scopes from '@/lib/data/exam-scopes.json'
import { examUnits, type ScopeData } from '@/lib/exam'

// 某次段考的各單元出現率（OLE-QS 真實段考卷統計）
export async function GET(req: Request) {
  const p = new URL(req.url).searchParams
  const r = examUnits(scopes as ScopeData, p.get('subject') ?? '', Number(p.get('grade')), Number(p.get('semester')),
    Number(p.get('seq')), p.get('publisher') ?? '')
  if (!r) return NextResponse.json({ error: '沒有這次段考的統計資料' }, { status: 404 })
  return NextResponse.json({ ...r, source: (scopes as ScopeData).source }, { headers: { 'Cache-Control': 'public, max-age=3600' } })
}
