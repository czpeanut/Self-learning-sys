'use client'

// 前端的 session 流程控制：建立 session、向 API 要題目、收尾計算報告所需的掌握度快照。

import { planNextRound } from './engine'
import { dueReviews, getMasteryMap, getProfile, saveSession } from './storage'
import type { KPRef, PlanItem, Question, Round, Session, SessionSettings } from './types'
import { kpKey } from './types'

export const newId = () => Math.random().toString(36).slice(2, 8) + Date.now().toString(36)

function snapshot(scope: KPRef[]): Record<string, number> {
  const m = getMasteryMap()
  const out: Record<string, number> = {}
  for (const r of scope) out[kpKey(r)] = m[kpKey(r)]?.score ?? 50
  return out
}

export function createPracticeSession(subject: string, scope: KPRef[], settings: SessionSettings, goal?: string): Session {
  const s: Session = {
    id: newId(), mode: 'practice', subject, scope, settings, rounds: [],
    masteryBefore: snapshot(scope), status: 'active', createdAt: Date.now(), goal: goal || undefined,
  }
  saveSession(s)
  return s
}

/** 複習模式：直接用錯題本中「到期」的原題，一波做完（不需要 AI） */
export function createReviewSession(limit = 15): Session | null {
  const due = dueReviews().sort((a, b) => a.nextReviewAt - b.nextReviewAt).slice(0, limit)
  if (due.length === 0) return null
  const questions: Question[] = due.map(w => ({ ...w.question, source: 'review' as const }))
  const scopeMap = new Map<string, KPRef>()
  for (const q of questions) scopeMap.set(kpKey(q), { subject: q.subject, chapter: q.chapter, kp: q.kp })
  const scope = Array.from(scopeMap.values())
  const settings = { ...getProfile().defaults, maxRounds: 1, questionsPerRound: questions.length }
  const round: Round = {
    index: 1, questions, answers: [], startedAt: Date.now(),
    plan: scope.map(r => ({ ...r, difficulty: 2, count: questions.filter(q => kpKey(q) === kpKey(r)).length, reason: '錯題到期複習' })),
  }
  const s: Session = {
    id: newId(), mode: 'review', subject: scope.length && new Set(scope.map(r => r.subject)).size === 1 ? scope[0].subject : '綜合',
    scope, settings, rounds: [round], masteryBefore: snapshot(scope), status: 'active', createdAt: Date.now(),
  }
  saveSession(s)
  return s
}

export async function fetchRound(session: Session, plan: PlanItem[], prefer: 'auto' | 'ai' = 'auto'): Promise<{ round: Round; warnings: string[]; usedAI: boolean }> {
  const avoidStems = session.rounds.flatMap(r => r.questions.map(q => q.stem))
  const res = await fetch('/api/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ plan, prefer, avoidStems, grade: getProfile().grade }),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error ?? '出題失敗')
  return {
    round: { index: session.rounds.length + 1, plan, questions: data.questions, answers: [], startedAt: Date.now() },
    warnings: data.warnings ?? [],
    usedAI: !!data.usedAI,
  }
}

/** 下一步：回傳下一波計畫或結束原因 */
export function nextStep(session: Session) {
  if (session.mode === 'review') return { done: 'max-rounds' as const }
  return planNextRound(session, getMasteryMap())
}

export function finishSession(session: Session, reason: NonNullable<Session['endReason']>): Session {
  const done: Session = {
    ...session, status: 'finished', finishedAt: Date.now(), endReason: reason,
    masteryAfter: snapshot(session.scope),
  }
  saveSession(done)
  return done
}
