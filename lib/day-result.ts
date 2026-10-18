// ── 今日成果報告（給學生看，純函式） ─────────────────────────────
// 一天所有練習（自選、段考衝刺、錯題複習、弱項特訓）彙整：做了多少、和自己比進步多少、
// 哪些題型進步／還要加強、錯題本的變化、特訓達標、明天該做什麼。
// 家長版在 lib/daily-report.ts；這份著重「學生自己看得到的成果」與下一步。
// 只和自己的過去比（昨天、近 7 天平均），不排名。

import { drillProgress } from './drill'
import type { DayLog } from './storage'
import type { KPMastery, KPRef, Session, WrongItem } from './types'
import { kpKey, sessionLabel } from './types'

/** 作答過快（與冷靜作答、學習行為剖析一致） */
const FAST_MS = 3000

export type SkillRow = KPRef & { answered: number; correct: number; before: number; after: number; delta: number }
export type DayResult = {
  date: string
  empty: boolean
  totals: { answered: number; correct: number; accuracy: number; minutes: number; sessions: number; fast: number; hints: number }
  goal: { target: number; actual: number; met: boolean }
  streak: number
  compare: { yesterday: { answered: number; accuracy: number } | null; avg7: { answered: number; accuracy: number } | null }
  sessions: { id: string; label: string; answered: number; correct: number; mode: Session['mode'] }[]
  skills: SkillRow[]
  improved: SkillRow[]
  needWork: SkillRow[]
  wrong: { added: number; reviewed: number; reviewCorrect: number; conquered: number; openTotal: number; dueTomorrow: number }
  drill: { passed: KPRef[]; stuck: KPRef[] }
  exam?: { label: string; before: number; after: number }
  highlights: string[]
  tomorrow: { text: string; href?: string }[]
}

const dayOf = (t: number) => { const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }
const shift = (date: string, n: number) => { const d = new Date(date + 'T00:00:00'); d.setDate(d.getDate() + n); return dayOf(d.getTime()) }
const pct = (x: number) => `${Math.round(x * 100)}%`

