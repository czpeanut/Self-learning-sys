'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import MathText from '@/components/MathText'
import { Empty, ProgressBar } from '@/components/ui'
import { fmtMinutes } from '@/lib/daily-report'
import {
  addDistraction, checkIn, checkOut, endBlock, getAsks, getProfile, getStudyDay, markParentNoteRead,
  startBlock, today, todayLog, unreadParentNote,
} from '@/lib/storage'
import { RECORDABLE_SUBJECTS } from '@/lib/taxonomy'
import { stripFigure } from '@/lib/text'
import type { AskRecord, DayPlan, Mood, StudyDay } from '@/lib/types'
import { MOOD_LABEL } from '@/lib/types'

const hm = (t: number) => { const d = new Date(t); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}` }

export default function StudyPage() {
  const [day, setDay] = useState<StudyDay | null | undefined>(undefined)
  const [asks, setAsks] = useState<AskRecord[]>([])
  const [note, setNote] = useState<{ date: string; text: string } | null>(null)
  const [answeredToday, setAnsweredToday] = useState(0)
  const [reopen, setReopen] = useState(false)

  const reload = useCallback(() => {
    setDay(getStudyDay())
    setAsks(getAsks().filter(a => today(new Date(a.createdAt)) === today() && a.solution))
    setNote(unreadParentNote())
    setAnsweredToday(todayLog().answered)
  }, [])
  useEffect(reload, [reload])

  if (day === undefined) return null

  const inside = day && !day.checkOutAt
  if (!inside && (!day || reopen)) {
    return <CheckInForm initial={day?.plan} seat={day?.seat} onDone={() => { setReopen(false); reload() }} />
  }
  if (!inside && day) {
    return (
      <div className="mx-auto max-w-2xl space-y-4">
        <div className="card p-6 text-center">
          <div className="text-4xl">👋</div>
          <h1 className="mt-2 text-xl font-bold">今天辛苦了！已於 {hm(day.checkOutAt!)} 簽退</h1>
          <p className="mt-1 text-sm text-ink-soft">在館 {hm(day.checkInAt)}–{hm(day.checkOutAt!)} · 專注 {fmtMinutes(Math.round(day.blocks.filter(b => b.kind === 'focus').reduce((s, b) => s + b.end - b.start, 0) / 60000))}</p>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            <Link href={`/parent?date=${day.date}`} className="btn-primary">看今天的家長日報</Link>
            <button className="btn-outline" onClick={() => setReopen(true)}>再次簽到</button>
          </div>
        </div>
      </div>
    )
  }

  return <InsideView day={day!} asks={asks} note={note} answeredToday={answeredToday} reload={reload} />
}

// ── 簽到 + 今日計畫 ─────────────────────────────────────────────
function CheckInForm({ initial, seat: seat0, onDone }: { initial?: DayPlan; seat?: string; onDone: () => void }) {
  const [seat, setSeat] = useState(seat0 ?? '')
  const [plan, setPlan] = useState<DayPlan>(initial ?? { subjects: [], targetMinutes: 120, targetQuestions: getProfile().dailyGoal, note: '' })
  const toggle = (s: string) => setPlan(p => ({ ...p, subjects: p.subjects.includes(s) ? p.subjects.filter(x => x !== s) : [...p.subjects, s] }))

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div>
        <h1 className="text-xl font-bold">到館簽到</h1>
        <p className="text-sm text-ink-soft">先花 30 秒訂好今天的計畫，簽到時間與計畫會出現在家長日報。</p>
      </div>
      <div className="card space-y-4 p-5">
        <label className="block">
          <span className="label">座位號碼（選填）</span>
          <input value={seat} onChange={e => setSeat(e.target.value)} maxLength={10} placeholder="例：A12"
            className="mt-1 w-40 rounded-xl border border-black/10 px-3 py-1.5 text-sm outline-none focus:border-brand-500" />
        </label>
        <div>
          <div className="label mb-1.5">今天要讀的科目</div>
          <div className="flex flex-wrap gap-2">
            {RECORDABLE_SUBJECTS.map(s => (
              <button key={s} onClick={() => toggle(s)}
                className={`rounded-xl px-3 py-1.5 text-sm ${plan.subjects.includes(s) ? 'bg-brand-500 text-white' : 'bg-black/5 text-ink-soft'}`}>{s}</button>
            ))}
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <div className="label mb-1.5">預計專注時間</div>
            <Choice value={plan.targetMinutes} options={[60, 90, 120, 180, 240]} fmt={v => `${v / 60} 小時`} onChange={v => setPlan({ ...plan, targetMinutes: v })} />
          </div>
          <div>
            <div className="label mb-1.5">預計練習題數</div>
            <Choice value={plan.targetQuestions} options={[0, 10, 20, 30, 50]} fmt={v => (v ? `${v} 題` : '不練')} onChange={v => setPlan({ ...plan, targetQuestions: v })} />
          </div>
        </div>
        <label className="block">
          <span className="label">今天最想完成的一件事</span>
          <input value={plan.note} onChange={e => setPlan({ ...plan, note: e.target.value })} maxLength={50} placeholder="例：寫完數學講義 3-2、背完英文 L5 單字"
            className="mt-1 w-full rounded-xl border border-black/10 px-3 py-1.5 text-sm outline-none focus:border-brand-500" />
        </label>
        <button className="btn-primary w-full py-2.5" onClick={() => { checkIn(plan, seat); onDone() }}>簽到，開始讀書</button>
      </div>
    </div>
  )
}

function Choice({ value, options, fmt, onChange }: { value: number; options: number[]; fmt: (v: number) => string; onChange: (v: number) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map(o => (
        <button key={o} onClick={() => onChange(o)}
          className={`rounded-lg px-2.5 py-1 text-sm ${o === value ? 'bg-brand-500 text-white' : 'bg-black/5 text-ink-soft'}`}>{fmt(o)}</button>
      ))}
    </div>
  )
}

// ── 在館中 ───────────────────────────────────────────────────────
function InsideView({ day, asks, note, answeredToday, reload }: {
  day: StudyDay; asks: AskRecord[]; note: { date: string; text: string } | null; answeredToday: number; reload: () => void
}) {
  const [now, setNow] = useState(Date.now())
  const [leaving, setLeaving] = useState(false)
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t) }, [])

  const focusMs = day.blocks.filter(b => b.kind === 'focus').reduce((s, b) => s + b.end - b.start, 0)
    + (day.active?.kind === 'focus' ? now - day.active.start : 0)
  const focusMin = Math.floor(focusMs / 60000)
  const stuck = asks.filter(a => a.understood === false)

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">K書模式</h1>
          <div className="text-sm text-ink-soft">
            {hm(day.checkInAt)} 簽到{day.seat && ` · 座位 ${day.seat}`} · 已在館 {fmtMinutes(Math.floor((now - day.checkInAt) / 60000))}
          </div>
        </div>
        <button className="btn-outline" onClick={() => setLeaving(true)}>簽退離館</button>
      </div>

      {note && (
        <div className="card flex items-start justify-between gap-3 border-amber-300 bg-amber-50 p-4">
          <div><div className="text-xs font-medium text-amber-800">💌 家長留言</div><div className="mt-0.5">{note.text}</div></div>
          <button className="btn-ghost shrink-0 py-1" onClick={() => { markParentNoteRead(note.date); reload() }}>已讀</button>
        </div>
      )}

      {leaving && <CheckOutForm onCancel={() => setLeaving(false)} onDone={reload} />}

      <div className="grid gap-4 md:grid-cols-[1fr_300px]">
        <FocusTimer day={day} now={now} onChange={reload} />
        <div className="space-y-4">
          <div className="card space-y-3 p-4">
            <h2 className="font-semibold">今日目標</h2>
            <GoalRow label="專注時間" actual={focusMin} target={day.plan.targetMinutes} unit="分" />
            {day.plan.targetQuestions > 0 && <GoalRow label="練習題數" actual={answeredToday} target={day.plan.targetQuestions} unit="題" />}
            {day.plan.note && <div className="rounded-lg bg-black/[.03] px-3 py-2 text-sm">🎯 {day.plan.note}</div>}
            <div className="grid grid-cols-2 gap-2 pt-1">
              <Link href="/practice/new" className="btn-primary">自選練習</Link>
              <Link href="/wrong-book" className="btn-outline">錯題複習</Link>
            </div>
          </div>
          <div className="card p-4">
            <h2 className="font-semibold">🤖 今天問 AI {stuck.length > 0 && <span className="chip ml-1 bg-amber-50 text-amber-800">{stuck.length} 題還不懂</span>}</h2>
            <p className="text-xs text-ink-muted">館內沒有老師：卡住時在題目下方按「請 AI 一步一步講解」，還不懂可以追問。</p>
            {asks.length === 0 ? <div className="mt-2"><Empty>今天還沒有問 AI</Empty></div> : (
              <>
                <div className="mt-2 text-sm text-ink-soft">講解 {asks.length} 題 · 看懂 {asks.filter(a => a.understood).length} 題 · 追問 {asks.reduce((n, a) => n + a.followups.length, 0)} 次</div>
                {stuck.length > 0 && (
                  <div className="mt-2 space-y-1.5">
                    {stuck.map(a => (
                      <div key={a.questionId} className="rounded-lg bg-amber-50/60 px-3 py-2 text-xs">
                        <div className="text-ink-muted">{a.question.kp}</div>
                        <div className="line-clamp-2"><MathText>{stripFigure(a.question.stem)}</MathText></div>
                      </div>
                    ))}
                    <Link href="/wrong-book" className="block text-right text-xs text-brand-600 hover:underline">已排入錯題本，去複習 →</Link>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      <TodayBlocks day={day} />
    </div>
  )
}

function GoalRow({ label, actual, target, unit }: { label: string; actual: number; target: number; unit: string }) {
  const met = actual >= target
  return (
    <div className="text-sm">
      <div className="mb-1 flex justify-between"><span>{label}</span><span className={`tabular-nums ${met ? 'font-semibold text-green-700' : 'text-ink-soft'}`}>{met && '✓ '}{actual} / {target} {unit}</span></div>
      <ProgressBar value={actual} max={target} />
    </div>
  )
}

// ── 番茄鐘 ───────────────────────────────────────────────────────
const PRESETS = [
  { kind: 'focus' as const, min: 25, label: '專注 25 分' },
  { kind: 'focus' as const, min: 50, label: '專注 50 分' },
  { kind: 'break' as const, min: 5, label: '休息 5 分' },
  { kind: 'break' as const, min: 10, label: '休息 10 分' },
]

function beep() {
  try {
    const ctx = new AudioContext()
    const o = ctx.createOscillator(); const g = ctx.createGain()
    o.connect(g); g.connect(ctx.destination); o.frequency.value = 880; g.gain.value = 0.08
    o.start(); o.stop(ctx.currentTime + 0.6)
  } catch { /* 瀏覽器不支援就算了 */ }
}

function FocusTimer({ day, now, onChange }: { day: StudyDay; now: number; onChange: () => void }) {
  const subjects = [...day.plan.subjects, '其他']
  const [subject, setSubject] = useState(subjects[0])
  const active = day.active
  const remaining = active ? active.plannedMin * 60000 - (now - active.start) : 0

  // 切到別的分頁／App 超過 15 秒才回來 → 記一次分心（只在專注時段；重新整理頁面不算）
  useEffect(() => {
    if (!active || active.kind !== 'focus') return
    let hiddenAt = 0
    const onVis = () => {
      if (document.hidden) { hiddenAt = Date.now(); return }
      if (hiddenAt && Date.now() - hiddenAt > 15000) { addDistraction(); onChange() }
      hiddenAt = 0
    }
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [active, onChange])

  // 時間到自動結束
  useEffect(() => {
    if (active && remaining <= 0) { endBlock(); beep(); onChange() }
  }, [active, remaining, onChange])

  const mm = Math.max(0, Math.floor(remaining / 60000))
  const ss = Math.max(0, Math.floor((remaining % 60000) / 1000))
  const lastBlock = day.blocks[day.blocks.length - 1]

  return (
    <div className="card p-5">
      <h2 className="font-semibold">專注計時</h2>
      {active ? (
        <div className="py-4 text-center">
          <div className={`text-sm font-medium ${active.kind === 'focus' ? 'text-brand-600' : 'text-green-700'}`}>
            {active.kind === 'focus' ? `專注中 · ${active.subject}` : '休息中'}
          </div>
          <div className="my-2 text-6xl font-bold tabular-nums tracking-tight">{String(mm).padStart(2, '0')}:{String(ss).padStart(2, '0')}</div>
          <ProgressBar value={now - active.start} max={active.plannedMin * 60000} className="mx-auto max-w-sm" />
          {active.kind === 'focus' && (
            <div className="mt-2 text-xs text-ink-muted">離開這個畫面超過 15 秒會記為分心（目前 {active.distractions} 次）· 用本系統練習題目不算</div>
          )}
          <button className="btn-outline mt-4" onClick={() => { endBlock(); onChange() }}>提前結束</button>
        </div>
      ) : (
        <div className="space-y-4 pt-3">
          {lastBlock && Date.now() - lastBlock.end < 120000 && (
            <div className="rounded-xl bg-green-50 px-4 py-2 text-sm text-green-900">
              {lastBlock.kind === 'focus' ? (lastBlock.completed ? '🎉 完成一個專注時段！起來伸展一下，休息 5 分鐘吧。' : '已結束這個專注時段。') : '休息結束，準備好就開始下一段。'}
            </div>
          )}
          <div>
            <div className="label mb-1.5">這段要讀</div>
            <div className="flex flex-wrap gap-1.5">
              {subjects.map(s => (
                <button key={s} onClick={() => setSubject(s)} className={`rounded-lg px-3 py-1 text-sm ${s === subject ? 'bg-brand-500 text-white' : 'bg-black/5 text-ink-soft'}`}>{s}</button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {PRESETS.map(p => (
              <button key={p.label} className={p.kind === 'focus' ? 'btn-primary py-3' : 'btn-outline py-3'}
                onClick={() => { startBlock(p.kind === 'focus' ? subject : '休息', p.kind, p.min); onChange() }}>{p.label}</button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function TodayBlocks({ day }: { day: StudyDay }) {
  const blocks = day.blocks
  if (!blocks.length) return null
  return (
    <section className="card p-5">
      <h2 className="font-semibold">今日時間軸</h2>
      <div className="mt-3 space-y-1.5">
        {blocks.map((b, i) => (
          <div key={i} className="flex items-center gap-3 text-sm">
            <span className="w-24 shrink-0 tabular-nums text-ink-muted">{hm(b.start)}–{hm(b.end)}</span>
            <span className={`chip ${b.kind === 'focus' ? 'bg-brand-50 text-brand-700' : 'bg-green-50 text-green-800'}`}>{b.kind === 'focus' ? b.subject : '休息'}</span>
            <span className="text-ink-soft">{Math.round((b.end - b.start) / 60000)} 分</span>
            {b.kind === 'focus' && (b.completed ? <span className="text-green-700">✓ 完成</span> : <span className="text-ink-muted">提前結束</span>)}
            {b.distractions > 0 && <span className="text-amber-700">分心 {b.distractions} 次</span>}
          </div>
        ))}
      </div>
    </section>
  )
}

// ── 簽退 + 今日心得 ─────────────────────────────────────────────
function CheckOutForm({ onCancel, onDone }: { onCancel: () => void; onDone: () => void }) {
  const [mood, setMood] = useState<Mood>('ok')
  const [learned, setLearned] = useState('')
  const [stuck, setStuck] = useState('')
  return (
    <div className="card space-y-3 border-brand-500/40 p-5">
      <h2 className="font-semibold">簽退前，花 30 秒回顧今天</h2>
      <p className="text-xs text-ink-muted">這些內容會出現在給家長的日報裡。</p>
      <div className="flex flex-wrap gap-2">
        {(Object.keys(MOOD_LABEL) as Mood[]).map(m => (
          <button key={m} onClick={() => setMood(m)} className={`rounded-xl px-3 py-1.5 text-sm ${m === mood ? 'bg-brand-500 text-white' : 'bg-black/5'}`}>{MOOD_LABEL[m]}</button>
        ))}
      </div>
      <input value={learned} onChange={e => setLearned(e.target.value)} maxLength={60} placeholder="今天學會了什麼？（例：會用配方法解二次方程式）"
        className="w-full rounded-xl border border-black/10 px-3 py-1.5 text-sm outline-none focus:border-brand-500" />
      <input value={stuck} onChange={e => setStuck(e.target.value)} maxLength={60} placeholder="哪裡還卡住？（選填）"
        className="w-full rounded-xl border border-black/10 px-3 py-1.5 text-sm outline-none focus:border-brand-500" />
      <div className="flex gap-2">
        <button className="btn-ghost" onClick={onCancel}>取消</button>
        <button className="btn-primary flex-1" onClick={() => { checkOut({ mood, learned: learned.trim(), stuck: stuck.trim() }); onDone() }}>確認簽退</button>
      </div>
    </div>
  )
}
