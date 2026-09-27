'use client'

// ── 本機儲存層（雛形用 localStorage） ─────────────────────────────
// 所有讀寫都集中在這裡，之後改接 Supabase 只要換掉這個檔案的實作
// （對應的資料表設計見 supabase/schema.sql）。

import type { Answer, DayPlan, FocusBlock, AskRecord, KPMastery, Question, Reflection, Session, SessionSettings, StudyDay, WrongItem } from './types'
import { DEFAULT_SETTINGS, kpKey } from './types'
import { newMastery, updateMastery } from './engine'

const NS = 'sls:v1:'
const DAY = 86400000
/** Leitner 盒子的複習間隔（天）：答對升一盒，升過最後一盒視為已克服 */
export const REVIEW_INTERVALS = [1, 2, 4, 7, 15]

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(NS + key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch { return fallback }
}
function write<T>(key: string, value: T) {
  try { localStorage.setItem(NS + key, JSON.stringify(value)) } catch (e) { console.warn('儲存失敗', e) }
}

// ── 個人設定 ──
export type Profile = { name: string; grade: string; defaults: SessionSettings; dailyGoal: number }
export function getProfile(): Profile {
  const saved = read<Partial<Profile>>('profile', {})
  return { name: '', grade: '', dailyGoal: 20, ...saved, defaults: { ...DEFAULT_SETTINGS, ...saved.defaults } }
}
export const saveProfile = (p: Profile) => write('profile', p)

// ── 掌握度 ──
export const getMasteryMap = () => read<Record<string, KPMastery>>('mastery', {})
export const saveMasteryMap = (m: Record<string, KPMastery>) => write('mastery', m)

/** 套用一次作答到掌握度表（回傳新表並存檔） */
export function applyAnswer(q: Question, a: Answer): Record<string, KPMastery> {
  const map = getMasteryMap()
  const key = kpKey(q)
  map[key] = updateMastery(map[key] ?? newMastery(q), q, a)
  saveMasteryMap(map)
  return map
}

// ── 練習紀錄 ──
export const listSessions = () => read<Session[]>('sessions', []).sort((a, b) => b.createdAt - a.createdAt)
export const getSession = (id: string) => listSessions().find(s => s.id === id) ?? null
export function saveSession(s: Session) {
  const all = read<Session[]>('sessions', []).filter(x => x.id !== s.id)
  all.push(s)
  write('sessions', all.slice(-100))   // 只留最近 100 次，避免 localStorage 爆量
}
export function deleteSession(id: string) {
  write('sessions', read<Session[]>('sessions', []).filter(x => x.id !== id))
}

// ── 錯題本 ＋ 間隔複習 ──
export const getWrongBook = () => read<WrongItem[]>('wrongbook', [])
const saveWrongBook = (w: WrongItem[]) => write('wrongbook', w.slice(-500))

export function recordWrong(q: Question, a: Answer) {
  if (q.demo) return                         // 示範題不進錯題本
  const book = getWrongBook()
  const now = Date.now()
  const hit = book.find(w => w.question.id === q.id || (w.question.stem === q.stem && w.question.kp === q.kp))
  if (hit) {
    hit.wrongCount++
    hit.lastWrongAt = now
    hit.lastAnswer = a.chosen
    hit.errorType = a.errorType
    hit.box = 0
    hit.nextReviewAt = now + REVIEW_INTERVALS[0] * DAY
    hit.resolved = false
  } else {
    book.push({ question: q, wrongCount: 1, lastWrongAt: now, lastAnswer: a.chosen, errorType: a.errorType,
      box: 0, nextReviewAt: now + REVIEW_INTERVALS[0] * DAY, resolved: false })
  }
  saveWrongBook(book)
}

/** 複習模式作答結果：答對升盒，答錯回到第 0 盒 */
export function recordReview(questionId: string, correct: boolean, chosen: number | null) {
  const book = getWrongBook()
  const item = book.find(w => w.question.id === questionId)
  if (!item) return
  const now = Date.now()
  if (correct) {
    item.box++
    if (item.box >= REVIEW_INTERVALS.length) item.resolved = true
    else item.nextReviewAt = now + REVIEW_INTERVALS[item.box] * DAY
  } else {
    item.box = 0
    item.wrongCount++
    item.lastWrongAt = now
    item.lastAnswer = chosen
    item.nextReviewAt = now + REVIEW_INTERVALS[0] * DAY
  }
  saveWrongBook(book)
}

export function setWrongResolved(questionId: string, resolved: boolean) {
  const book = getWrongBook()
  const item = book.find(w => w.question.id === questionId)
  if (item) { item.resolved = resolved; saveWrongBook(book) }
}

export function removeWrong(questionId: string) {
  saveWrongBook(getWrongBook().filter(w => w.question.id !== questionId))
}

export const dueReviews = (now = Date.now()) => getWrongBook().filter(w => !w.resolved && w.nextReviewAt <= now)

// ── 每日活動（連續天數、每日目標） ──
export type DayLog = { date: string; answered: number; correct: number; minutes: number }
export const today = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
export const getActivity = () => read<DayLog[]>('activity', [])

export function logActivity(correct: boolean, timeMs: number) {
  const logs = getActivity()
  const key = today()
  let d = logs.find(l => l.date === key)
  if (!d) { d = { date: key, answered: 0, correct: 0, minutes: 0 }; logs.push(d) }
  d.answered++
  if (correct) d.correct++
  d.minutes = Math.round((d.minutes + timeMs / 60000) * 10) / 10
  write('activity', logs.slice(-400))
}

