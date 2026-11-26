'use client'

// 學生端：讀自己的紙本練功卷，把閱卷結果併進本機紀錄（段考準備度、錯題本），之後照常同步到雲端

import { BOOK_NAME } from './exam'
import { importAttempts, recordWrong } from './storage'
import { authFetch } from './supabase'
import type { Attempt, Question } from './types'
import type { Diagnosis, ItemResult, Layout, WorkbookItem, WorkbookStatus, WorkbookSummary } from './workbook'

export type MyWorkbook = {
  id: string; code: string; title: string; book: string; exam_seq: number; round: number; status: WorkbookStatus
  sent_at: string | null; graded_at: string | null; created_at: string; layout: Layout | null
  items: (Omit<WorkbookItem, 'answer'> & { answer: number | null })[]; results: Record<string, ItemResult>
  diagnosis: Diagnosis; summary: WorkbookSummary; attempts: Attempt[]
}

export async function syncWorkbooks(): Promise<MyWorkbook[]> {
  const res = await authFetch('/api/workbooks')
  if (!res.ok) return []
  const list = ((await res.json()) as { workbooks: MyWorkbook[] }).workbooks
  for (const w of list) {
    const added = importAttempts(w.attempts)
    // 新閱到的錯題收進錯題本
    for (const a of added.filter(x => !x.correct)) {
      const it = w.items.find(i => i.qid === a.qid)
      if (!it || it.answer == null) continue
      const q: Question = {
        id: it.qid, subject: '數學', chapter: `${BOOK_NAME[it.book]} ${it.unit} ${it.unitTitle}`, kp: it.typeName, difficulty: it.difficulty,
        stem: it.stem, options: it.options, answerIndex: it.answer, explanation: '', source: 'bank',
        origin: { book: it.book, unit: it.unit, type: it.type, qid: it.qid }, cite: it.cite,
      }
      recordWrong(q, { questionId: it.qid, chosen: w.results[String(it.no)]?.chosen ?? null, correct: false, confidence: 'sure', usedHint: false, timeMs: 0 })
    }
  }
  return list
}
