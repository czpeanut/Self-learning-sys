// ── 程度檢測：出卷配題、批改、等級（純函式；題目與答案只在伺服器） ─────────
// 出卷：從選定單元的所有題型，依「真實段考每份卷平均出現幾題」分配題數（常考題型多出），每個單元至少 1 題；
//       難度混合（基礎／標準／進階約 3:4:3），每題在檢測期間不給回饋。
// 批改：依難度加權（基礎 1、標準 1.5、進階 2）算 0–100 分；分單元、分題型列出答對率，給出等級與強弱題型。

import type { Question } from './types'

export type TypeSlot = { unit: string; unitTitle: string; type: string; typeName: string; weight: number; available: number }
export type TestQuestion = {
  id: string; unit: string; unitTitle: string; type: string; typeName: string; difficulty: 1 | 2 | 3
  stem: string; options: string[]; answer: number; cite: string; answerStatus?: string
}
/** 給學生看的題目（拿掉答案） */
export type PublicQuestion = Omit<TestQuestion, 'answer'>
export const toPublic = (q: TestQuestion): PublicQuestion => { const { answer, ...rest } = q; void answer; return rest }

export const TEST_MIN = 5
export const TEST_MAX = 50

/**
 * 每個題型出幾題：先分給單元（每單元至少 1 題，其餘依單元段考權重的平方根，避免常考單元吃掉全部題數），
 * 再在單元內依題型的段考頻率分配（D'Hondt，每題型最多 3 題）
 */
export function planTest(slots: TypeSlot[], count: number): { slot: TypeSlot; count: number }[] {
  const usable = slots.filter(s => s.available > 0)
  const cap = (s: TypeSlot) => Math.min(3, s.available)
  const units = Array.from(new Set(usable.map(s => s.unit)))
  const unitCap = units.map(u => usable.filter(s => s.unit === u).reduce((n, s) => n + cap(s), 0))
  const total = Math.max(Math.min(TEST_MIN, unitCap.reduce((a, b) => a + b, 0)), Math.min(TEST_MAX, count, unitCap.reduce((a, b) => a + b, 0)))
  if (!units.length || total <= 0) return []
  const unitW = units.map(u => Math.sqrt(usable.filter(s => s.unit === u).reduce((n, s) => n + s.weight, 0)) || 0.1)
  // 單元配額：每單元至少 1（單元比題數多時取權重最高的），其餘 D'Hondt，不超過該單元可出的題數
  const quota = new Array(units.length).fill(0) as number[]
  units.map((_, i) => i).sort((a, b) => unitW[b] - unitW[a]).slice(0, total).forEach(i => { quota[i] = 1 })
  for (let left = total - quota.reduce((a, b) => a + b, 0); left > 0; left--) {
    let best = -1, val = -Infinity
    units.forEach((_, i) => { if (quota[i] < unitCap[i] && unitW[i] / (quota[i] + 1) > val) { val = unitW[i] / (quota[i] + 1); best = i } })
    if (best < 0) break
    quota[best]++
  }
  const out: { slot: TypeSlot; count: number }[] = []
  units.forEach((u, i) => {
    if (!quota[i]) return
    const types = usable.filter(s => s.unit === u).sort((a, b) => b.weight - a.weight)
    const counts = new Array(types.length).fill(0) as number[]
    for (let left = quota[i]; left > 0; left--) {
      let best = -1, val = -Infinity
      types.forEach((t, k) => { if (counts[k] < cap(t) && t.weight / (counts[k] + 1) > val) { val = t.weight / (counts[k] + 1); best = k } })
      if (best < 0) break
      counts[best]++
    }
    types.forEach((t, k) => { if (counts[k]) out.push({ slot: t, count: counts[k] }) })
  })
  return out
}

/** 第 i 題要的難度：約 3:4:3 */
export const difficultyFor = (i: number, n: number): 1 | 2 | 3 => {
  const r = n <= 1 ? 0.5 : i / (n - 1)
  return r < 0.3 ? 1 : r < 0.7 ? 2 : 3
}

