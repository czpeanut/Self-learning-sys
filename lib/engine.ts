// ── 自適應練習引擎（純函式，前後端都能用） ──────────────────────
//
// 1. 掌握度模型：類 Elo。每個知識點一個 0–100 的分數，題目依難度有一個「門檻分」。
//    答對的「意外程度」越高（低分學生答對難題）加越多；答錯簡單題扣越多。
//    再依把握度/是否看提示打折，避免「猜對」把分數灌高。
// 2. 出題規劃：依「掌握度低、剛答錯、尚未練過」加權分配下一波題數，
//    剛答錯的題目會要求 AI 出「變化題」（同觀念換數字/情境）。
// 3. 結束條件：範圍內每個知識點都過關（分數達標且本次最近兩題連對），或達到最大波數。

import type {
  Answer, Difficulty, ErrorType, KPMastery, KPRef, PlanItem, Question, Session, SessionSettings,
} from './types'
import { kpKey } from './types'

export const INITIAL_SCORE = 50
const DIFFICULTY_RATING: Record<Difficulty, number> = { 1: 35, 2: 60, 3: 85 }

const clamp = (v: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, v))

/** 依目前分數，預估答對某難度題目的機率 */
export function expectedCorrect(score: number, difficulty: Difficulty): number {
  return 1 / (1 + Math.exp(-(score - DIFFICULTY_RATING[difficulty]) / 12))
}

export function newMastery(ref: KPRef): KPMastery {
  return { ...ref, score: INITIAL_SCORE, attempts: 0, correct: 0, lastPracticedAt: 0, recent: [] }
}

/** 作答一次後更新掌握度 */
export function updateMastery(m: KPMastery, q: Question, a: Answer, now = Date.now()): KPMastery {
  const p = expectedCorrect(m.score, q.difficulty)
  const k = m.attempts < 5 ? 24 : 16              // 新知識點收斂快一點
  let delta: number
  if (a.correct) {
    let factor = 1
    if (a.confidence === 'guess') factor *= 0.3
    else if (a.confidence === 'unsure') factor *= 0.7
    if (a.usedHint) factor *= 0.5
    delta = k * (1 - p) * factor
  } else {
    // 有把握卻錯：觀念有問題，多扣一點
    const factor = a.confidence === 'sure' ? 1.2 : 1
    delta = -k * p * factor
  }
  return {
    ...m,
    score: Math.round(clamp(m.score + delta) * 10) / 10,
    attempts: m.attempts + 1,
    correct: m.correct + (a.correct ? 1 : 0),
    lastPracticedAt: now,
    recent: [...m.recent, a.correct].slice(-5),
  }
}

/**
 * 錯誤類型判斷：
 *  - 自己標「用猜的」→ 猜題
 *  - 有把握 + 作答時間 < 建議時間 25% → 粗心
 *  - 有把握 → 觀念錯誤
 *  - 其他 → 不熟練
 */
export function diagnoseError(a: Answer, secondsPerQuestion: number): ErrorType | undefined {
  if (a.correct) return undefined
  if (a.confidence === 'guess' || a.chosen === null) return 'guess'
  const fastMs = (secondsPerQuestion || 90) * 1000 * 0.25
  if (a.confidence === 'sure' && a.timeMs < fastMs) return 'careless'
  if (a.confidence === 'sure') return 'concept'
  return 'unfamiliar'
}

/** 依分數給建議難度 */
export function difficultyForScore(score: number): Difficulty {
  if (score < 45) return 1
  if (score < 75) return 2
  return 3
}

// ── 本次 session 內的知識點統計 ───────────────────────────────
export type SessionKPStat = KPRef & {
  attempts: number
  correct: number
  /** 依作答順序的對錯紀錄 */
  history: boolean[]
  wrongQuestions: Question[]
  lastRoundAttempts: number
  lastRoundCorrect: number
  totalTimeMs: number
  errorTypes: Partial<Record<ErrorType, number>>
}

export function sessionKPStats(session: Session): Map<string, SessionKPStat> {
  const stats = new Map<string, SessionKPStat>()
  for (const ref of session.scope) {
    stats.set(kpKey(ref), {
      ...ref, attempts: 0, correct: 0, history: [], wrongQuestions: [],
      lastRoundAttempts: 0, lastRoundCorrect: 0, totalTimeMs: 0, errorTypes: {},
    })
  }
  const lastIdx = session.rounds.length - 1
  session.rounds.forEach((round, ri) => {
    const byId = new Map(round.questions.map(q => [q.id, q]))
    for (const a of round.answers) {
      const q = byId.get(a.questionId)
      if (!q) continue
      const key = kpKey(q)
      let s = stats.get(key)
      if (!s) {                                   // 複習模式：範圍來自錯題本，可能不在 scope
        s = { subject: q.subject, chapter: q.chapter, kp: q.kp, attempts: 0, correct: 0, history: [], wrongQuestions: [],
          lastRoundAttempts: 0, lastRoundCorrect: 0, totalTimeMs: 0, errorTypes: {} }
        stats.set(key, s)
      }
      s.attempts++
      s.totalTimeMs += a.timeMs
      s.history.push(a.correct)
      if (a.correct) s.correct++
      else {
        s.wrongQuestions.push(q)
        if (a.errorType) s.errorTypes[a.errorType] = (s.errorTypes[a.errorType] ?? 0) + 1
      }
      if (ri === lastIdx) {
        s.lastRoundAttempts++
        if (a.correct) s.lastRoundCorrect++
      }
    }
  })
  return stats
}

