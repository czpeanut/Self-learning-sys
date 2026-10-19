'use client'

// 學生主控台（版面參照 student-app v2 主控台）：
//   情境列 → 統計格 → 雙欄（左：知識點掌握矩陣＋最近的學習報告／右：今日任務）
// 和 v2 的差異：右欄是「今日任務」（簽到、續練、到期錯題、段考缺口、特訓、每日目標依序排），
// 第一項放在 L 形角框裡，其餘編號 02、03…

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import InstallApp from '@/components/InstallApp'
import PendingTests from '@/components/PendingTests'
import { SegBar, fmtDate, fmtPct } from '@/components/ui'
import { masteryLevel } from '@/lib/engine'
import { createReviewSession } from '@/lib/session-client'
import { dueReviews, getMasteryMap, getProfile, getStudyDay, listSessions, streakDays, todayLog } from '@/lib/storage'
import type { KPMastery, Session, StudyDay } from '@/lib/types'
import { kpKey, sessionLabel } from '@/lib/types'
import { useAIStatus } from '@/lib/use-ai-status'
import { type ExamSummary, useExamReadiness } from '@/lib/use-exam-readiness'

type HomeData = {
  name: string; goal: number; streak: number
  today: ReturnType<typeof todayLog>
  due: number
  active: Session | null
  studyDay: StudyDay | null
  recent: Session[]
  mastery: KPMastery[]
  week: Map<string, number>          // 章節 → 近 7 天作答題數
}

/** ISO 週次（情境列：2026 W43） */
function isoWeek(d = new Date()) {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
  t.setUTCDate(t.getUTCDate() + 4 - (t.getUTCDay() || 7))
  const y = new Date(Date.UTC(t.getUTCFullYear(), 0, 1))
  return `${t.getUTCFullYear()} W${Math.ceil(((t.getTime() - y.getTime()) / 86400000 + 1) / 7)}`
}
const hm = (t: number) => { const x = new Date(t); return `${String(x.getHours()).padStart(2, '0')}:${String(x.getMinutes()).padStart(2, '0')}` }
const tone = (score: number) => masteryLevel(score).tone

