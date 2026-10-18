'use client'

// 讀目前登入學生的目標段考＋題型目錄，算出準備度（首頁卡片、家長日報共用）

import { useEffect, useState } from 'react'
import { BANK_SUBJECTS, bookOf, daysUntil, examLabel } from './exam'
import { type PoolCatalog, type Readiness, computeReadiness } from './readiness'
import { getAttempts, getExamTarget } from './storage'
import type { ExamTarget } from './types'

export type ExamSummary = { target: ExamTarget; label: string; r: Readiness }

export function useExamReadiness(): ExamSummary | null {
  const [s, setS] = useState<ExamSummary | null>(null)
  useEffect(() => {
    const target = getExamTarget()
    if (!target || !BANK_SUBJECTS.includes(target.subject) || target.units.length === 0) return
    let alive = true
    fetch(`/api/exam/catalog?subject=${encodeURIComponent(target.subject)}&book=${bookOf(target.grade, target.semester)}`)
      .then(r => (r.ok ? r.json() : null))
      .then((cat: PoolCatalog | null) => {
        if (!alive || !cat) return
        const r = computeReadiness({ cat, units: target.units, attempts: getAttempts(), daysLeft: daysUntil(target, new Date()) })
        setS({ target, label: `${target.subject} ${examLabel(target.grade, target.semester, target.seq)}`, r })
      })
      .catch(() => {})
    return () => { alive = false }
  }, [])
  return s
}

/** 某一天開始前與結束時的準備度（今日成果報告用）；沒設段考或非題庫科目回傳 null */
export function useExamReadinessChange(date: string): { label: string; before: number; after: number } | null {
  const [s, setS] = useState<{ label: string; before: number; after: number } | null>(null)
  useEffect(() => {
    setS(null)
    const target = getExamTarget()
    if (!date || !target || !BANK_SUBJECTS.includes(target.subject) || target.units.length === 0) return
    let alive = true
    const start = new Date(date + 'T00:00:00').getTime()
    const end = start + 86400000
    fetch(`/api/exam/catalog?subject=${encodeURIComponent(target.subject)}&book=${bookOf(target.grade, target.semester)}`)
      .then(r => (r.ok ? r.json() : null))
      .then((cat: PoolCatalog | null) => {
        if (!alive || !cat) return
        const all = getAttempts()
        const at = (attempts: typeof all, now: number) =>
          computeReadiness({ cat, units: target.units, attempts, daysLeft: daysUntil(target, new Date(now)), now }).readiness
        setS({
          label: `${target.subject} ${examLabel(target.grade, target.semester, target.seq)}`,
          before: at(all.filter(a => a.at < start), start),
          after: at(all.filter(a => a.at < end), Math.min(end, Date.now())),
        })
      })
      .catch(() => {})
    return () => { alive = false }
  }, [date])
  return s
}
