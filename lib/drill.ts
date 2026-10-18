// ── 弱項特訓：錯題與弱項題型的重複練習（純函式） ────────────────────
//
// 做法與研究依據：
//  - 練到「達標」才停（criterion learning）：同一題型在這次特訓中「連續答對 3 題」才算達標。
//    Rawson & Dunlosky（2011）建議練到答對 3 次，再隔天重新練一次（successive relearning）；
//    達標的題型之後由錯題本的間隔複習接手。
//  - 原題重做＋同題型變化題（提取練習：Roediger & Karpicke 2006）：每波先重做 1 題錯題本原題，
//    其餘出同題型新題，避免只是記住答案。
//  - 鷹架：一開始降一級難度，連對升級、全錯再降（下一波系統會自動降低出錯題型的難度）。
//  - 原地打轉防護（Beck & Gong 2013）：這次已練 6 題以上、正確率低於 40% 還沒達標 → 停止這個題型，
//    改看 AI 講解，不再硬刷題。

import { difficultyForScore } from './engine'
import type { BankRef, Difficulty, DrillTarget, KPMastery, KPRef, PlanItem, Question, Session, WrongItem } from './types'
import { kpKey } from './types'

export const DRILL_STREAK = 3
export const DRILL_MAX_ROUNDS = 5
export const DRILL_MAX_TARGETS = 6
const STUCK_MIN = 6
const STUCK_ACC = 0.4
const WEAK_SCORE = 60

/** 題庫題的位置：題目本身的 origin，或掌握度紀錄建立時帶進來的 */
function bankOf(x: { bank?: BankRef; origin?: BankRef }): BankRef | undefined {
  const b = x.bank ?? x.origin
  return b ? { book: b.book, unit: b.unit, type: b.type } : undefined
}

/** 列出可以特訓的題型：錯題本裡還沒克服的錯題 ＋ 掌握度偏低的知識點／題型，依優先度排序 */
export function drillTargets(input: { wrongBook: WrongItem[]; mastery: Record<string, KPMastery>; now?: number }): DrillTarget[] {
  const now = input.now ?? Date.now()
  const map = new Map<string, DrillTarget & { due: number }>()
  const get = (ref: KPRef, score: number) => {
    const k = kpKey(ref)
    let t = map.get(k)
    if (!t) {
      t = { subject: ref.subject, chapter: ref.chapter, kp: ref.kp, bank: ref.bank, wrongIds: [], reasons: [], score, priority: 0, due: 0 }
      map.set(k, t)
    }
    return t
  }

  for (const w of input.wrongBook) {
    if (w.resolved || w.question.demo) continue
    const q = w.question
    const t = get({ subject: q.subject, chapter: q.chapter, kp: q.kp, bank: bankOf(q) }, input.mastery[kpKey(q)]?.score ?? 50)
    t.wrongIds.push(q.id)
    if (w.nextReviewAt <= now) t.due++
  }
  for (const m of Object.values(input.mastery)) {
    if (m.attempts < 2 || m.score >= WEAK_SCORE) continue
    get({ subject: m.subject, chapter: m.chapter, kp: m.kp, bank: bankOf(m as KPMastery & { origin?: BankRef }) }, m.score)
  }

  return Array.from(map.values()).map(({ due, ...t }) => {
    const m = input.mastery[kpKey(t)]
    const recentWrong = m ? m.recent.filter(c => !c).length : 0
    if (t.wrongIds.length) t.reasons.push(`錯題 ${t.wrongIds.length} 題${due ? `（${due} 題到期）` : ''}`)
    if (m && m.attempts >= 2) t.reasons.push(`掌握度 ${Math.round(m.score)}`)
    if (m && m.recent.length >= 3) t.reasons.push(`最近 ${m.recent.length} 題錯 ${recentWrong} 題`)
    t.priority = Math.round(15 * Math.min(t.wrongIds.length, 5) + 10 * due + (100 - t.score) + 8 * recentWrong)
    return t
  }).sort((a, b) => b.priority - a.priority)
}

export type DrillStatus = 'new' | 'working' | 'passed' | 'stuck'
export type DrillProgress = DrillTarget & {
  key: string
  attempts: number
  correct: number
  /** 目前連續答對幾題（從最後一題往回算） */
  streak: number
  status: DrillStatus
  lastRound: { attempts: number; correct: number }
}

