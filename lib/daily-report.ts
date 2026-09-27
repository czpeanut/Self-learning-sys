// ── 家長日報 / 週報（純函式） ─────────────────────────────────────
// 輸入：當天的到館紀錄、練習紀錄、答題量、問 AI 紀錄 → 輸出家長看得懂的摘要。
// 第二階段會在 server 端於學生簽退時呼叫，產生 LINE 推播內容；所以這裡不碰 localStorage。

import { buildReport } from './report'
import type { AskRecord, Session, StudyDay } from './types'
import { MOOD_LABEL } from './types'
import type { DayLog } from './storage'

export type Goal = { label: string; target: number; actual: number; unit: string; met: boolean }
export type Alert = { level: 'info' | 'warn'; text: string }

export type DailyReport = {
  date: string
  studentName: string
  attended: boolean
  checkInAt?: number
  checkOutAt?: number
  stayMinutes: number
  focus: { minutes: number; blocks: number; completedBlocks: number; distractions: number; bySubject: { subject: string; minutes: number }[] }
  practice: { answered: number; correct: number; accuracy: number; minutes: number; sessions: number }
  goals: Goal[]
  improved: { kp: string; delta: number; after: number }[]
  weak: { kp: string; score: number }[]
  /** 問 AI：請 AI 詳解幾題、追問幾次、看完仍不懂的知識點 */
  ai: { solved: number; followups: number; understood: number; stuck: number; stuckTopics: string[] }
  reflection?: StudyDay['reflection']
  planNote?: string
  highlights: string[]
  alerts: Alert[]
  tipsForParent: string[]
}