const WEIGHT = { 1: 1, 2: 1.5, 3: 2 } as const
export type Level = { code: 'A' | 'B' | 'C' | 'D'; label: string; desc: string }
export function levelOf(score: number): Level {
  if (score >= 85) return { code: 'A', label: '精熟', desc: '範圍內觀念穩固，可以挑戰進階題與跨單元綜合題' }
  if (score >= 70) return { code: 'B', label: '良好', desc: '大部分題型會做，少數題型需要補強' }
  if (score >= 55) return { code: 'C', label: '基礎', desc: '基本題會做，標準以上的題目還不穩定' }
  return { code: 'D', label: '待加強', desc: '多個題型還沒掌握，建議從基礎題與講解開始' }
}

export type GroupRow = { key: string; name: string; total: number; correct: number; pct: number }
export type TestResult = {
  total: number
  answered: number
  correct: number
  score: number              // 0–100，難度加權
  level: Level
  byUnit: (GroupRow & { level: Level })[]
  byType: (GroupRow & { unit: string; type: string })[]
  strengths: string[]
  weaknesses: string[]
  items: { id: string; chosen: number | null; answer: number; correct: boolean }[]
}

export function gradeTest(questions: TestQuestion[], answers: Record<string, number | null | undefined>): TestResult {
  let got = 0, full = 0, correct = 0, answered = 0
  const units = new Map<string, GroupRow>()
  const types = new Map<string, GroupRow & { unit: string; type: string }>()
  const items = questions.map(q => {
    const chosen = typeof answers[q.id] === 'number' ? (answers[q.id] as number) : null
    const ok = chosen === q.answer
    const w = WEIGHT[q.difficulty] ?? 1
    full += w
    if (ok) { got += w; correct++ }
    if (chosen !== null) answered++
    const u = units.get(q.unit) ?? { key: q.unit, name: `${q.unit} ${q.unitTitle}`, total: 0, correct: 0, pct: 0 }
    u.total++; if (ok) u.correct++
    units.set(q.unit, u)
    const tk = `${q.unit}:${q.type}`
    const t = types.get(tk) ?? { key: tk, name: q.typeName, unit: q.unit, type: q.type, total: 0, correct: 0, pct: 0 }
    t.total++; if (ok) t.correct++
    types.set(tk, t)
    return { id: q.id, chosen, answer: q.answer, correct: ok }
  })
  const pct = <T extends GroupRow>(r: T): T => ({ ...r, pct: r.total ? r.correct / r.total : 0 })
  const score = full ? Math.round((got / full) * 1000) / 10 : 0
  const byType = Array.from(types.values()).map(pct)
  return {
    total: questions.length, answered, correct, score, level: levelOf(score),
    byUnit: Array.from(units.values()).map(pct).map(u => ({ ...u, level: levelOf(u.pct * 100) })).sort((a, b) => a.key.localeCompare(b.key, undefined, { numeric: true })),
    byType,
    strengths: byType.filter(t => t.total >= 2 && t.correct === t.total).map(t => t.name),
    weaknesses: byType.filter(t => t.correct / t.total < 0.5).sort((a, b) => a.pct - b.pct).map(t => t.name),
    items,
  }
}

/** 同一份檢測中的百分等級（贏過幾 % 的人；只有一人時為 null） */
export function percentile(score: number, all: number[]): number | null {
  if (all.length < 2) return null
  const below = all.filter(s => s < score).length
  const same = all.filter(s => s === score).length
  return Math.round(((below + (same - 1) / 2) / (all.length - 1)) * 100)
}

/** 檢測題 → 系統的題目格式（交卷後記進作答紀錄、錯題本，段考準備度也會算進去） */
export function toQuestion(q: TestQuestion, book: string, bookName: string): Question {
  return {
    id: q.id, subject: '數學', chapter: `${bookName} ${q.unit} ${q.unitTitle}`, kp: q.typeName, difficulty: q.difficulty,
    stem: q.stem, options: q.options, answerIndex: q.answer, explanation: '', source: 'bank',
    origin: { book, unit: q.unit, type: q.type, qid: q.id }, cite: q.cite, answerStatus: q.answerStatus,
  }
}
