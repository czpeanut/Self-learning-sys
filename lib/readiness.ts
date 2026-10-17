// ── 段考準備度：把「這次段考還缺什麼」量化（純函式） ─────────────────
//
// 題型熟練規則沿用 Prac-sys：答對過 4 題以上（不同題目），且最近 5 次作答答對 80% 以上。
// 加強的地方：
//   1. 權重 = 這個題型在真實段考中「每份卷平均出現幾題」（OLE-QS 約 5,500 份卷統計）
//      → 準備度不是「練了幾個題型」，而是「段考會出的題，你有幾成有把握」
//   2. 預估失分：還沒把握的題型，每份段考約會出幾題
//   3. 缺口排序：段考出現頻率 × 還差多少，最該先補的排前面
//   4. 補齊需要的題數與每日題量（依距離段考天數）
//   5. 熟練後超過 21 天沒練 → 「需要複習」，分數打折

import type { Attempt } from './types'

export const OTHER = 'OTHER'
const MASTER_CORRECT = 4
const WINDOW = 5
const MASTER_ACC = 0.8
const STALE_DAYS = 21
/** 估算題量時考慮會答錯：實際要做的題數 ≈ 需要答對的題數 × 1.5 */
const EFFORT = 1.5

export type PoolType = { code: string; name: string; desc: string; n: number }
export type PoolUnit = { code: string; title: string; types: PoolType[] }
export type PoolCatalog = {
  book: string
  bookName: string
  units: PoolUnit[]
  /** 段考次別 → { 卷數, '單元:題型' → 每份卷平均出現幾題 } */
  freq: Record<string, { docs: number; perPaper: Record<string, number> }>
}

export type TypeStatus = 'untouched' | 'learning' | 'mastered' | 'stale'
export const STATUS_LABEL: Record<TypeStatus, string> = { untouched: '未練習', learning: '練習中', mastered: '已熟練', stale: '需要複習' }

export type TypeRow = {
  unit: string
  unitTitle: string
  type: string
  name: string
  desc: string
  poolN: number            // 題庫可練的題數
  weight: number           // 每份段考平均出現幾題
  attempts: number
  correct: number
  distinctCorrect: number
  recent: boolean[]        // 最近 5 次（舊 → 新）
  lastAt: number | null
  status: TypeStatus
  score: number            // 0–1 把握程度
  need: number             // 至少還要再答對幾題才算熟練
  gap: number              // weight × (1 − score)：段考上預估會丟的題數
  reason: string           // 缺口原因（給學生看）
}

export type Readiness = {
  rows: TypeRow[]
  readiness: number        // 0–1，依段考頻率加權
  expectedLoss: number     // 每份段考約幾題屬於還沒把握的題型
  examLoad: number         // 範圍內題型每份段考合計約幾題
  counts: Record<TypeStatus, number>
  needTotal: number        // 全部熟練至少還要答對幾題
  gaps: TypeRow[]          // 依缺口大小排序（不含已熟練）
  perDay: number           // 依距離段考天數，每天建議題量
  daysLeft: number
  todayDone: number        // 今天在這個範圍做了幾題
}

/** 題型權重：取這個單元有考的各次段考中最高的「每份卷平均題數」——反映「這單元一旦考，這題型會出幾題」 */
export function typeWeight(cat: PoolCatalog, unit: string, type: string): number {
  let w = 0
  for (const f of Object.values(cat.freq)) w = Math.max(w, f.perPaper[`${unit}:${type}`] ?? 0)
  return w > 0 ? w : 0.1
}

/** 至少還要連續答對幾題，才同時滿足「答對 ≥4 題（不同題目）」與「最近 5 次 ≥80%」 */
export function needToMaster(distinctCorrect: number, recent: boolean[]): number {
  const a = Math.max(0, MASTER_CORRECT - distinctCorrect)
  let b = 0
  const h = [...recent]
  const ok = () => { const w = h.slice(-WINDOW); return w.length > 0 && w.filter(Boolean).length / w.length >= MASTER_ACC }
  while (!ok() && b < WINDOW) { h.push(true); b++ }
  return Math.max(a, b)
}

