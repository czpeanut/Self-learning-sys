'use client'

// 學生主控台（霓虹方塊版）：
//   主色區塊（問候、連續天數、到館狀態）→ 今日目標刻度環 → 8 個功能入口 → 知識點掌握＋最近的報告
//   右欄（手機排在後面）：段考倒數橫幅、待做的程度檢測、今日任務（簽到、續練、到期錯題、段考、特訓、每日目標；第一項加漸層外框）

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import InstallApp from '@/components/InstallApp'
import PendingTests from '@/components/PendingTests'
import { SegBar, fmtDate, fmtPct } from '@/components/ui'
import { Entry, Gauge, HeroDecor, HexBadge, Icon, type IconName, Tile, type TileColor } from '@/components/brand'
import { CLOUD } from '@/lib/auth-shared'
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

  const goalPct = Math.min(100, Math.round((d.today.answered / Math.max(1, d.goal)) * 100))
  const acc = d.today.answered ? Math.round((d.today.correct / d.today.answered) * 100) : null
  const hour = new Date().getHours()
  const hello = hour < 11 ? '早安' : hour < 18 ? '午安' : '晚安'

  return (
    <div className="relative">
      {/* ── 主色區塊：問候＋連續天數／到館狀態 ── */}
      <div className="relative -mx-4 -mt-4 px-4 pb-5 pt-5 sm:-mt-6 sm:pt-7">
        <div className="hero-band h-[210px] md:h-[190px]"><HeroDecor /></div>
        <div className="relative flex flex-wrap items-center gap-3">
          <span className="flex h-12 w-12 items-center justify-center bg-ink text-xl font-black text-[#d4f53c] shadow-lift" style={{ borderRadius: '16px 4px 16px 16px' }}>{(d.name || '同').slice(0, 1)}</span>
          <div className="min-w-0">
            <div className="font-mono text-[11px] font-bold tracking-wider text-ink/70">{isoWeek()}</div>
            <h1 className="text-[22px] font-black leading-tight sm:text-[26px]">{hello}，{d.name || '同學'}</h1>
          </div>
          <div className="flex w-full flex-wrap gap-2 text-[13px] sm:ml-auto sm:w-auto">
            <span className="flex items-center gap-1.5 bg-ink/85 px-3 py-1.5 text-white leaf-sm"><span className="text-[#ffb547]"><Icon name="flame" size={15} /></span>連續 <b className="font-head text-[#d4f53c]">{d.streak}</b> 天</span>
            {!d.studyDay
              ? <Link href="/study" className="flex items-center gap-1.5 bg-white/80 px-3 py-1.5 font-medium leaf-sm">今天還沒簽到 →</Link>
              : <span className="flex items-center gap-1.5 bg-ink/85 px-3 py-1.5 text-white leaf-sm">{d.studyDay.checkOutAt ? `已簽退 ${hm(d.studyDay.checkInAt)}–${hm(d.studyDay.checkOutAt)}` : `在館中 · ${hm(d.studyDay.checkInAt)}${d.studyDay.seat ? ` · ${d.studyDay.seat}` : ''}`}</span>}
          </div>
        </div>
      </div>

      {/* 手機：目標 → 入口 → 段考與任務 → 知識點；桌機：左欄目標／入口／知識點，右欄段考與任務 */}
      <div className="relative grid gap-5 lg:grid-cols-[1.4fr_1fr] lg:grid-rows-[auto_auto_1fr]">
          {/* ── 今日目標：放射刻度環＋數字 ── */}
          <div className="card relative flex min-w-0 flex-wrap items-center gap-x-5 gap-y-3 overflow-hidden p-4 shadow-lift sm:p-5 lg:col-start-1" style={{ borderRadius: '24px 6px 24px 24px' }}>
            <div aria-hidden className="pointer-events-none absolute -right-8 -top-8 h-28 w-28 rotate-45 rounded-[26px]" style={{ background: 'linear-gradient(135deg, rgba(95,227,161,0.22), transparent)' }} />
            <Gauge value={d.today.answered} total={d.goal} size={92}>
              <div className="font-head text-2xl font-bold leading-none tabular-nums">{d.today.answered}</div>
              <div className="text-[10px] text-ink-muted">/ {d.goal} 題</div>
            </Gauge>
            <div className="relative min-w-0 flex-1 space-y-2">
              <div className="text-[15px] font-bold">{d.today.answered >= d.goal ? '今日目標達成 🎉' : `今日目標還差 ${d.goal - d.today.answered} 題`}</div>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-muted">
                <span>正確率 <b className="grad-text font-head text-base">{acc == null ? '—' : `${acc}%`}</b></span>
                <span>作答 <b className="font-head text-base text-ink">{d.today.minutes}</b> 分鐘</span>
                <span>待複習 <b className="font-head text-base text-ink">{d.due}</b> 題</span>
              </div>
              <div className="sr-only">今日進度 {goalPct}%</div>
            </div>
            <Link href={d.active ? `/practice/session?id=${d.active.id}` : '/practice/new'} className="btn-primary relative w-full sm:w-auto">
              {d.active ? '繼續練習 →' : '開始自習 →'}
            </Link>
          </div>

          {/* ── 功能入口 ── */}
          <div className="min-w-0 space-y-4 lg:col-start-1">
            <div className="grid grid-cols-4 gap-x-2 gap-y-4 sm:grid-cols-8">
              {ENTRIES.map(e => <Entry key={e.href} {...e} />)}
            </div>
            {ai && !ai.ai && (
              <div className="leaf border border-amber-500/30 bg-amber-50 px-4 py-2 text-sm text-amber-900">示範模式：未設定 GEMINI_API_KEY，只有部分數學知識點能出真題（見開始自習頁的「免AI」標示）。</div>
            )}
          </div>

          {/* ── 右欄：段考倒數＋今日任務 ── */}
          <div className="min-w-0 space-y-5 lg:col-start-2 lg:row-span-3 lg:row-start-1">
            <ExamBanner exam={exam} />
            <PendingTests />
            <InstallApp variant="card" />
            <Tasks d={d} exam={exam} weak={weakAll} onReview={startReview} />
          </div>

          {/* ── 知識點掌握 ── */}
          <div className="card min-w-0 self-start overflow-hidden lg:col-start-1">
            <div className="flex flex-wrap items-end justify-between gap-3 px-4 pt-4">
              <div className="sect !mb-0">
                <div className="kicker">Knowledge</div>
                <h2>知識點掌握</h2>
              </div>
              {d.mastery.length > 0 && (
                <div className="w-full max-w-[260px] sm:w-[260px]">
                  <SegBar bad={all.bad} mid={all.mid} good={all.good} className="!h-2.5" />
                  <div className="mt-1 flex justify-between text-[11px] text-ink-muted"><span>待加強 {all.bad}</span><span>進步中 {all.mid}</span><span>已掌握 {all.good}</span></div>
                </div>
              )}
            </div>
            {chapters.length === 0 ? (
              <p className="px-4 pb-4 pt-2 text-sm text-ink-muted">還沒有練習紀錄。從「開始自習」選一個範圍練一波，這裡會列出每個章節的掌握情形。</p>
            ) : (
              <>
              {/* 手機：列表 */}
              <div className="stagger mt-3 sm:hidden">
                {chapters.map(c => (
                  <Link key={c.key} href={c.weak.length ? `/drill?${c.weak.slice(0, 6).map(w => `t=${encodeURIComponent(kpKey(w))}`).join('&')}` : '/practice/new'} className="rowlink !grid grid-cols-[1fr_70px_auto] text-sm">
                    <span className="min-w-0"><span className="block truncate font-medium">{c.chapter}</span><span className="block truncate text-xs text-ink-muted">{c.weak.slice(0, 2).map(w => w.kp).join(' · ') || '都在進步中'}</span></span>
                    <SegBar bad={c.bad} mid={c.mid} good={c.good} />
                    <span className="mono text-right text-ink-muted">{c.week} 題</span>
                  </Link>
                ))}
              </div>
              {/* 平板／桌機：資料矩陣 */}
              <div className="mt-3 hidden overflow-x-auto sm:block">
                <table className="matrix">
                  <thead><tr><th className="!pl-4">章節</th><th>本週</th><th className="w-[28%]">掌握分布</th><th>待加強</th><th className="!pr-4" /></tr></thead>
                  <tbody>
                    {chapters.map((c, i) => (
                      <tr key={c.key} className={i === 0 && c.week > 0 ? 'is-top' : undefined}>
                        <td className="!pl-4"><div className="font-medium">{c.chapter}</div><div className="text-xs text-ink-muted">{c.subject}</div></td>
                        <td className="font-head text-[14px] font-semibold tabular-nums">{c.week}</td>
                        <td><SegBar bad={c.bad} mid={c.mid} good={c.good} /></td>
                        <td className="max-w-[180px] truncate text-[13px] text-ink-soft">{c.weak.slice(0, 2).map(w => w.kp).join(' · ') || '—'}</td>
                        <td className="!pr-4 text-right">
                          {c.weak.length > 0
                            ? <Link className="t-violet leaf-sm inline-block px-3 py-1 text-xs font-bold text-white" style={{ background: 'var(--tile)' }} href={`/drill?${c.weak.slice(0, 6).map(w => `t=${encodeURIComponent(kpKey(w))}`).join('&')}`}>特訓</Link>
                            : <span className="text-xs font-bold text-brand-600">OK</span>}
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
              <Link href="/progress" className="text-sm font-medium text-brand-600 hover:underline">全部 →</Link>
            </div>
            {d.recent.length === 0 ? <p className="px-4 pb-4 text-sm text-ink-muted">還沒有完成的練習</p> : (
              <div className="stagger">
                {d.recent.map(s => {
                  const answers = s.rounds.flatMap(r => r.answers)
                  const c = answers.filter(a => a.correct).length
                  return (
                    <Link key={s.id} href={`/report?id=${s.id}`} className="rowlink text-sm">
                      <span className="chip min-w-[64px] justify-center bg-paper">{sessionLabel(s)}</span>
                      <span className="min-w-0 flex-1 truncate text-ink-soft">{s.rounds.length} 波 · {s.scope.length} 個{s.exam || s.mode === 'drill' ? '題型' : '知識點'}</span>
                      <span className="mono hidden text-ink-muted sm:inline">{fmtDate(s.createdAt)}</span>
                      <span className="font-head text-[13px] font-semibold tabular-nums">{c}/{answers.length} · {fmtPct(c / Math.max(1, answers.length))}</span>
                    </Link>
                  )
                })}
              </div>
            )}
          </div>
      </div>
    </div>
  )
}

const ENTRIES: { href: string; color: TileColor; icon: IconName; label: string }[] = [
  { href: '/practice/new', color: 'blue', icon: 'book', label: '開始自習' },
  { href: '/exam', color: 'orange', icon: 'target', label: '段考衝刺' },
  { href: '/wrong-book', color: 'pink', icon: 'wrong', label: '錯題本' },
  { href: '/drill', color: 'violet', icon: 'bolt', label: '弱項特訓' },
  CLOUD ? { href: '/tests', color: 'green', icon: 'check', label: '程度檢測' } : { href: '/progress', color: 'green', icon: 'trend', label: '學習歷程' },
  { href: '/today', color: 'yellow', icon: 'chart', label: '今日成果' },
  { href: '/study', color: 'sky', icon: 'timer', label: 'K書模式' },
  { href: '/habits', color: 'slate', icon: 'pulse', label: '學習習慣' },
]

/** 段考倒數橫幅：橘粉漸層＋斜紋＋六角徽章 */
function ExamBanner({ exam }: { exam: ExamSummary | null }) {
  const pct = exam ? Math.round(exam.r.readiness * 100) : 0
  return (
    <Link href="/exam" className="relative flex items-center gap-4 overflow-hidden px-4 py-3.5 text-white shadow-[0_14px_30px_-14px_rgba(240,50,106,0.75)] transition active:scale-[.99]"
      style={{ background: 'var(--exam-grad)', borderRadius: '22px 5px 22px 22px' }}>
      <div aria-hidden className="absolute inset-y-0 -right-2 w-32" style={{ background: 'repeating-linear-gradient(120deg, rgba(255,255,255,0.14) 0 8px, transparent 8px 18px)' }} />
      <HexBadge value={exam ? exam.r.daysLeft : '?'} sub="DAYS" />
      <div className="relative min-w-0 flex-1 space-y-1.5">
        {exam ? <>
          <div className="text-[15px] font-bold">{exam.label} · 準備度 <span className="font-head">{pct}%</span></div>
          <div className="h-2 bg-white/30 leaf-sm"><div className="sweep h-2 leaf-sm" style={{ width: `${pct}%`, background: 'linear-gradient(90deg, #fff3a6, #ffe066)' }} /></div>
          <div className="truncate text-xs opacity-95">{exam.r.gaps.length ? `最該先補：${exam.r.gaps.slice(0, 2).map(g => g.name).join('、')}` : '範圍內題型都熟練了'}</div>
        </> : <>
          <div className="text-[15px] font-bold">設定段考範圍</div>
          <div className="text-xs opacity-95">不選就依日期推算第幾次段考，系統算出你還缺什麼</div>
        </>}
      </div>
    </Link>
  )
}

type Task = { key: string; color: TileColor; icon: IconName; title: string; desc: string; href?: string; onClick?: () => void; cta: string }

function Tasks({ d, exam, weak, onReview }: { d: HomeData; exam: ExamSummary | null; weak: KPMastery[]; onReview: () => void }) {
  const tasks: Task[] = []
  if (d.active) {
    tasks.push({ key: 'resume', color: 'blue', icon: 'book', title: `繼續${sessionLabel(d.active)}`, desc: `${d.active.scope.length} 個${d.active.exam || d.active.mode === 'drill' ? '題型' : '知識點'} · ${fmtDate(d.active.createdAt)} 開始，進度已自動儲存`, href: `/practice/session?id=${d.active.id}`, cta: '繼續' })
  }
  if (!d.studyDay) {
    tasks.push({ key: 'checkin', color: 'sky', icon: 'cal', title: '到館簽到', desc: '訂好今天的計畫再開始，家長會收到到館通知與學習日報', href: '/study', cta: '簽到' })
  }
  if (d.due > 0) {
    tasks.push({ key: 'review', color: 'pink', icon: 'wrong', title: `複習到期錯題 ${d.due} 題`, desc: '隔一段時間重做最不容易忘；連續答對 5 次就算克服', onClick: onReview, cta: '去複習' })
  }
  if (exam) {
    tasks.push({ key: 'exam', color: 'orange', icon: 'target', title: `段考衝刺：今天 ${exam.r.todayDone}/${exam.r.perDay} 題`, desc: `距離${exam.label} ${exam.r.daysLeft} 天，每天照進度練就跟得上`, href: '/exam', cta: '衝刺' })
  }
  if (weak.length) {
    tasks.push({ key: 'drill', color: 'violet', icon: 'bolt', title: `特訓：${weak.slice(0, 2).map(w => w.kp).join('、')}`, desc: '原題重做＋同題型新題，連續答對 3 題才算達標', href: `/drill?${weak.map(w => `t=${encodeURIComponent(kpKey(w))}`).join('&')}`, cta: '開始' })
  }
  if (d.today.answered < d.goal) {
    tasks.push({ key: 'goal', color: 'green', icon: 'flame', title: `今天還差 ${d.goal - d.today.answered} 題達標`, desc: '選範圍，先檢測、再針對錯的地方出變化題', href: '/practice/new', cta: '自習' })
  }

  return (
    <section>
      <div className="mb-2 flex items-baseline justify-between">
        <h2 className="text-[18px] font-black">今日任務</h2>
        <span className="text-xs text-ink-muted">{tasks.length ? `共 ${tasks.length} 件，重要的在上面` : '今天的任務都完成了 🎉'}</span>
      </div>
      <div className="stagger space-y-2.5">
        {tasks.map((t, i) => {
          const dark = t.color === 'yellow' || t.color === 'lime'
          const body = (
            <>
              <Tile color={t.color} icon={t.icon} size={42} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-bold">{t.title}</span>
                <span className="block truncate text-xs text-ink-muted">{t.desc}</span>
              </span>
              <span className={`t-${t.color} leaf-sm shrink-0 px-3 py-1.5 text-xs font-bold ${dark ? 'text-ink' : 'text-white'}`} style={{ background: 'var(--tile)' }}>{t.cta}</span>
            </>
          )
          const cls = `card flex w-full items-center gap-3 p-2.5 pr-3 text-left transition hover:shadow-lift ${i === 0 ? 'frame' : ''}`
          return t.href
            ? <Link key={t.key} href={t.href} className={cls}>{body}</Link>
            : <button key={t.key} onClick={t.onClick} className={cls}>{body}</button>
        })}
      </div>
    </section>
  )
}
