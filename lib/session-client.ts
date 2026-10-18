'use client'

// 前端的 session 流程控制：建立 session、向 API 要題目、收尾計算報告所需的掌握度快照。

import { DRILL_MAX_ROUNDS, planDrillRound } from './drill'
import { planNextRound } from './engine'
import { dueReviews, getAttempts, getMasteryMap, getProfile, getWrongBook, saveSession } from './storage'
import type { DrillTarget, ExamTarget, KPRef, PlanItem, Question, Round, Session, SessionSettings } from './types'
import { kpKey } from './types'
import { authFetch } from './supabase'

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

/** 段考衝刺：範圍＝題型（KPRef 帶題庫位置），由自適應引擎依缺口分配題數 */
export function createExamSession(exam: ExamTarget, scope: KPRef[], settings: SessionSettings, goal?: string): Session {
  const s: Session = {
    id: newId(), mode: 'practice', subject: exam.subject, scope, settings, rounds: [],
    masteryBefore: snapshot(scope), status: 'active', createdAt: Date.now(), goal: goal || undefined, exam,
  }
  saveSession(s)
  return s
}

/** 弱項特訓：選定的題型重複練到連續答對（lib/drill.ts） */
export function createDrillSession(targets: DrillTarget[]): Session {
  const scope: KPRef[] = targets.map(t => ({ subject: t.subject, chapter: t.chapter, kp: t.kp, bank: t.bank }))
  const subjects = new Set(targets.map(t => t.subject))
  const s: Session = {
    id: newId(), mode: 'drill', subject: subjects.size === 1 ? targets[0].subject : '綜合', scope,
    settings: { ...getProfile().defaults, maxRounds: DRILL_MAX_ROUNDS, difficulty: 'adaptive' },
    rounds: [], masteryBefore: snapshot(scope), status: 'active', createdAt: Date.now(), drill: { targets },
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
  // 弱項特訓：要重做的錯題本原題直接從本機取，其餘題數才向 API 要
  const book = new Map(getWrongBook().map(w => [w.question.id, w.question]))
  const retried: Question[] = plan.flatMap(p => (p.retry ?? []).map(id => book.get(id)).filter((q): q is Question => !!q).map(q => ({ ...q, source: 'review' as const })))
  const need = plan
    .map(p => ({ ...p, count: p.count - (p.retry ?? []).filter(id => book.has(id)).length, retry: undefined }))
    .filter(p => p.count > 0)
  const round = (questions: Question[]): Round => ({ index: session.rounds.length + 1, plan, questions, answers: [], startedAt: Date.now() })
  if (need.length === 0) return { round: round(retried), warnings: [], usedAI: false }

  const avoidStems = session.rounds.flatMap(r => r.questions.map(q => q.stem))
  const res = await authFetch('/api/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      plan: need, prefer, avoidStems, grade: getProfile().grade,
      // 題庫題：本次已出過的＋以前做過的，優先出新題
      seenQids: need.some(p => p.bank)
        ? Array.from(new Set([...session.rounds.flatMap(r => r.questions.map(q => q.origin?.qid).filter(Boolean) as string[]), ...getAttempts().map(a => a.qid)])).slice(-3000)
        : undefined,
    }),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error ?? '出題失敗')
  // 錯題本原題先做，之後才是同題型新題
  const fresh: Question[] = data.questions
  const questions = retried.length ? [...retried, ...fresh.filter(q => !retried.some(r => r.id === q.id))] : fresh
  return {
    round: round(questions),
    warnings: data.warnings ?? [],
    usedAI: !!data.usedAI,
  }
}

/** 下一步：回傳下一波計畫或結束原因 */
export function nextStep(session: Session) {
  if (session.mode === 'review') return { done: 'max-rounds' as const }
  if (session.mode === 'drill') return planDrillRound(session, getWrongBook())
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
