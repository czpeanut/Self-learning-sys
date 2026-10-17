// ── 段考：依日期推算第幾次段考、主流段考範圍（純函式） ─────────────
//
// 主流範圍的資料來自 OLE-QS 題庫約 5,500 份真實段考卷（scripts/build_exam_scopes.py → lib/data/exam-scopes.json）：
// 同一個段考時段的考卷中，有幾成考卷考了這個單元。數學第 1 次段考幾乎 100% 是第 1 章，資料非常一致。

import type { ExamTarget } from './types'

export const BOOK_NAME: Record<string, string> = { '7-1': '七上', '7-2': '七下', '8-1': '八上', '8-2': '八下', '9-1': '九上', '9-2': '九下' }
export const bookOf = (grade: number, semester: number) => `${grade}-${semester}`
export const GRADE_NAME: Record<number, string> = { 7: '國一', 8: '國二', 9: '國三' }
export const PUBLISHERS = ['翰林', '康軒', '南一'] as const

/** 本系統科目 → OLE-QS 的科目／子科 */
export const OLE_SUBJECT: Record<string, { subject: string; sub: string }> = {
  數學: { subject: '數學', sub: '' }, 國文: { subject: '國文', sub: '' }, 英文: { subject: '英語', sub: '' },
  理化: { subject: '自然', sub: '理化' }, 生物: { subject: '自然', sub: '生物' }, 地球科學: { subject: '自然', sub: '地科' },
  歷史: { subject: '社會', sub: '歷史' }, 地理: { subject: '社會', sub: '地理' }, 公民: { subject: '社會', sub: '公民' },
}
/** 有題型目錄與題庫題的科目（OLE-QS 目前只有數學做了題型歸類） */
export const BANK_SUBJECTS = ['數學']

// ── 段考行事曆 ───────────────────────────────────────────────────
// 各校日期不同，這是全台國中常見時間（月, 日）；只用來「猜」最近的一次段考，學生可以改。
// 國三下學期只有兩次段考（之後是 5 月的會考）。
const TYPICAL: Record<string, [number, number][]> = {
  '1': [[10, 20], [12, 4], [1, 19]],
  '2': [[4, 1], [5, 15], [6, 25]],
  '9-2': [[3, 20], [4, 30]],
}
/** 段考日過後幾天內仍視為「這次」（有些學校晚幾天考） */
const GRACE_DAYS = 3

export type InferredExam = {
  grade: number
  semester: 1 | 2
  seq: 1 | 2 | 3
  date: Date                // 推估的段考日
  label: string             // 「七上第 1 次段考」
  reason: string            // 給學生看的推算理由
}

const DAY = 86400000
const md = (d: Date) => `${d.getMonth() + 1}/${d.getDate()}`

export function examLabel(grade: number, semester: number, seq: number) {
  return `${BOOK_NAME[bookOf(grade, semester)] ?? `${grade} 年級`}第 ${seq} 次段考`
}

/** 這個年級、學期有幾次段考 */
export function examCount(grade: number, semester: number) {
  return (grade === 9 && semester === 2 ? TYPICAL['9-2'] : TYPICAL[String(semester)]).length
}

/** 某學年（以上學期開學的西元年 schoolYear 表示）某次段考的推估日期 */
export function typicalDate(schoolYear: number, grade: number, semester: 1 | 2, seq: number): Date {
  const list = grade === 9 && semester === 2 ? TYPICAL['9-2'] : TYPICAL[String(semester)]
  const [m, d] = list[seq - 1]
  // 上學期 1 月的段考、整個下學期都落在隔年
  const year = semester === 1 && m >= 8 ? schoolYear : schoolYear + 1
  return new Date(year, m - 1, d)
}

/**
 * 依今天日期推算「接下來要考的那一次段考」。
 * @param grade 學生目前的年級（7–9）；暑假（7、8 月）視為準備升上的年級，推算上學期第 1 次段考
 */