/** 特訓中每個目標的進度 */
export function drillProgress(session: Session): DrillProgress[] {
  const targets = session.drill?.targets ?? []
  const rows = new Map<string, DrillProgress & { history: boolean[] }>()
  for (const t of targets) {
    rows.set(kpKey(t), { ...t, key: kpKey(t), attempts: 0, correct: 0, streak: 0, status: 'new', lastRound: { attempts: 0, correct: 0 }, history: [] })
  }
  session.rounds.forEach((r, ri) => {
    const byId = new Map(r.questions.map(q => [q.id, q]))
    for (const a of r.answers) {
      const q = byId.get(a.questionId)
      const row = q && rows.get(kpKey(q))
      if (!row) continue
      row.attempts++
      if (a.correct) row.correct++
      row.history.push(a.correct)
      if (ri === session.rounds.length - 1) { row.lastRound.attempts++; if (a.correct) row.lastRound.correct++ }
    }
  })
  return Array.from(rows.values()).map(({ history, ...row }) => {
    let streak = 0
    for (let i = history.length - 1; i >= 0 && history[i]; i--) streak++
    const status: DrillStatus = streak >= DRILL_STREAK ? 'passed'
      : row.attempts >= STUCK_MIN && row.correct / row.attempts < STUCK_ACC ? 'stuck'
      : row.attempts ? 'working' : 'new'
    return { ...row, streak, status }
  })
}

/** 規劃特訓的下一波；全部達標（或卡住）或到上限波數就結束 */
export function planDrillRound(session: Session, wrongBook: WrongItem[]): { plan: PlanItem[] } | { done: NonNullable<Session['endReason']> } {
  if (session.rounds.length >= DRILL_MAX_ROUNDS) return { done: 'max-rounds' }
  const progress = drillProgress(session)
  const open = progress.filter(p => p.status === 'new' || p.status === 'working')
  if (open.length === 0) return { done: 'all-passed' }

  const used = new Set(session.rounds.flatMap(r => r.questions.map(q => q.id)))
  const book = new Map(wrongBook.filter(w => !w.resolved).map(w => [w.question.id, w.question]))
  const lastRound = session.rounds[session.rounds.length - 1]
  const plan: PlanItem[] = []
  for (const p of open.slice(0, DRILL_MAX_TARGETS)) {
    const count = p.attempts === 0 ? DRILL_STREAK : Math.max(2, DRILL_STREAK - p.streak)
    // 鷹架：第一波降一級；上一波全對升一級、全錯降一級
    const base = difficultyForScore(p.score)
    let difficulty: Difficulty = p.attempts === 0 ? Math.max(1, base - 1) as Difficulty : base
    if (p.lastRound.attempts > 0) {
      const prevItem = lastRound?.plan.find(x => kpKey(x) === p.key)
      const prev = prevItem?.difficulty ?? base
      if (p.lastRound.correct === p.lastRound.attempts) difficulty = Math.min(3, prev + 1) as Difficulty
      else if (p.lastRound.correct === 0) difficulty = Math.max(1, prev - 1) as Difficulty
      else difficulty = prev
    }
    const retry = p.wrongIds.filter(id => !used.has(id) && book.has(id)).slice(0, 1)
    const wrongLast: Question[] = lastRound
      ? lastRound.questions.filter(q => kpKey(q) === p.key && lastRound.answers.some(a => a.questionId === q.id && !a.correct))
      : []
    const variantSrc = wrongLast.length ? wrongLast : retry.map(id => book.get(id)!)
    let reason: string
    if (p.attempts === 0) reason = `${p.reasons.join('、') || '弱項'}：先從${difficulty === 1 ? '基礎' : '標準'}題開始`
    else if (p.lastRound.correct === 0) reason = `上一波全錯，降低難度再練（連續答對 ${p.streak}/${DRILL_STREAK}）`
    else reason = `連續答對 ${p.streak}/${DRILL_STREAK}，再 ${count} 題`
    if (retry.length) reason += '；含 1 題錯題本原題重做'
    plan.push({
      subject: p.subject, chapter: p.chapter, kp: p.kp, bank: p.bank, difficulty, count, reason,
      retry: retry.length ? retry : undefined,
      variantsOf: variantSrc.slice(0, count).map(q => ({ id: q.id, stem: q.stem })),
    })
  }
  return { plan }
}
