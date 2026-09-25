import { NextResponse } from 'next/server'
import { generateRound } from '@/lib/question-gen'
import { getKnowledgePoints } from '@/lib/taxonomy'
import type { PlanItem } from '@/lib/types'

export const maxDuration = 60

const MAX_QUESTIONS = 20

export async function POST(req: Request) {
  let body: { plan?: PlanItem[]; prefer?: 'auto' | 'ai'; avoidStems?: string[]; grade?: string }
  try { body = await req.json() } catch { return NextResponse.json({ error: '請求格式錯誤' }, { status: 400 }) }

  const plan = (body.plan ?? []).filter(p =>
    p && typeof p.kp === 'string' && getKnowledgePoints(p.subject, p.chapter).includes(p.kp)
    && Number.isInteger(p.count) && p.count > 0 && [1, 2, 3].includes(p.difficulty))
  if (plan.length === 0) return NextResponse.json({ error: '出題範圍無效' }, { status: 400 })
  if (plan.reduce((s, p) => s + p.count, 0) > MAX_QUESTIONS) {
    return NextResponse.json({ error: `一波最多 ${MAX_QUESTIONS} 題` }, { status: 400 })
  }

  const result = await generateRound(plan, {
    prefer: body.prefer === 'ai' ? 'ai' : 'auto',
    avoidStems: Array.isArray(body.avoidStems) ? body.avoidStems.slice(-30) : [],
    grade: typeof body.grade === 'string' ? body.grade.slice(0, 10) : undefined,
  })
  return NextResponse.json(result)
}