export function inferExam(today: Date, grade: number): InferredExam {
  const m = today.getMonth() + 1
  const schoolYear = m >= 8 ? today.getFullYear() : today.getFullYear() - 1
  const t = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime()

  const candidates: { semester: 1 | 2; seq: number; date: Date }[] = []
  for (const semester of [1, 2] as const) {
    for (let seq = 1; seq <= examCount(grade, semester); seq++) candidates.push({ semester, seq, date: typicalDate(schoolYear, grade, semester, seq) })
  }
  const next = candidates.find(c => c.date.getTime() + GRACE_DAYS * DAY >= t)
  if (!next) {
    // 學年最後一次段考也考完了（暑假）→ 準備下學年上學期第 1 次
    const date = typicalDate(schoolYear + 1, grade, 1, 1)
    return {
      grade, semester: 1, seq: 1, date, label: examLabel(grade, 1, 1),
      reason: `現在是暑假，先預習${examLabel(grade, 1, 1)}（通常在 ${md(date)} 左右）的範圍`,
    }
  }
  const days = Math.round((next.date.getTime() - t) / DAY)
  const when = days > 0 ? `約 ${days} 天後（通常在 ${md(next.date)} 左右）` : days === 0 ? '通常就在今天前後' : `通常在 ${md(next.date)} 左右，可能剛考完或這幾天考`
  return {
    grade, semester: next.semester, seq: next.seq as 1 | 2 | 3, date: next.date,
    label: examLabel(grade, next.semester, next.seq),
    reason: `今天 ${md(today)}，最近的一次是${examLabel(grade, next.semester, next.seq)}，${when}。學校日期不同的話可以自己改。`,
  }
}

/** 距離段考還有幾天（學生自填日期優先，否則用推估日期）；已過回 0 */
export function daysUntil(target: Pick<ExamTarget, 'grade' | 'semester' | 'seq' | 'examDate'>, today: Date): number {
  const t = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime()
  let date: Date
  if (target.examDate) {
    const [y, m, d] = target.examDate.split('-').map(Number)
    date = new Date(y, m - 1, d)
  } else {
    const m = today.getMonth() + 1
    const schoolYear = m >= 8 ? today.getFullYear() : today.getFullYear() - 1
    date = typicalDate(schoolYear, target.grade, target.semester, target.seq)
    if (date.getTime() + GRACE_DAYS * DAY < t) date = typicalDate(schoolYear + 1, target.grade, target.semester, target.seq)
  }
  return Math.max(0, Math.round((date.getTime() - t) / DAY))
}

// ── 主流範圍 ─────────────────────────────────────────────────────
export type ScopeUnit = { code: string; title: string; chapter: string; share: number }
export type ScopeSlot = Record<string, { docs: number; units: ScopeUnit[] }>   // 版本（或 '*'＝全部）→ 統計
export type ScopeData = { source: string; slots: Record<string, ScopeSlot> }

/** 預設勾選的門檻：一半以上的學校這次段考會考 */
export const MAINSTREAM_SHARE = 0.5
/** 某版本的考卷少於這個數，改用全部版本合併的統計 */
const MIN_DOCS = 8

export function scopeKey(subject: string, grade: number, semester: number, seq: number) {
  const o = OLE_SUBJECT[subject]
  return o ? `${o.subject}|${o.sub}|${grade}|${semester}|${seq}` : ''
}

/**
 * 取某次段考的單元出現率；版本資料太少時退回全部版本合併。
 * 數學、自然各版本節次對齊，統計本來就是合併的。
 */
export function examUnits(data: ScopeData, subject: string, grade: number, semester: number, seq: number, publisher: string):
  { units: ScopeUnit[]; docs: number; basis: 'publisher' | 'all' | 'merged' } | null {
  const slot = data.slots[scopeKey(subject, grade, semester, seq)]
  if (!slot) return null
  const own = slot[publisher]
  if (own && own.docs >= MIN_DOCS) return { units: own.units, docs: own.docs, basis: 'publisher' }
  const all = slot['*']
  // 只有合併統計（數學、自然各版本節次對齊）→ 'merged'；有分版本但這版太少 → 'all'
  const merged = Object.keys(slot).every(k => k === '*')
  return all ? { units: all.units, docs: all.docs, basis: merged ? 'merged' : 'all' } : null
}

/** 主流範圍：出現率 ≥ 門檻的單元代號 */
export function mainstreamUnits(units: ScopeUnit[], threshold = MAINSTREAM_SHARE): string[] {
  return units.filter(u => u.share >= threshold).map(u => u.code)
}