export function buildDayResult(input: {
  date: string
  sessions: Session[]                    // 全部練習（函式自己挑當天的）
  mastery: Record<string, KPMastery>     // 目前掌握度（當天是今天時當作「練習後」）
  wrongBook: WrongItem[]
  activity: DayLog[]
  dailyGoal: number
  streak: number
  exam?: { label: string; before: number; after: number }
  now?: number
}): DayResult {
  const { date } = input
  const now = input.now ?? Date.now()
  const isToday = dayOf(now) === date
  const sessions = input.sessions
    .filter(s => s.rounds.some(r => dayOf(r.startedAt) === date))
    .sort((a, b) => a.createdAt - b.createdAt)

  let answered = 0, correct = 0, timeMs = 0, fast = 0, hints = 0
  let reviewed = 0, reviewCorrect = 0
  const added = new Set<string>()
  const reviewedOk = new Set<string>()
  const skills = new Map<string, SkillRow>()
  const sessionRows: DayResult['sessions'] = []
  const passed: KPRef[] = [], stuck: KPRef[] = []

  for (const s of sessions) {
    let sa = 0, sc = 0
    for (const r of s.rounds) {
      if (dayOf(r.startedAt) !== date) continue
      const byId = new Map(r.questions.map(q => [q.id, q]))
      for (const a of r.answers) {
        const q = byId.get(a.questionId)
        if (!q) continue
        answered++; sa++
        timeMs += a.timeMs
        if (a.correct) { correct++; sc++ }
        if (a.timeMs < FAST_MS && a.chosen !== null) fast++
        if (a.usedHint) hints++
        if (q.source === 'review' || s.mode === 'review') {
          reviewed++
          if (a.correct) { reviewCorrect++; reviewedOk.add(q.id) }
        } else if (!a.correct && !q.demo) added.add(q.id)
        const k = kpKey(q)
        const row = skills.get(k) ?? {
          subject: q.subject, chapter: q.chapter, kp: q.kp, answered: 0, correct: 0,
          before: s.masteryBefore[k] ?? 50, after: 0, delta: 0,
        }
        row.answered++
        if (a.correct) row.correct++
        skills.set(k, row)
      }
    }
    // 練習後的掌握度：最後一次有練到的 session 結束時的快照；今天還在練就用目前掌握度
    for (const [k, row] of Array.from(skills.entries())) {
      const after = s.masteryAfter?.[k]
      if (after != null) row.after = after
      else if (isToday && input.mastery[k]) row.after = input.mastery[k].score
    }
    if (sa) sessionRows.push({ id: s.id, label: s.mode === 'practice' ? (s.exam ? `${s.subject}段考衝刺` : `${s.subject}自習`) : sessionLabel(s), answered: sa, correct: sc, mode: s.mode })
    if (s.mode === 'drill') {
      for (const p of drillProgress(s)) {
        const ref = { subject: p.subject, chapter: p.chapter, kp: p.kp }
        if (p.status === 'passed') passed.push(ref)
        else if (p.status === 'stuck') stuck.push(ref)
      }
    }
  }
  const skillRows = Array.from(skills.values()).map(r => {
    const after = r.after || r.before
    return { ...r, after: Math.round(after), before: Math.round(r.before), delta: Math.round(after - r.before) }
  }).sort((a, b) => b.answered - a.answered)
  const improved = skillRows.filter(r => r.delta >= 5).sort((a, b) => b.delta - a.delta)
  const needWork = skillRows.filter(r => r.after < 60 || (r.answered >= 3 && r.correct / r.answered < 0.5)).sort((a, b) => a.after - b.after)

  const book = input.wrongBook
  const conquered = book.filter(w => w.resolved && reviewedOk.has(w.question.id)).length
  const tomorrowEnd = new Date(shift(date, 2) + 'T00:00:00').getTime()
  const dueTomorrow = book.filter(w => !w.resolved && w.nextReviewAt < tomorrowEnd).length
  const openTotal = book.filter(w => !w.resolved).length

  // 和自己比：昨天、前 7 天（不含今天）有練習的日子平均
  const logOf = (d: string) => input.activity.find(l => l.date === d && l.answered > 0)
  const y = logOf(shift(date, -1))
  const prev7 = Array.from({ length: 7 }, (_, i) => logOf(shift(date, -1 - i))).filter((l): l is DayLog => !!l)
  const compare = {
    yesterday: y ? { answered: y.answered, accuracy: y.correct / y.answered } : null,
    avg7: prev7.length ? {
      answered: Math.round(prev7.reduce((s, l) => s + l.answered, 0) / prev7.length),
      accuracy: prev7.reduce((s, l) => s + l.correct, 0) / Math.max(1, prev7.reduce((s, l) => s + l.answered, 0)),
    } : null,
  }

  const accuracy = answered ? correct / answered : 0
  const goal = { target: input.dailyGoal, actual: answered, met: answered >= input.dailyGoal }

  // ── 今天的成果（只講做到的事） ──
  const highlights: string[] = []
  if (goal.met) highlights.push(`達成每日目標 ${input.dailyGoal} 題 🎯`)
  if (input.streak >= 3 && isToday) highlights.push(`連續練習 ${input.streak} 天`)
  if (compare.avg7 && answered > compare.avg7.answered * 1.2) highlights.push(`題數比近 7 天平均多 ${answered - compare.avg7.answered} 題`)
  if (compare.avg7 && answered >= 10 && accuracy - compare.avg7.accuracy >= 0.1) highlights.push(`正確率比近 7 天平均高 ${Math.round((accuracy - compare.avg7.accuracy) * 100)} 個百分點`)
  if (improved.length) highlights.push(`「${improved[0].kp}」掌握度 ${improved[0].before} → ${improved[0].after}`)
  if (conquered) highlights.push(`克服 ${conquered} 題錯題`)
  if (passed.length) highlights.push(`特訓達標 ${passed.length} 個題型：${passed.slice(0, 3).map(p => p.kp).join('、')}`)
  if (input.exam && input.exam.after - input.exam.before >= 0.01) highlights.push(`${input.exam.label}準備度 ${pct(input.exam.before)} → ${pct(input.exam.after)}`)
  if (reviewed && !conquered && reviewCorrect) highlights.push(`錯題複習答對 ${reviewCorrect}/${reviewed} 題`)

  // ── 明天的下一步（具體、可以直接點） ──
  const tomorrow: DayResult['tomorrow'] = []
  if (stuck.length) tomorrow.push({ text: `「${stuck.map(s => s.kp).join('、')}」今天練了還是常錯，先打開錯題本請 AI 講解，看懂再特訓`, href: '/wrong-book' })
  const drillNext = needWork.filter(r => !stuck.some(s => kpKey(s) === kpKey(r))).slice(0, 3)
  if (drillNext.length) tomorrow.push({ text: `弱項特訓：${drillNext.map(r => `「${r.kp}」`).join('')}，練到連續答對 3 題`, href: `/drill?${drillNext.map(r => `t=${encodeURIComponent(kpKey(r))}`).join('&')}` })
  if (dueTomorrow) tomorrow.push({ text: `明天有 ${dueTomorrow} 題錯題到期，先複習再做新題（隔天重做最不容易忘）`, href: '/wrong-book' })
  if (!goal.met && answered > 0) tomorrow.push({ text: `今天 ${answered}/${input.dailyGoal} 題，明天試著做滿每日目標` })
  if (fast >= 3 && fast / Math.max(1, answered) >= 0.1) tomorrow.push({ text: `今天有 ${fast} 題不到 3 秒就作答，明天每題先把題目讀完再選` })
  if (!tomorrow.length && answered) tomorrow.push({ text: '今天的題型都很穩，明天可以挑戰新範圍或提高難度', href: '/practice/new' })
  if (!answered) tomorrow.push({ text: '這天還沒有練習紀錄', href: '/practice/new' })

  return {
    date, empty: answered === 0,
    totals: { answered, correct, accuracy, minutes: Math.round(timeMs / 60000), sessions: sessionRows.length, fast, hints },
    goal, streak: input.streak, compare, sessions: sessionRows,
    skills: skillRows, improved, needWork,
    wrong: { added: added.size, reviewed, reviewCorrect, conquered, openTotal, dueTomorrow },
    drill: { passed, stuck },
    exam: input.exam, highlights, tomorrow,
  }
}