/** 連續練習天數（今天還沒練不會中斷，從昨天往回算） */
export function streakDays(): number {
  const set = new Set(getActivity().filter(l => l.answered > 0).map(l => l.date))
  const d = new Date()
  if (!set.has(today(d))) d.setDate(d.getDate() - 1)
  let n = 0
  while (set.has(today(d))) { n++; d.setDate(d.getDate() - 1) }
  return n
}
export const todayLog = (): DayLog => getActivity().find(l => l.date === today()) ?? { date: today(), answered: 0, correct: 0, minutes: 0 }

// ── K書中心：到館紀錄 ──
export const getStudyDays = () => read<StudyDay[]>('studydays', []).sort((a, b) => a.date.localeCompare(b.date))
export const getStudyDay = (date = today()) => getStudyDays().find(d => d.date === date) ?? null
function saveStudyDay(day: StudyDay) {
  write('studydays', [...getStudyDays().filter(d => d.date !== day.date), day].slice(-400))
}
/** 簽到：同一天已簽退後再簽到 → 接續同一筆（清掉簽退時間） */
export function checkIn(plan: DayPlan, seat?: string): StudyDay {
  const prev = getStudyDay()
  const day: StudyDay = prev
    ? { ...prev, plan, seat: seat || prev.seat, checkOutAt: undefined }
    : { date: today(), checkInAt: Date.now(), plan, seat: seat || undefined, blocks: [] }
  saveStudyDay(day)
  return day
}
export function updateStudyDay(patch: (d: StudyDay) => StudyDay, date = today()): StudyDay | null {
  const d = getStudyDay(date)
  if (!d) return null
  const next = patch(d)
  saveStudyDay(next)
  return next
}
export function startBlock(subject: string, kind: FocusBlock['kind'], plannedMin: number) {
  return updateStudyDay(d => ({ ...d, active: { start: Date.now(), subject, kind, plannedMin, distractions: 0 } }))
}
/** 結束目前計時；completed = 是否撐完預定時間 */
export function endBlock() {
  return updateStudyDay(d => {
    if (!d.active) return d
    // 計時跑完時學生可能在別的頁面練習，回來才結算 → 結束時間以預定長度為上限
    const planned = d.active.start + d.active.plannedMin * 60000
    const end = Math.min(Date.now(), planned)
    const completed = end >= planned - 1000
    return { ...d, active: undefined, blocks: [...d.blocks, { ...d.active, end, completed }] }
  })
}
export function addDistraction() {
  return updateStudyDay(d => (d.active && d.active.kind === 'focus' ? { ...d, active: { ...d.active, distractions: d.active.distractions + 1 } } : d))
}
export function checkOut(reflection: Reflection) {
  endBlock()
  return updateStudyDay(d => ({ ...d, checkOutAt: Date.now(), reflection }))
}
export function setParentNote(date: string, text: string) {
  return updateStudyDay(d => ({ ...d, parentNote: text.trim() ? { text: text.trim(), at: Date.now(), read: false } : undefined }), date)
}
/** 最近一則還沒讀的家長留言 */
export function unreadParentNote(): { date: string; text: string } | null {
  const d = getStudyDays().reverse().find(x => x.parentNote && !x.parentNote.read)
  return d?.parentNote ? { date: d.date, text: d.parentNote.text } : null
}
export function markParentNoteRead(date: string) {
  updateStudyDay(d => (d.parentNote ? { ...d, parentNote: { ...d.parentNote, read: true } } : d), date)
}

// ── 問 AI（詳解快取、追問、看懂了沒） ──
export const getAsks = () => read<AskRecord[]>('asks', [])
export const getAsk = (questionId: string) => getAsks().find(a => a.questionId === questionId) ?? null
export function saveAsk(q: Question, patch: Partial<Omit<AskRecord, 'questionId' | 'question' | 'createdAt'>>): AskRecord {
  const list = getAsks()
  const prev = list.find(a => a.questionId === q.id)
  const now = Date.now()
  const rec: AskRecord = {
    questionId: q.id, question: q, createdAt: prev?.createdAt ?? now, followups: [], understood: null,
    ...prev, ...patch, updatedAt: now,
  }
  write('asks', [...list.filter(a => a.questionId !== q.id), rec].slice(-500))
  // 看完 AI 解說仍不懂 → 就算這題答對也排進錯題複習
  if (patch.understood === false && !q.demo && !getWrongBook().some(w => w.question.id === q.id)) {
    recordWrong(q, { questionId: q.id, chosen: null, correct: false, confidence: 'unsure', usedHint: false, timeMs: 0, errorType: 'unfamiliar' })
  }
  return rec
}

// ── 備份 / 還原（換電腦或清快取前使用） ──
const KEYS = ['profile', 'mastery', 'sessions', 'wrongbook', 'activity', 'studydays', 'asks']
export function exportAll(): string {
  const data: Record<string, unknown> = { version: 1, exportedAt: new Date().toISOString() }
  for (const k of KEYS) data[k] = read(k, null)
  return JSON.stringify(data)
}
export function importAll(json: string): boolean {
  try {
    const data = JSON.parse(json) as Record<string, unknown>
    if (data.version !== 1) return false
    for (const k of KEYS) if (data[k] != null) write(k, data[k])
    return true
  } catch { return false }
}
export function clearAll() {
  for (const k of KEYS) localStorage.removeItem(NS + k)
}
