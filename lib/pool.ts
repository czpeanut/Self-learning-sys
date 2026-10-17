// 題庫題目池（server 端）：讀 data/pool/數學-<冊別>.json（scripts/build_exam_pool.py 從 OLE-QS 唯讀產生）
// 題目、答案都在本專案裡，不需要連 OLE-QS 的資料庫或金鑰。

import fs from 'fs'
import path from 'path'
import { BOOK_NAME } from './exam'
import type { PoolCatalog, PoolUnit } from './readiness'
import type { BankRef, Difficulty, Question } from './types'

type PoolQuestion = {
  id: string; unit: string; type: string; difficulty: number | null
  stem: string; options: string[]; answer: number; answerStatus: string | null; cite: string
}
type PoolFile = PoolCatalog & { subject: string; source: string; builtAt: string; questions: PoolQuestion[] }

const cache = new Map<string, PoolFile | null>()
const BOOK_RE = /^[789]-[12]$/

function load(subject: string, book: string): PoolFile | null {
  if (subject !== '數學' || !BOOK_RE.test(book)) return null
  const key = `${subject}-${book}`
  if (!cache.has(key)) {
    try {
      cache.set(key, JSON.parse(fs.readFileSync(path.join(process.cwd(), 'data', 'pool', `${key}.json`), 'utf8')) as PoolFile)
    } catch { cache.set(key, null) }
  }
  return cache.get(key) ?? null
}

/** 題型目錄＋段考頻率（不含題目本身） */
export function catalog(subject: string, book: string): (PoolCatalog & { source: string; total: number }) | null {
  const p = load(subject, book)
  if (!p) return null
  return { book: p.book, bookName: p.bookName, units: p.units, freq: p.freq, source: p.source, total: p.questions.length }
}

export function findType(subject: string, ref: BankRef): { unit: PoolUnit; name: string } | null {
  const p = load(subject, ref.book)
  const unit = p?.units.find(u => u.code === ref.unit)
  const t = unit?.types.find(x => x.code === ref.type)
  return unit && t ? { unit, name: t.name } : null
}

/** 題庫難度（1–4，題型歸類時評定）→ 本系統三級 */
const toLevel = (d: number | null): Difficulty => (d == null || d <= 1 ? 1 : d === 2 ? 2 : 3)

const shuffle = <T,>(a: T[]) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]] } return a }

/**
 * 從某題型抽 count 題：
 *  1. 優先沒做過的題目（exclude＝學生做過的題號）
 *  2. 難度越接近要求越優先
 *  3. 新題用完才重出做過的題
 */
export function drawFromPool(subject: string, ref: BankRef, count: number, difficulty: Difficulty, exclude: Set<string>): Question[] {
  const p = load(subject, ref.book)
  const found = findType(subject, ref)
  if (!p || !found) return []
  const all = p.questions.filter(q => q.unit === ref.unit && q.type === ref.type)
  const rank = (q: PoolQuestion) => Math.abs(toLevel(q.difficulty) - difficulty) + Math.random() * 0.5
  const fresh = shuffle(all.filter(q => !exclude.has(q.id))).sort((a, b) => rank(a) - rank(b))
  const seen = shuffle(all.filter(q => exclude.has(q.id)))
  return [...fresh, ...seen].slice(0, count).map(q => ({
    id: q.id,
    subject,
    chapter: `${BOOK_NAME[ref.book]} ${ref.unit} ${found.unit.title}`,
    kp: found.name,
    difficulty: toLevel(q.difficulty),
    stem: q.stem,
    options: q.options,
    answerIndex: q.answer,
    explanation: '',
    source: 'bank' as const,
    origin: { ...ref, qid: q.id },
    cite: q.cite,
    answerStatus: q.answerStatus ?? undefined,
  }))
}
