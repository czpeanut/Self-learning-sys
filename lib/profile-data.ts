'use client'

// 從本機紀錄組出學習行為剖析的輸入（練習紀錄、問 AI、錯題本、專注計時）

import { type LearningProfile, buildLearningProfile, type AnswerEvent } from './learning-profile'
import { getAsks, getStudyDays, getWrongBook, listSessions, today } from './storage'
import { kpKey } from './types'

export function collectProfile(): LearningProfile {
  const events: AnswerEvent[] = []
  for (const s of listSessions()) {
    const day = today(new Date(s.createdAt))
    let order = 0
    for (const r of s.rounds) {
      const byId = new Map(r.questions.map(q => [q.id, q]))
      for (const a of r.answers) {
        const q = byId.get(a.questionId)
        if (!q || q.demo) continue
        events.push({
          session: s.id, order: order++, day, timeMs: a.timeMs, correct: a.correct, skipped: a.chosen === null,
          confidence: a.confidence, usedHint: a.usedHint, difficulty: q.difficulty,
          skill: q.origin ? `${q.origin.book}_${q.origin.unit}:${q.origin.type}` : kpKey(q), skillName: q.kp,
        })
      }
    }
  }
  const now = Date.now()
  const book = getWrongBook()
  const focusBlocks = getStudyDays().flatMap(d => d.blocks).filter(b => b.kind === 'focus')
  return buildLearningProfile({
    events,
    asks: getAsks().filter(a => a.solution).map(a => ({ understood: a.understood, followups: a.followups.length })),
    review: {
      overdue: book.filter(w => !w.resolved && w.nextReviewAt < now - 2 * 86400000).length,
      resolved: book.filter(w => w.resolved).length,
      total: book.length,
    },
    focus: {
      minutes: focusBlocks.reduce((s, b) => s + (b.end - b.start) / 60000, 0),
      distractions: focusBlocks.reduce((s, b) => s + b.distractions, 0),
    },
    today: today(),
  })
}
