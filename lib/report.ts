// ── 學習報告（純函式：由 Session 算出所有統計與規則式建議） ─────────

import { masteryLevel, sessionKPStats } from './engine'
import type { Confidence, ErrorType, KPRef, Session } from './types'
import { ERROR_TYPE_LABEL, kpKey } from './types'

export type KPRow = KPRef & {
  attempts: number
  correct: number
  accuracy: number
  before: number
  after: number
  delta: number
  level: ReturnType<typeof masteryLevel>
  avgTimeMs: number
  errorTypes: Partial<Record<ErrorType, number>>
  /** 本次作答軌跡（對錯序列） */
  history: boolean[]
}

export type Report = {
  totals: { questions: number; correct: number; accuracy: number; timeMs: number; avgTimeMs: number; rounds: number; hintsUsed: number; skipped: number }
  rounds: { index: number; total: number; correct: number; accuracy: number }[]
  kpRows: KPRow[]
  errorTypes: Record<ErrorType, number>
  /** 把握度 × 對錯 的交叉表 → 看「自我認知」是否準確 */
  calibration: Record<Confidence, { correct: number; wrong: number }>
  strengths: KPRow[]
  weaknesses: KPRow[]
  comment: string
  actions: string[]
  /** 建議下一次練習的範圍（弱點知識點） */
  nextScope: KPRef[]
  hasDemo: boolean
}

export function buildReport(session: Session): Report {
  const stats = sessionKPStats(session)
  const before = session.masteryBefore
  const after = session.masteryAfter ?? {}

  let questions = 0, correct = 0, timeMs = 0, hintsUsed = 0, skipped = 0
  const errorTypes: Record<ErrorType, number> = { concept: 0, unfamiliar: 0, careless: 0, guess: 0 }
  const calibration: Report['calibration'] = { sure: { correct: 0, wrong: 0 }, unsure: { correct: 0, wrong: 0 }, guess: { correct: 0, wrong: 0 } }
  let hasDemo = false

  const rounds = session.rounds.map(r => {
    const c = r.answers.filter(a => a.correct).length
    for (const a of r.answers) {
      questions++
      timeMs += a.timeMs
      if (a.correct) correct++
      if (a.usedHint) hintsUsed++
      if (a.chosen === null) skipped++
      if (!a.correct && a.errorType) errorTypes[a.errorType]++
      calibration[a.confidence][a.correct ? 'correct' : 'wrong']++
    }
    if (r.questions.some(q => q.demo)) hasDemo = true
    return { index: r.index, total: r.answers.length, correct: c, accuracy: r.answers.length ? c / r.answers.length : 0 }
  })

  const kpRows: KPRow[] = Array.from(stats.values())
    .filter(s => s.attempts > 0)
    .map(s => {
      const key = kpKey(s)
      const b = before[key] ?? 50
      const a = after[key] ?? b
      return {
        subject: s.subject, chapter: s.chapter, kp: s.kp,
        attempts: s.attempts, correct: s.correct, accuracy: s.correct / s.attempts,
        before: b, after: a, delta: Math.round((a - b) * 10) / 10,
        level: masteryLevel(a),
        avgTimeMs: s.totalTimeMs / s.attempts,
        errorTypes: s.errorTypes,
        history: s.history,
      }
    })
    .sort((x, y) => x.after - y.after)

  const strengths = kpRows.filter(r => r.level.tone === 'good').sort((a, b) => b.after - a.after).slice(0, 5)
  const weaknesses = kpRows.filter(r => r.level.tone !== 'good').slice(0, 5)
  const accuracy = questions ? correct / questions : 0

  const totals = { questions, correct, accuracy, timeMs, avgTimeMs: questions ? timeMs / questions : 0, rounds: rounds.length, hintsUsed, skipped }
  const { comment, actions } = ruleComment(session, totals, rounds, kpRows, errorTypes, calibration, weaknesses)

  return {
    totals, rounds, kpRows, errorTypes, calibration, strengths, weaknesses, comment, actions,
    nextScope: weaknesses.map(({ subject, chapter, kp }) => ({ subject, chapter, kp })),
    hasDemo,
  }
}

function pct(v: number) { return `${Math.round(v * 100)}%` }

