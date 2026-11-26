// ── 專屬教材（純函式）：以段考為單位，把該練的題型與圖解觀念整理成紙本教材，拍照閱卷後診斷前置觀念 ──
//
// 一輪＝一份教材：
//   前置觀念補強區（上一輪閱卷診斷出「以前沒學會」的題型，每個一題基礎題）
//   本輪重點區（段考範圍內還沒熟練的題型：圖解觀念卡＋一題標準難度的重點觀念題）
// 每題下方是步驟式作答欄（2–4 步）＋選項劃記圈；每頁四角有定位方塊、頁碼條碼，
// 每個作答區四角有定位角與題號——拍照後由 lib/scan.ts 校正、裁切、判讀劃記，步驟交給 AI 判斷。
// 說明在 docs/WORKBOOK.md

import type { ConceptCard } from './concept'
import { OTHER, type TypeRow } from './readiness'
import type { Attempt, Difficulty } from './types'

// ── 版面幾何（mm，A4 直式）：列印頁、掃描校正共用 ──
export const PAGE_W = 210
export const PAGE_H = 297
/** 四角定位方塊：邊長 8mm；左上是中空方框（判斷方向用），其他三個實心 */
export const FID_SIZE = 8
export const FID_HOLE = 4
export const FID_CENTERS: [number, number][] = [[9, 9], [201, 9], [201, 288], [9, 288]]   // 左上、右上、右下、左下
/** 頁碼條碼：10 格（5 位頁碼＋5 位反碼），每格 4mm、間距 5mm */
export const CODE_Y = 9
export const CODE_X0 = 140
export const CODE_STEP = 5
export const CODE_CELL = 4
export const CODE_BITS = 10
/** 內容區 */
export const CONTENT = { x: 18, y: 26, w: 174, h: 252 }
/** 劃記圈直徑 */
export const BUBBLE_D = 5.5

export type Rect = { x: number; y: number; w: number; h: number }

export type WorkbookItem = {
  no: number                       // 全卷連號
  section: 'prereq' | 'core'
  book: string
  unit: string
  unitTitle: string
  type: string
  typeName: string
  typeDesc: string
  qid: string
  stem: string
  options: string[]
  cite: string
  difficulty: Difficulty
  answer: number                   // 只在伺服器與閱卷後給學生
  steps: string[]                  // 步驟提示（作答欄每一列的標題）
  reason?: string                  // 前置補強：因為哪一題卡住
  concept?: ConceptCard            // 圖解觀念卡（列印前準備）
  prepared?: boolean               // 已準備好步驟提示與觀念卡
}

/** 前置觀念命中：哪個前置題型沒學會 */
export type PrereqHit = { book: string; unit: string; type: string; typeName: string; why: string }

export type ItemResult = {
  status: 'correct' | 'wrong' | 'blank'
  chosen: number | null
  steps: { text: string; ok: boolean | null }[]
  firstWrongStep: number | null    // 從 1 起算；null＝沒有錯的步驟或無法判斷
  note: string                     // 短評（≤20 字）
  prereq: PrereqHit[]
  source: 'scan' | 'manual'
  at: number
}

export type LayoutRegion = { no: number; box: Rect; steps: Rect[]; bubbles: { x: number; y: number }[] }
export type Layout = { pages: { page: number; regions: LayoutRegion[] }[]; total: number }

export type WorkbookStatus = 'draft' | 'sent' | 'grading' | 'graded'
export const STATUS_LABEL: Record<WorkbookStatus, string> = { draft: '待列印', sent: '已寄出', grading: '閱卷中', graded: '已閱卷' }

export const LETTERS = ['A', 'B', 'C', 'D', 'E']

/** 本輪重點題型：範圍內還沒熟練、題庫有題目的題型；太多時留缺口大的，再依單元順序排 */
export function pickConcepts(rows: TypeRow[], max = 40): TypeRow[] {
  const cand = rows.filter(r => r.type !== OTHER && r.poolN > 0 && r.status !== 'mastered')
  const keep = new Set((cand.length > max ? [...cand].sort((a, b) => b.gap - a.gap).slice(0, max) : cand).map(r => `${r.unit}:${r.type}`))
  return cand.filter(r => keep.has(`${r.unit}:${r.type}`))
}