export function computeReadiness(input: {
  cat: PoolCatalog
  units: string[]                 // 範圍內的單元代號
  attempts: Attempt[]             // 這位學生的全部題庫作答紀錄
  daysLeft: number
  now?: number
}): Readiness {
  const now = input.now ?? Date.now()
  const inScope = new Set(input.units)
  const mine = input.attempts.filter(a => a.book === input.cat.book && inScope.has(a.unit)).sort((a, b) => a.at - b.at)
  const byType = new Map<string, Attempt[]>()
  for (const a of mine) {
    const k = `${a.unit}:${a.type}`
    if (!byType.has(k)) byType.set(k, [])
    byType.get(k)!.push(a)
  }

  const rows: TypeRow[] = []
  for (const u of input.cat.units) {
    if (!inScope.has(u.code)) continue
    for (const t of u.types) {
      const list = byType.get(`${u.code}:${t.code}`) ?? []
      const recent = list.slice(-WINDOW).map(a => a.correct)
      const distinctCorrect = new Set(list.filter(a => a.correct).map(a => a.qid)).size
      const correct = list.filter(a => a.correct).length
      const lastAt = list.length ? list[list.length - 1].at : null
      const acc5 = recent.length ? recent.filter(Boolean).length / recent.length : 0
      const mastered = distinctCorrect >= MASTER_CORRECT && recent.length > 0 && acc5 >= MASTER_ACC
      let status: TypeStatus = list.length === 0 ? 'untouched' : mastered ? 'mastered' : 'learning'
      if (mastered && lastAt && now - lastAt > STALE_DAYS * 86400000) status = 'stale'

      let score = 0
      if (status === 'mastered') score = 1
      else if (status === 'stale') score = 0.8
      else if (status === 'learning') score = Math.min(0.7, 0.7 * acc5 * Math.min(1, distinctCorrect / MASTER_CORRECT + 0.25))

      const need = status === 'mastered' ? 0 : status === 'stale' ? 1 : needToMaster(distinctCorrect, recent)
      const weight = typeWeight(input.cat, u.code, t.code)
      let reason: string
      if (status === 'untouched') reason = t.n ? '還沒練過' : '題庫暫無可練的題目'
      else if (status === 'stale') reason = `熟練過，但 ${Math.floor((now - (lastAt ?? now)) / 86400000)} 天沒練`
      else if (status === 'mastered') reason = '已熟練'
      else if (acc5 < MASTER_ACC) reason = `最近 ${recent.length} 題只對 ${recent.filter(Boolean).length} 題`
      else reason = `答對 ${distinctCorrect}／${MASTER_CORRECT} 題，練習量還不夠`

      rows.push({
        unit: u.code, unitTitle: u.title, type: t.code, name: t.name, desc: t.desc, poolN: t.n,
        weight, attempts: list.length, correct, distinctCorrect, recent, lastAt, status, score, need,
        gap: t.code === OTHER ? 0 : weight * (1 - score), reason,
      })
    }
  }

  // 準備度不計「其他題型」（題型目錄歸不進去的題目），與 Prac-sys 相同
  const counted = rows.filter(r => r.type !== OTHER)
  const examLoad = counted.reduce((s, r) => s + r.weight, 0)
  const got = counted.reduce((s, r) => s + r.weight * r.score, 0)
  const counts: Record<TypeStatus, number> = { untouched: 0, learning: 0, mastered: 0, stale: 0 }
  for (const r of counted) counts[r.status]++
  const needTotal = counted.filter(r => r.poolN > 0).reduce((s, r) => s + r.need, 0)
  const daysLeft = Math.max(0, input.daysLeft)
  const today = new Date(now); today.setHours(0, 0, 0, 0)
  return {
    rows,
    readiness: examLoad ? got / examLoad : 0,
    expectedLoss: examLoad - got,
    examLoad,
    counts,
    needTotal,
    gaps: counted.filter(r => r.status !== 'mastered' && r.poolN > 0).sort((a, b) => b.gap - a.gap),
    perDay: needTotal === 0 ? 0 : Math.ceil((needTotal * EFFORT) / Math.max(1, daysLeft)),
    daysLeft,
    todayDone: mine.filter(a => a.at >= today.getTime()).length,
  }
}

/** 準備度等級（顏色一定搭配文字） */
export function readinessLevel(r: number): { label: string; tone: 'bad' | 'mid' | 'good' } {
  if (r >= 0.8) return { label: '準備充分', tone: 'good' }
  if (r >= 0.5) return { label: '還差一些', tone: 'mid' }
  return { label: '需要加油', tone: 'bad' }
}
