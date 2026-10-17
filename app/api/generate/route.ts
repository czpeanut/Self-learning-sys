import { NextResponse } from 'next/server'
import { drawFromPool, findType } from '@/lib/pool'
import { generateRound } from '@/lib/question-gen'
import { getKnowledgePoints } from '@/lib/taxonomy'
import type { PlanItem } from '@/lib/types'

export const maxDuration = 60

const MAX_QUESTIONS = 20

export async function POST(req: Request) {
  let body: { plan?: PlanItem[]; prefer?: 'auto' | 'ai'; avoidStems?: string[]; grade?: string; seenQids?: string[] }
  try { body = await req.json() } catch { return NextResponse.json({ error: '請求格式錯誤' }, { status: 400 }) }

  const plan = (body.plan ?? []).filter(p =>
    p && typeof p.kp === 'string' && Number.isInteger(p.count) && p.count > 0 && [1, 2, 3].includes(p.difficulty)
    && (p.bank ? !!findType(p.subject, p.bank) : getKnowledgePoints(p.subject, p.chapter).includes(p.kp)))
  if (plan.length === 0) return NextResponse.json({ error: '出題範圍無效' }, { status: 400 })
  if (plan.reduce((s, p) => s + p.count, 0) > MAX_QUESTIONS) {
    return NextResponse.json({ error: `一波最多 ${MAX_QUESTIONS} 題` }, { status: 400 })
  }

  // 段考模式：題庫題（OLE-QS 真實段考題），不需要 AI
  const bankItems = plan.filter(p => p.bank)
  const seen = new Set((Array.isArray(body.seenQids) ? body.seenQids : []).slice(-3000).map(String))
  const bankQs = bankItems.flatMap(p => drawFromPool(p.subject, p.bank!, p.count, p.difficulty, seen))
  const rest = plan.filter(p => !p.bank)
  if (rest.length === 0) {
    const warnings = bankQs.length < bankItems.reduce((s, p) => s + p.count, 0) ? ['部分題型的題目不夠，題數比預定少'] : []
    return NextResponse.json({ questions: interleave(bankQs), usedAI: false, warnings })
  }

  const result = await generateRound(rest, {
    prefer: body.prefer === 'ai' ? 'ai' : 'auto',
    avoidStems: Array.isArray(body.avoidStems) ? body.avoidStems.slice(-30) : [],
    grade: typeof body.grade === 'string' ? body.grade.slice(0, 10) : undefined,
  })
  return NextResponse.json({ ...result, questions: interleave([...bankQs, ...result.questions]) })
}

/** 同題型的題目不要連在一起 */
function interleave<T extends { kp: string; chapter: string }>(qs: T[]): T[] {
  const groups = new Map<string, T[]>()
  for (const q of qs) { const k = q.chapter + q.kp; if (!groups.has(k)) groups.set(k, []); groups.get(k)!.push(q) }
  const lists = Array.from(groups.values())
  const out: T[] = []
  while (lists.some(l => l.length)) for (const l of lists) { const q = l.shift(); if (q) out.push(q) }
  return out
}