/** 某知識點在本次是否已「過關」 */
export function isPassed(stat: SessionKPStat | undefined, score: number, settings: SessionSettings): boolean {
  if (!stat || stat.attempts < 2) return false
  const lastTwo = stat.history.slice(-2)
  return score >= settings.passScore && lastTwo.length === 2 && lastTwo.every(Boolean)
}

/**
 * 規劃下一波題目。回傳 null 代表不需要下一波（全部過關或已達最大波數）。
 * @param mastery 目前（已含本次作答更新）的掌握度表
 */
export function planNextRound(
  session: Session,
  mastery: Record<string, KPMastery>,
): { plan: PlanItem[] } | { done: NonNullable<Session['endReason']> } {
  const { settings } = session
  if (session.rounds.length >= settings.maxRounds) return { done: 'max-rounds' }

  const stats = sessionKPStats(session)
  const isFirst = session.rounds.length === 0

  type Cand = { ref: KPRef; score: number; priority: number; stat?: SessionKPStat; reason: string }
  const cands: Cand[] = []
  for (const ref of session.scope) {
    const key = kpKey(ref)
    const score = mastery[key]?.score ?? INITIAL_SCORE
    const stat = stats.get(key)
    if (!isFirst && isPassed(stat, score, settings)) continue

    const lastWrong = stat ? stat.lastRoundAttempts - stat.lastRoundCorrect : 0
    const unseen = !stat || stat.attempts === 0
    let priority = 100 - score + 30 * lastWrong + (unseen ? 20 : 0)
    // 有把握卻錯（觀念錯誤）再加權
    priority += 15 * (stat?.errorTypes.concept ?? 0)
    priority = Math.max(priority, 5)

    let reason: string
    if (isFirst || unseen) reason = mastery[key]?.attempts ? `之前掌握度 ${Math.round(score)}，先做檢測` : '首次練習，先做程度檢測'
    else if (lastWrong > 0) reason = `上一波錯 ${lastWrong} 題，加強並出變化題`
    else if (score < settings.passScore) reason = `掌握度 ${Math.round(score)}，未達過關門檻 ${settings.passScore}`
    else reason = '差一點過關，再確認一次'
    cands.push({ ref, score, priority, stat, reason })
  }

  if (cands.length === 0) return { done: 'all-passed' }

  // 題數：剩少數知識點時縮小這波的量，避免同一點一次灌太多題
  const total = Math.min(settings.questionsPerRound, cands.length * 4)
  cands.sort((a, b) => b.priority - a.priority)
  // 知識點比題數多時，只取優先度最高的
  const chosen = cands.slice(0, total)
  const counts = allocate(chosen.map(c => c.priority), total, Math.max(3, Math.ceil(total / chosen.length)))

  const plan: PlanItem[] = []
  chosen.forEach((c, i) => {
    const count = counts[i]
    if (count <= 0) return
    let difficulty: Difficulty = settings.difficulty === 'adaptive' ? difficultyForScore(c.score) : settings.difficulty
    if (settings.difficulty === 'adaptive' && c.stat && c.stat.lastRoundAttempts > 0) {
      const acc = c.stat.lastRoundCorrect / c.stat.lastRoundAttempts
      if (acc === 0 && difficulty > 1) difficulty = (difficulty - 1) as Difficulty
      if (acc === 1 && difficulty < 3) difficulty = (difficulty + 1) as Difficulty
    }
    // 上一波答錯的題 → 變化題（不超過這個知識點分到的題數）
    const lastRound = session.rounds[session.rounds.length - 1]
    const wrongInLast = lastRound
      ? lastRound.questions.filter(q =>
          kpKey(q) === kpKey(c.ref) && lastRound.answers.some(a => a.questionId === q.id && !a.correct))
      : []
    plan.push({
      ...c.ref,
      difficulty,
      count,
      variantsOf: wrongInLast.slice(0, count).map(q => ({ id: q.id, stem: q.stem })),
      reason: c.reason,
    })
  })
  return { plan }
}

/** 最大餘數法：依權重分配 total 題，每項至少 1 題、至多 cap 題 */
export function allocate(weights: number[], total: number, cap: number): number[] {
  const n = weights.length
  if (n === 0) return []
  const counts = new Array(n).fill(1) as number[]
  let left = total - n
  if (left < 0) return counts.map((_, i) => (i < total ? 1 : 0))
  while (left > 0) {
    // 每次把一題給「權重 / (已分配+1)」最大且未達上限者（D'Hondt）
    let best = -1
    let bestVal = -Infinity
    for (let i = 0; i < n; i++) {
      if (counts[i] >= cap) continue
      const v = weights[i] / (counts[i] + 1)
      if (v > bestVal) { bestVal = v; best = i }
    }
    if (best < 0) break
    counts[best]++
    left--
  }
  return counts
}

/** 掌握度等級文字 */
export function masteryLevel(score: number): { label: string; tone: 'bad' | 'mid' | 'good' } {
  if (score >= 80) return { label: '已掌握', tone: 'good' }
  if (score >= 55) return { label: '進步中', tone: 'mid' }
  return { label: '待加強', tone: 'bad' }
}