const minutesOf = (ms: number) => Math.round(ms / 60000)
const hm = (t: number) => { const d = new Date(t); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}` }
export const fmtMinutes = (m: number) => (m >= 60 ? `${Math.floor(m / 60)} 小時 ${m % 60} 分` : `${m} 分鐘`)

export function buildDailyReport(input: {
  date: string
  studentName: string
  day: StudyDay | null
  sessions: Session[]            // 當天建立且已完成的練習
  log: DayLog | undefined
  asks: AskRecord[]              // 當天建立的問 AI 紀錄
  now?: number
}): DailyReport {
  const { date, day, sessions, log, asks } = input
  const now = input.now ?? Date.now()

  const focusBlocks = (day?.blocks ?? []).filter(b => b.kind === 'focus')
  const bySubjectMap = new Map<string, number>()
  for (const b of focusBlocks) bySubjectMap.set(b.subject, (bySubjectMap.get(b.subject) ?? 0) + (b.end - b.start))
  const focusMinutes = minutesOf(focusBlocks.reduce((s, b) => s + b.end - b.start, 0))
  const distractions = focusBlocks.reduce((s, b) => s + b.distractions, 0)
  const stayMinutes = day ? minutesOf((day.checkOutAt ?? now) - day.checkInAt) : 0

  const answered = log?.answered ?? 0
  const correct = log?.correct ?? 0
  const accuracy = answered ? correct / answered : 0

  // 當天所有練習的知識點進退步（取每個知識點最後一次的結果）
  const kpDelta = new Map<string, { kp: string; delta: number; after: number }>()
  for (const s of sessions) {
    const r = buildReport(s)
    for (const row of r.kpRows) {
      const prev = kpDelta.get(row.kp)
      kpDelta.set(row.kp, { kp: row.kp, delta: (prev?.delta ?? 0) + row.delta, after: row.after })
    }
  }
  const kpList = Array.from(kpDelta.values())
  const improved = kpList.filter(k => k.delta >= 5).sort((a, b) => b.delta - a.delta).slice(0, 5)
  const weak = kpList.filter(k => k.after < 55).sort((a, b) => a.after - b.after).slice(0, 5).map(k => ({ kp: k.kp, score: Math.round(k.after) }))

  const goals: Goal[] = []
  if (day?.plan.targetMinutes) goals.push({ label: '專注時間', target: day.plan.targetMinutes, actual: focusMinutes, unit: '分鐘', met: focusMinutes >= day.plan.targetMinutes })
  if (day?.plan.targetQuestions) goals.push({ label: '練習題數', target: day.plan.targetQuestions, actual: answered, unit: '題', met: answered >= day.plan.targetQuestions })

  const solvedAsks = asks.filter(a => a.solution)
  const stuckAsks = solvedAsks.filter(a => a.understood === false)
  const stuckTopics = Array.from(new Set(stuckAsks.map(a => a.question.kp))).slice(0, 5)
  const followups = asks.reduce((n, a) => n + a.followups.length, 0)

  // ── 亮點（給家長的好消息優先） ──
  const highlights: string[] = []
  if (goals.length && goals.every(g => g.met)) highlights.push('今天的目標全部達成 🎯')
  if (focusMinutes >= 60) highlights.push(`專注讀書 ${fmtMinutes(focusMinutes)}`)
  const completed = focusBlocks.filter(b => b.completed).length
  if (completed >= 3) highlights.push(`完整撐完 ${completed} 個專注時段`)
  if (improved.length) highlights.push(`「${improved[0].kp}」掌握度進步 ${Math.round(improved[0].delta)} 分`)
  if (answered >= 20 && accuracy >= 0.8) highlights.push(`練習 ${answered} 題，正確率 ${Math.round(accuracy * 100)}%`)
  const understood = solvedAsks.filter(a => a.understood === true).length
  if (understood) highlights.push(`靠 AI 解說自己弄懂 ${understood} 題`)

  // ── 需要關心（規則式提醒） ──
  const alerts: Alert[] = []
  if (!day) alerts.push({ level: 'info', text: '今天沒有到館紀錄' })
  if (day && !day.checkOutAt && date !== todayStr(now)) alerts.push({ level: 'warn', text: '當天沒有簽退紀錄' })
  if (day && stayMinutes >= 90 && focusMinutes < stayMinutes * 0.4) alerts.push({ level: 'warn', text: `在館 ${fmtMinutes(stayMinutes)}，但專注計時只有 ${fmtMinutes(focusMinutes)}` })
  if (focusMinutes >= 30 && distractions / Math.max(1, focusMinutes / 25) >= 3) alerts.push({ level: 'warn', text: `專注時段中切換畫面 ${distractions} 次，可能容易分心` })
  if (answered >= 10 && accuracy < 0.5) alerts.push({ level: 'warn', text: `練習正確率 ${Math.round(accuracy * 100)}%，有些內容還不熟` })
  if (day?.reflection?.mood === 'frustrated') alerts.push({ level: 'warn', text: `孩子自評今天「卡住了」${day.reflection.stuck ? `：${day.reflection.stuck}` : ''}` })
  if (stuckAsks.length) alerts.push({ level: 'warn', text: `有 ${stuckAsks.length} 題看完 AI 解說仍不懂（${stuckTopics.join('、')}），已排入錯題複習` })

  // ── 給家長的溝通建議 ──
  const tipsForParent: string[] = []
  if (day?.reflection?.mood === 'frustrated' || day?.reflection?.mood === 'tired') tipsForParent.push('今天孩子比較累或受挫，建議先聽他說哪裡卡住，不急著追問成績。')
  if (highlights.length) tipsForParent.push(`可以具體稱讚「過程」：例如「${highlights[0].replace(/ 🎯$/, '')}」，比稱讚分數更能維持動力。`)
  if (stuckTopics.length) tipsForParent.push(`「${stuckTopics.join('、')}」孩子看完 AI 解說還是不懂；館內沒有老師，這部分可能需要家長或家教協助。`)
  if (weak.length) tipsForParent.push(`弱點在「${weak.map(w => w.kp).join('、')}」，系統已排入錯題複習，可以問問孩子這些地方哪裡不懂。`)
  if (!tipsForParent.length) tipsForParent.push('可以問孩子今天學到的一件事，請他講給你聽（說得出來代表真的懂）。')

  return {
    date, studentName: input.studentName,
    attended: !!day, checkInAt: day?.checkInAt, checkOutAt: day?.checkOutAt, stayMinutes,
    focus: {
      minutes: focusMinutes, blocks: focusBlocks.length, completedBlocks: completed, distractions,
      bySubject: Array.from(bySubjectMap.entries()).map(([subject, ms]) => ({ subject, minutes: minutesOf(ms) })).sort((a, b) => b.minutes - a.minutes),
    },
    practice: { answered, correct, accuracy, minutes: Math.round(log?.minutes ?? 0), sessions: sessions.length },
    goals, improved, weak,
    ai: { solved: solvedAsks.length, followups, understood, stuck: stuckAsks.length, stuckTopics },
    reflection: day?.reflection, planNote: day?.plan.note || undefined,
    highlights, alerts, tipsForParent,
  }
}

function todayStr(now: number) {
  const d = new Date(now)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** LINE 訊息格式（純文字、短行、有表情符號，家長在手機上好讀） */
export function dailyReportText(r: DailyReport, link?: string): string {
  const [, m, d] = r.date.split('-')
  const L: string[] = [`📚 ${r.studentName || '孩子'} ${Number(m)}/${Number(d)} 學習日報`]
  if (!r.attended) {
    L.push('今天沒有到館紀錄。')
  } else {
    L.push(`🕘 到館 ${r.checkInAt ? hm(r.checkInAt) : '—'}${r.checkOutAt ? `，離館 ${hm(r.checkOutAt)}` : '（尚未離館）'}`)
    L.push(`⏱ 專注 ${fmtMinutes(r.focus.minutes)}${r.focus.bySubject.length ? `（${r.focus.bySubject.map(s => `${s.subject} ${s.minutes} 分`).join('、')}）` : ''}`)
    if (r.practice.answered) L.push(`✏️ 練習 ${r.practice.answered} 題，正確率 ${Math.round(r.practice.accuracy * 100)}%`)
    for (const g of r.goals) L.push(`${g.met ? '✅' : '⬜'} 目標${g.label}：${g.actual}/${g.target} ${g.unit}`)
    if (r.highlights.length) L.push(`🌟 ${r.highlights.slice(0, 2).join('；')}`)
    if (r.ai.solved) L.push(`🤖 請 AI 講解 ${r.ai.solved} 題${r.ai.stuck ? `，仍不懂 ${r.ai.stuck} 題` : '，都看懂了'}`)
    if (r.weak.length) L.push(`📌 待加強：${r.weak.map(w => w.kp).join('、')}`)
    if (r.reflection) L.push(`💬 孩子的心得：${MOOD_LABEL[r.reflection.mood]}${r.reflection.learned ? `｜學到：${r.reflection.learned}` : ''}`)
    const warns = r.alerts.filter(a => a.level === 'warn')
    if (warns.length) L.push(`⚠️ ${warns.map(a => a.text).join('；')}`)
  }
  if (link) L.push(`完整報告：${link}`)
  return L.join('\n')
}

/** 近 N 天摘要（週報用） */
export function buildWeekly(days: StudyDay[], logs: DayLog[], endDate: string, n = 7) {
  const end = new Date(endDate + 'T00:00:00')
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(end); d.setDate(end.getDate() - (n - 1) + i)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    const day = days.find(x => x.date === key)
    const log = logs.find(x => x.date === key)
    const focus = minutesOf((day?.blocks ?? []).filter(b => b.kind === 'focus').reduce((s, b) => s + b.end - b.start, 0))
    return {
      date: key, label: `${d.getMonth() + 1}/${d.getDate()}`, weekday: '日一二三四五六'[d.getDay()],
      attended: !!day, focusMinutes: focus, answered: log?.answered ?? 0, correct: log?.correct ?? 0,
    }
  })
}