export default function Home() {
  const router = useRouter()
  const ai = useAIStatus()
  const exam = useExamReadiness()
  const [d, setD] = useState<HomeData | null>(null)

  useEffect(() => {
    const sessions = listSessions()
    const p = getProfile()
    const weekAgo = Date.now() - 7 * 86400000
    const week = new Map<string, number>()
    for (const s of sessions) for (const r of s.rounds) {
      if (r.startedAt < weekAgo) continue
      const byId = new Map(r.questions.map(q => [q.id, q]))
      for (const a of r.answers) { const q = byId.get(a.questionId); if (q) week.set(`${q.subject}|${q.chapter}`, (week.get(`${q.subject}|${q.chapter}`) ?? 0) + 1) }
    }
    setD({
      name: p.name, goal: p.dailyGoal, streak: streakDays(), today: todayLog(), due: dueReviews().length,
      active: sessions.find(s => s.status === 'active') ?? null,
      studyDay: getStudyDay(),
      recent: sessions.filter(s => s.status === 'finished').slice(0, 6),
      mastery: Object.values(getMasteryMap()).filter(m => m.attempts > 0),
      week,
    })
  }, [])

  // 知識點掌握矩陣：依章節彙整
  const chapters = useMemo(() => {
    if (!d) return []
    const map = new Map<string, { subject: string; chapter: string; bad: number; mid: number; good: number; weak: KPMastery[] }>()
    for (const m of d.mastery) {
      const k = `${m.subject}|${m.chapter}`
      const c = map.get(k) ?? { subject: m.subject, chapter: m.chapter, bad: 0, mid: 0, good: 0, weak: [] }
      c[tone(m.score)]++
      if (m.score < 60) c.weak.push(m)
      map.set(k, c)
    }
    return Array.from(map.entries()).map(([k, c]) => ({ ...c, key: k, week: d.week.get(k) ?? 0, weak: c.weak.sort((a, b) => a.score - b.score) }))
      .sort((a, b) => b.week - a.week || b.bad - a.bad).slice(0, 8)
  }, [d])

  if (!d) return null
  const all = { bad: 0, mid: 0, good: 0 }
  for (const m of d.mastery) all[tone(m.score)]++
  const weakAll = d.mastery.filter(m => m.score < 60).sort((a, b) => a.score - b.score).slice(0, 6)
  const startReview = () => { const s = createReviewSession(); if (s) router.push(`/practice/session?id=${s.id}`) }

  return (
    <div className="space-y-4">
      {/* ── 情境列 ── */}
      <div className="ctx">
        <span className="font-medium text-ink">{d.name || '同學'}</span>
        <span className="sep">|</span><span className="mono">{isoWeek()}</span>
        <span className="sep">|</span><span>連續練習 {d.streak} 天</span>
        <span className="sep">|</span>
        <span>{!d.studyDay ? '今天還沒簽到' : d.studyDay.checkOutAt ? `已簽退 ${hm(d.studyDay.checkInAt)}–${hm(d.studyDay.checkOutAt)}` : `在館中 · ${hm(d.studyDay.checkInAt)} 簽到${d.studyDay.seat ? ` · 座位 ${d.studyDay.seat}` : ''}`}</span>
        <span className="ml-auto flex gap-3">
          {d.today.answered > 0 && <Link href="/today" className="text-brand-600 hover:underline">今日成果報告</Link>}
          <Link href="/wrong-book" className="text-brand-600 hover:underline">錯題本</Link>
        </span>
      </div>

      <div>
        <h1 className="text-[26px] font-semibold leading-tight">{d.name ? `${d.name}，` : ''}今天想練什麼？</h1>
        <p className="text-sm text-ink-soft">選範圍 → 系統出題 → 依錯題自動調整下一波 → 看學習報告</p>
      </div>

      {ai && !ai.ai && (
        <div className="border border-amber-600/30 bg-amber-50 px-4 py-2 text-sm text-amber-900">示範模式：未設定 GEMINI_API_KEY，只有部分數學知識點能出真題（見開始自習頁的「免AI」標示）。</div>
      )}
      <PendingTests />
      <InstallApp variant="card" />

      {/* ── 統計格 ── */}
      <div className="stat-grid lg:[grid-template-columns:repeat(4,1fr)_1.4fr]">
        <div className="stat">
          <div className="num">{d.today.answered}<small>/{d.goal}</small></div>
          <div className="cap">今日題數 Today</div>
          <div className="mt-2 h-1 bg-black/[.07]"><div className="sweep h-full bg-brand-500" style={{ width: `${Math.min(100, (d.today.answered / Math.max(1, d.goal)) * 100)}%` }} /></div>
        </div>
        <div className="stat">
          <div className="num">{d.today.answered ? Math.round((d.today.correct / d.today.answered) * 100) : '—'}{d.today.answered > 0 && <small>%</small>}</div>
          <div className="cap">今日正確率 Accuracy</div>
          <div className="mt-1 text-xs text-ink-soft">作答 {d.today.minutes} 分鐘</div>
        </div>
        <div className="stat">
          <div className="num">{d.due}</div>
          <div className="cap">待複習錯題 To review</div>
        </div>
        <div className="stat">
          <div className="num">{d.streak}<small>天</small></div>
          <div className="cap">連續練習 Streak</div>
        </div>
        <div className="stat col-span-2 flex flex-col justify-center sm:col-span-4 lg:col-span-1">
          <div className="cap !mt-0 mb-2">知識點分布 Distribution · {d.mastery.length} 個</div>
          <SegBar bad={all.bad} mid={all.mid} good={all.good} className="!h-2.5" />
          <div className="mono mt-1.5 flex justify-between text-ink-muted"><span>待加強 {all.bad}</span><span>進步中 {all.mid}</span><span>已掌握 {all.good}</span></div>
        </div>
      </div>

      {/* ── 雙欄 ── */}
      <div className="grid gap-4 lg:grid-cols-[1.35fr_1fr] lg:items-start">
        {/* 左：知識點掌握矩陣＋最近的學習報告 */}
        <div className="card min-w-0">
          <div className="sect px-4 pt-4">
            <div className="kicker">Knowledge matrix</div>
            <h2>知識點掌握矩陣</h2>
          </div>
          {chapters.length === 0 ? (
            <p className="px-4 pb-4 text-sm text-ink-muted">還沒有練習紀錄。從「開始自習」選一個範圍練一波，這裡會列出每個章節的掌握情形。</p>
          ) : (
            <>
            {/* 手機：列表 */}
            <div className="stagger border-b border-line sm:hidden">
              {chapters.map(c => (
                <Link key={c.key} href={c.weak.length ? `/drill?${c.weak.slice(0, 6).map(w => `t=${encodeURIComponent(kpKey(w))}`).join('&')}` : '/practice/new'} className="rowlink !grid grid-cols-[1fr_70px_auto] text-sm">
                  <span className="min-w-0"><span className="block truncate font-medium">{c.chapter}</span><span className="block truncate text-xs text-ink-muted">{c.weak.slice(0, 2).map(w => w.kp).join(' · ') || '都在進步中'}</span></span>
                  <SegBar bad={c.bad} mid={c.mid} good={c.good} />
                  <span className="mono text-right text-ink-muted">{c.week} 題</span>
                </Link>
              ))}
            </div>
            {/* 桌機：資料矩陣 */}
            <div className="hidden overflow-x-auto sm:block">
              <table className="matrix">
                <thead><tr><th className="!pl-4">章節</th><th>本週</th><th className="w-[28%]">掌握分布</th><th>待加強</th><th className="!pr-4" /></tr></thead>
                <tbody>
                  {chapters.map((c, i) => (
                    <tr key={c.key} className={i === 0 && c.week > 0 ? 'is-top' : undefined}>
                      <td className="!pl-4"><div className="font-medium">{c.chapter}</div><div className="mono text-ink-muted">{c.subject}</div></td>
                      <td className="font-mono text-[13px] tabular-nums">{c.week}</td>
                      <td><SegBar bad={c.bad} mid={c.mid} good={c.good} /></td>
                      <td className="max-w-[180px] truncate text-[13px] text-ink-soft">{c.weak.slice(0, 2).map(w => w.kp).join(' · ') || '—'}</td>
                      <td className="!pr-4 text-right">
                        {c.weak.length > 0
                          ? <Link className="text-[13px] text-brand-600 hover:underline" href={`/drill?${c.weak.slice(0, 6).map(w => `t=${encodeURIComponent(kpKey(w))}`).join('&')}`}>特訓</Link>
                          : <span className="mono text-ink-muted">OK</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            </>
          )}

          <div className="sect flex items-baseline justify-between px-4 pt-5">
            <h2 className="!text-lg">最近的學習報告</h2>
            <Link href="/progress" className="text-sm text-brand-600 hover:underline">全部 →</Link>
          </div>
          {d.recent.length === 0 ? <p className="px-4 pb-4 text-sm text-ink-muted">還沒有完成的練習</p> : (
            <div className="stagger border-b border-line">
              {d.recent.map(s => {
                const answers = s.rounds.flatMap(r => r.answers)
                const c = answers.filter(a => a.correct).length
                return (
                  <Link key={s.id} href={`/report?id=${s.id}`} className="rowlink text-sm">
                    <span className="min-w-[64px] border border-line px-2 py-0.5 text-center text-xs">{sessionLabel(s)}</span>
                    <span className="min-w-0 flex-1 truncate text-ink-soft">{s.rounds.length} 波 · {s.scope.length} 個{s.exam || s.mode === 'drill' ? '題型' : '知識點'}</span>
                    <span className="mono hidden text-ink-muted sm:inline">{fmtDate(s.createdAt)}</span>
                    <span className="font-mono text-[13px] tabular-nums">{c}/{answers.length} · {fmtPct(c / Math.max(1, answers.length))}</span>
                  </Link>
                )
              })}
            </div>
          )}
        </div>

        {/* 右：今日任務 */}
        <div className="min-w-0"><Tasks d={d} exam={exam} weak={weakAll} onReview={startReview} /></div>
      </div>
    </div>
  )
}

type Task = { key: string; kicker: string; title: string; desc: string; href?: string; onClick?: () => void; cta: string; meter?: number }

function Tasks({ d, exam, weak, onReview }: { d: HomeData; exam: ExamSummary | null; weak: KPMastery[]; onReview: () => void }) {
  const tasks: Task[] = []
  if (d.active) {
    tasks.push({ key: 'resume', kicker: 'Resume', title: `繼續${sessionLabel(d.active)}`, desc: `${d.active.scope.length} 個${d.active.exam || d.active.mode === 'drill' ? '題型' : '知識點'} · ${fmtDate(d.active.createdAt)} 開始，進度已自動儲存`, href: `/practice/session?id=${d.active.id}`, cta: '繼續練習' })
  }
  if (!d.studyDay) {
    tasks.push({ key: 'checkin', kicker: 'Check in', title: '到館簽到', desc: '訂好今天的計畫再開始，家長會收到到館通知與學習日報', href: '/study', cta: '簽到' })
  }
  if (d.due > 0) {
    tasks.push({ key: 'review', kicker: 'Spaced review', title: `複習到期錯題 ${d.due} 題`, desc: '隔一段時間重做最不容易忘；答對延後下次複習，連續答對 5 次就算克服', onClick: onReview, cta: `開始複習（${Math.min(d.due, 15)} 題）` })
  }
  if (exam) {
    const pct = Math.round(exam.r.readiness * 100)
    tasks.push({
      key: 'exam', kicker: 'Exam', title: `${exam.label}準備度 ${pct}%`,
      desc: `${exam.r.gaps.length ? `最該先補：${exam.r.gaps.slice(0, 2).map(g => g.name).join('、')}` : '範圍內題型都熟練了'} · 距離段考 ${exam.r.daysLeft} 天，今天 ${exam.r.todayDone}/${exam.r.perDay} 題`,
      href: '/exam', cta: '繼續衝刺', meter: pct,
    })
  } else {
    tasks.push({ key: 'exam', kicker: 'Exam', title: '設定段考範圍', desc: '不選就依日期推算第幾次段考，系統列出所有題型、算出你還缺什麼', href: '/exam', cta: '設定段考' })
  }
  if (weak.length) {
    tasks.push({ key: 'drill', kicker: 'Drill', title: `特訓弱點：${weak.slice(0, 2).map(w => w.kp).join('、')}`, desc: '原題重做＋同題型新題，連續答對 3 題才算達標', href: `/drill?${weak.map(w => `t=${encodeURIComponent(kpKey(w))}`).join('&')}`, cta: '開始特訓' })
  }
  if (d.today.answered < d.goal) {
    tasks.push({ key: 'goal', kicker: 'Daily goal', title: `今天還差 ${d.goal - d.today.answered} 題達標`, desc: '從 9 科的大單元、知識點中選範圍，先檢測、再針對錯的地方出變化題', href: '/practice/new', cta: '開始自習', meter: Math.round((d.today.answered / Math.max(1, d.goal)) * 100) })
  }
  const [first, ...rest] = tasks

  return (
    <div className="card">
      <div className="sect px-4 pt-4">
        <div className="kicker">Today&apos;s tasks</div>
        <h2>今日任務</h2>
        <p className="text-xs text-ink-muted">{tasks.length ? `依序完成 ${tasks.length} 件事，最重要的在最上面` : '今天的任務都完成了'}</p>
      </div>
      {first && (
        <div className="frame mx-4 mb-1 mt-2 border border-line bg-brand-50/40 p-4">
          <div className="kicker !text-ink-muted">01 · {first.kicker}</div>
          <div className="mt-1 font-head text-xl font-semibold leading-snug">{first.title}</div>
          <p className="mt-1 text-sm text-ink-soft">{first.desc}</p>
          {first.meter != null && <div className="mt-2 h-1.5 bg-black/[.07]"><div className="sweep h-full bg-brand-500" style={{ width: `${first.meter}%` }} /></div>}
          {first.href ? <Link href={first.href} className="btn-primary mt-3 w-full">{first.cta}</Link>
            : <button onClick={first.onClick} className="btn-primary mt-3 w-full">{first.cta}</button>}
        </div>
      )}
      {rest.length > 0 && (
        <div className="stagger mt-3 border-b border-line">
          {rest.map((t, i) => {
            const body = (
              <>
                <span className="mono text-ink-muted">{String(i + 2).padStart(2, '0')}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{t.title}</span>
                  <span className="block truncate text-xs text-ink-muted">{t.desc}</span>
                </span>
                <span className="shrink-0 text-xs text-brand-600">{t.cta} →</span>
              </>
            )
            return t.href
              ? <Link key={t.key} href={t.href} className="rowlink">{body}</Link>
              : <button key={t.key} onClick={t.onClick} className="rowlink w-full text-left">{body}</button>
          })}
        </div>
      )}
      <div className="flex gap-2 p-4">
        <Link href="/practice/new" className="btn-primary flex-1">開始自習</Link>
        <Link href="/study" className="btn-outline">K書模式</Link>
      </div>
    </div>
  )
}