/** 預設步驟提示（AI 沒有給題目專屬提示時用） */
export function defaultSteps(d: Difficulty): string[] {
  if (d === 1) return ['寫出用到的觀念', '計算並寫出答案']
  if (d === 2) return ['寫出用到的觀念或公式', '列式', '計算並寫出答案']
  return ['寫出用到的觀念或公式', '整理條件、列式', '計算', '檢查並寫出答案']
}

/** 選項判分：答案以題庫為準，不採信 AI 的對錯 */
export function judgeChoice(item: Pick<WorkbookItem, 'answer'>, chosen: number | null): ItemResult['status'] {
  return chosen == null ? 'blank' : chosen === item.answer ? 'correct' : 'wrong'
}

export type WorkbookSummary = { total: number; graded: number; correct: number; wrong: number; blank: number; prereqTotal: number; coreTotal: number }
export function summarize(items: WorkbookItem[], results: Record<string, ItemResult>): WorkbookSummary {
  const s: WorkbookSummary = { total: items.length, graded: 0, correct: 0, wrong: 0, blank: 0, prereqTotal: 0, coreTotal: 0 }
  for (const it of items) {
    if (it.section === 'prereq') s.prereqTotal++; else s.coreTotal++
    const r = results[String(it.no)]
    if (!r) continue
    s.graded++
    s[r.status]++
  }
  return s
}

export function statusOf(items: WorkbookItem[], results: Record<string, ItemResult>, sent: boolean): WorkbookStatus {
  const n = Object.keys(results).filter(k => items.some(i => String(i.no) === k)).length
  if (n >= items.length && items.length > 0) return 'graded'
  if (n > 0) return 'grading'
  return sent ? 'sent' : 'draft'
}

export type Diagnosis = (PrereqHit & { count: number; from: number[] })[]

/** 彙整前置觀念診斷：同一個前置題型被幾題指到，多的在前 */
export function aggregateDiagnosis(items: WorkbookItem[], results: Record<string, ItemResult>): Diagnosis {
  const map = new Map<string, Diagnosis[number]>()
  for (const it of items) {
    const r = results[String(it.no)]
    if (!r || r.status === 'correct') continue
    for (const h of r.prereq) {
      const k = `${h.book}:${h.unit}:${h.type}`
      const cur = map.get(k) ?? { ...h, count: 0, from: [] }
      cur.count++
      if (!cur.from.includes(it.no)) cur.from.push(it.no)
      map.set(k, cur)
    }
  }
  return Array.from(map.values()).sort((a, b) => b.count - a.count)
}

/** 閱卷結果 → 題庫作答紀錄（併進段考準備度）；at 用閱卷時間＋題號，重複匯入時可去重 */
export function toAttempts(items: WorkbookItem[], results: Record<string, ItemResult>): Attempt[] {
  return items.flatMap(it => {
    const r = results[String(it.no)]
    if (!r || r.status === 'blank') return []
    return [{ qid: it.qid, book: it.book, unit: it.unit, type: it.type, correct: r.status === 'correct', at: r.at + it.no, timeMs: 0, confidence: 'sure' as const, usedHint: false }]
  })
}

/** 學生端看的題目：未閱卷的題目不給答案 */
export function publicItems(items: WorkbookItem[], results: Record<string, ItemResult>): (Omit<WorkbookItem, 'answer'> & { answer: number | null })[] {
  return items.map(it => ({ ...it, answer: results[String(it.no)] ? it.answer : null }))
}

// ── 頁碼條碼：5 位頁碼（1–31）＋ 5 位反碼 ──
const HALF = CODE_BITS / 2
export function encodePage(n: number): boolean[] {
  const v = Math.max(1, Math.min(MAX_PAGES, Math.round(n)))
  const bits = Array.from({ length: HALF }, (_, i) => ((v >> (HALF - 1 - i)) & 1) === 1)
  return [...bits, ...bits.map(b => !b)]
}
export function decodePage(bits: boolean[]): number | null {
  if (bits.length !== CODE_BITS) return null
  for (let i = 0; i < HALF; i++) if (bits[i] === bits[i + HALF]) return null
  const v = bits.slice(0, HALF).reduce((s, b) => s * 2 + (b ? 1 : 0), 0)
  return v >= 1 ? v : null
}
export const MAX_PAGES = 31

/** 教材代碼（印在每頁，6 碼，避開易混淆字元） */
export function workbookCode(rand: () => number = Math.random): string {
  const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  return Array.from({ length: 6 }, () => A[Math.floor(rand() * A.length)]).join('')
}