function ruleComment(
  session: Session, totals: Report['totals'], rounds: Report['rounds'], rows: KPRow[],
  errorTypes: Record<ErrorType, number>, calibration: Report['calibration'], weaknesses: KPRow[],
): { comment: string; actions: string[] } {
  const parts: string[] = []
  const actions: string[] = []

  parts.push(`這次共練習 ${totals.rounds} 波、${totals.questions} 題，正確率 ${pct(totals.accuracy)}。`)

  if (rounds.length >= 2) {
    const first = rounds[0].accuracy, last = rounds[rounds.length - 1].accuracy
    if (last - first >= 0.15) parts.push(`從第一波的 ${pct(first)} 進步到最後一波的 ${pct(last)}，調整後的練習有效果！`)
    else if (first - last >= 0.15) parts.push(`後面幾波正確率下降（${pct(first)} → ${pct(last)}），系統會把難度拉高、並集中出你還不熟的題，所以這很正常。`)
  }

  if (session.endReason === 'all-passed') parts.push('範圍內的知識點全部過關 🎉')

  const improved = rows.filter(r => r.delta >= 10).sort((a, b) => b.delta - a.delta)
  if (improved.length) parts.push(`進步最多的是「${improved[0].kp}」（+${Math.round(improved[0].delta)}）。`)

  if (weaknesses.length) {
    parts.push(`還需要加強：${weaknesses.slice(0, 3).map(w => `「${w.kp}」`).join('、')}。`)
    actions.push(`用「弱點再練」針對 ${weaknesses.slice(0, 3).map(w => w.kp).join('、')} 再做一次練習`)
  }

  const topErr = (Object.entries(errorTypes) as [ErrorType, number][]).sort((a, b) => b[1] - a[1])[0]
  if (topErr && topErr[1] > 0) {
    parts.push(`錯題中最多的是「${ERROR_TYPE_LABEL[topErr[0]]}」（${topErr[1]} 題）。`)
    const tip: Record<ErrorType, string> = {
      concept: '有把握卻答錯：先重讀課本定義與詳解，把錯的觀念寫進筆記',
      unfamiliar: '不熟練：同一知識點多做幾題基礎題，先求穩再求快',
      careless: '粗心：作答太快，交卷前花 5 秒檢查符號、單位與題目問什麼',
      guess: '猜題：不會的題目先看提示再作答，並在錯題本標記複習',
    }
    actions.push(tip[topErr[0]])
  }

  const sureWrong = calibration.sure.wrong
  const sureTotal = calibration.sure.correct + calibration.sure.wrong
  if (sureTotal >= 3 && sureWrong / sureTotal >= 0.3) {
    actions.push(`「有把握」的題目錯了 ${sureWrong} 題，代表有些觀念自以為懂，特別值得看詳解`)
  }
  const unsureRight = calibration.unsure.correct + calibration.guess.correct
  if (unsureRight >= 3) actions.push(`有 ${unsureRight} 題答對但沒把握，明天的複習會再出現，確認真的會了`)

  if (session.settings.secondsPerQuestion && totals.avgTimeMs > session.settings.secondsPerQuestion * 1000 * 1.3) {
    actions.push(`平均每題 ${Math.round(totals.avgTimeMs / 1000)} 秒，比建議時間慢，可多練計算熟練度`)
  }
  if (actions.length === 0) actions.push('挑戰更進階的範圍，或把難度設為「進階」')
  actions.push('錯題已自動加入錯題本，依排程在 1、2、4、7、15 天後複習')

  return { comment: parts.join(''), actions: actions.slice(0, 5) }
}

/** 給 AI 評語用的精簡摘要（不含題目全文） */
export function reportSummaryForAI(session: Session, r: Report) {
  return {
    subject: session.subject,
    endReason: session.endReason,
    totals: { ...r.totals, accuracy: pct(r.totals.accuracy), avgSeconds: Math.round(r.totals.avgTimeMs / 1000) },
    rounds: r.rounds.map(x => `${x.index}:${x.correct}/${x.total}`),
    knowledgePoints: r.kpRows.map(k => ({
      kp: k.kp, chapter: k.chapter, acc: `${k.correct}/${k.attempts}`, mastery: `${Math.round(k.before)}→${Math.round(k.after)}`,
      errors: Object.entries(k.errorTypes).map(([t, n]) => `${ERROR_TYPE_LABEL[t as ErrorType]}×${n}`).join(','),
    })),
    errorTypes: Object.fromEntries(Object.entries(r.errorTypes).map(([t, n]) => [ERROR_TYPE_LABEL[t as ErrorType], n])),
    confidence: r.calibration,
  }
}
