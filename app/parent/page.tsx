'use client'

import { Suspense, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { Empty, Tile, fmtPct } from '@/components/ui'
import { buildDailyReport, buildWeekly, dailyReportText, fmtMinutes } from '@/lib/daily-report'
import {
  getActivity, getHelpRequests, getProfile, getStudyDay, getStudyDays, listSessions, setParentNote, today,
} from '@/lib/storage'
import { MOOD_LABEL } from '@/lib/types'

export default function ParentPage() {
  return <Suspense><ParentView /></Suspense>
}

const dateOf = (t: number) => today(new Date(t))
const hm = (t?: number) => { if (!t) return '—'; const d = new Date(t); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}` }

function ParentView() {
  const router = useRouter()
  const params = useSearchParams()
  const [date, setDate] = useState(params.get('date') ?? '')
  const [dates, setDates] = useState<string[]>([])
  const [tick, setTick] = useState(0)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    const ds = new Set([...getStudyDays().map(d => d.date), ...getActivity().filter(a => a.answered > 0).map(a => a.date), today()])
    const sorted = Array.from(ds).sort().reverse()
    setDates(sorted)
    if (!date) setDate(sorted[0])
  }, [date])

  const data = useMemo(() => {
    if (!date) return null
    void tick
    const day = getStudyDay(date)
    const report = buildDailyReport({
      date,
      studentName: getProfile().name,
      day,
      sessions: listSessions().filter(s => s.status === 'finished' && dateOf(s.createdAt) === date),
      log: getActivity().find(a => a.date === date),
      help: getHelpRequests().filter(h => dateOf(h.createdAt) === date),
    })
    const weekly = buildWeekly(getStudyDays(), getActivity(), date)
    return { day, report, weekly }
  }, [date, tick])

  if (!data) return null
  const { report: r, weekly, day } = data
  const maxFocus = Math.max(30, ...weekly.map(w => w.focusMinutes))
  const text = dailyReportText(r)

  const share = async () => {
    try {
      if (navigator.share) { await navigator.share({ text }); return }
    } catch { /* 使用者取消分享 */ }
    try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000) } catch { /* 忽略 */ }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div className="no-print rounded-xl bg-brand-50 px-4 py-2 text-xs text-brand-700">
        家長端預覽：正式版家長會以自己的帳號登入，並在孩子到館、離館時收到 LINE 通知與這份日報。雛形中與學生共用同一台裝置的資料。
      </div>

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-sm text-ink-muted">家長日報</div>
          <h1 className="text-2xl font-bold">{r.studentName || '孩子'}的學習日報</h1>
        </div>
        <div className="no-print flex flex-wrap items-center gap-2">
          <select value={date} onChange={e => { setDate(e.target.value); router.replace(`/parent?date=${e.target.value}`) }}
            className="rounded-xl border border-black/10 bg-white px-3 py-2 text-sm">
            {dates.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
          <button className="btn-outline" onClick={share}>{copied ? '已複製 ✓' : '分享到 LINE'}</button>
          <button className="btn-outline" onClick={() => window.print()}>列印</button>
        </div>
      </div>

      {!r.attended && r.practice.answered === 0 ? (
        <Empty>{date} 沒有到館或練習紀錄</Empty>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Tile label="到館 / 離館" value={<span className="text-xl">{hm(r.checkInAt)} – {r.checkOutAt ? hm(r.checkOutAt) : '在館中'}</span>} sub={r.attended ? `在館 ${fmtMinutes(r.stayMinutes)}` : '沒有簽到'} />
            <Tile label="專注時間" value={fmtMinutes(r.focus.minutes)} sub={`${r.focus.completedBlocks}/${r.focus.blocks} 段完整 · 分心 ${r.focus.distractions} 次`} />
            <Tile label="練習題數" value={r.practice.answered} sub={r.practice.answered ? `正確率 ${fmtPct(r.practice.accuracy)}` : '今天沒有練習'} />
            <Tile label="問老師" value={r.help.asked} sub={r.help.asked ? `已解答 ${r.help.resolved} 題` : '—'} />
          </div>

          {(r.highlights.length > 0 || r.alerts.length > 0) && (
            <div className="grid gap-4 md:grid-cols-2">
              <section className="card p-5">
                <h2 className="font-semibold">🌟 今天的亮點</h2>
                {r.highlights.length ? (
                  <ul className="mt-2 space-y-1 text-sm">{r.highlights.map((h, i) => <li key={i}>• {h}</li>)}</ul>
                ) : <p className="mt-2 text-sm text-ink-muted">今天比較平淡，明天繼續加油。</p>}
              </section>
              <section className="card p-5">
                <h2 className="font-semibold">🔔 需要關心</h2>
                {r.alerts.length ? (
                  <ul className="mt-2 space-y-1 text-sm">
                    {r.alerts.map((a, i) => <li key={i} className={a.level === 'warn' ? 'text-amber-800' : 'text-ink-soft'}>{a.level === 'warn' ? '⚠' : 'ℹ'} {a.text}</li>)}
                  </ul>
                ) : <p className="mt-2 text-sm text-ink-muted">沒有需要特別注意的地方 👍</p>}
              </section>
            </div>
          )}

          <section className="card p-5">
            <h2 className="font-semibold">今天的計畫與完成度</h2>
            {r.planNote && <div className="mt-2 rounded-lg bg-black/[.03] px-3 py-2 text-sm">🎯 孩子今天最想完成：{r.planNote}</div>}
            <div className="mt-3 space-y-2">
              {r.goals.length === 0 && <p className="text-sm text-ink-muted">今天沒有設定目標</p>}
              {r.goals.map(g => (
                <div key={g.label} className="flex items-center justify-between text-sm">
                  <span>{g.met ? '✅' : '⬜'} {g.label}</span>
                  <span className="tabular-nums">{g.actual} / {g.target} {g.unit}</span>
                </div>
              ))}
            </div>
            {r.focus.bySubject.length > 0 && (
              <>
                <h3 className="mt-4 text-sm font-semibold">各科專注時間</h3>
                <div className="mt-2 space-y-1.5">
                  {r.focus.bySubject.map(s => (
                    <div key={s.subject} className="grid grid-cols-[4.5rem_1fr_3.5rem] items-center gap-2 text-sm" title={`${s.subject}：${s.minutes} 分鐘`}>
                      <span className="text-ink-soft">{s.subject}</span>
                      <div className="h-3 rounded-r bg-black/[.03]"><div className="h-3 rounded-r" style={{ width: `${(s.minutes / Math.max(1, r.focus.bySubject[0].minutes)) * 100}%`, background: 'var(--viz-series-1)' }} /></div>
                      <span className="text-right tabular-nums">{s.minutes} 分</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </section>

          <div className="grid gap-4 md:grid-cols-2">
            <section className="card p-5">
              <h2 className="font-semibold">學習成果</h2>
              <div className="mt-2 text-sm">
                <div className="text-xs font-medium text-ink-muted">進步的知識點</div>
                {r.improved.length ? r.improved.map(k => <div key={k.kp}>• {k.kp} <span className="text-green-700">+{Math.round(k.delta)}</span></div>) : <div className="text-ink-muted">—</div>}
                <div className="mt-3 text-xs font-medium text-ink-muted">還需要加強</div>
                {r.weak.length ? r.weak.map(k => <div key={k.kp}>• {k.kp} <span className="text-ink-muted">（掌握度 {k.score}）</span></div>) : <div className="text-ink-muted">—</div>}
              </div>
            </section>
            <section className="card p-5">
              <h2 className="font-semibold">孩子的心得</h2>
              {r.reflection ? (
                <div className="mt-2 space-y-1 text-sm">
                  <div className="text-lg">{MOOD_LABEL[r.reflection.mood]}</div>
                  {r.reflection.learned && <div><span className="text-ink-muted">學會了：</span>{r.reflection.learned}</div>}
                  {r.reflection.stuck && <div><span className="text-ink-muted">還卡住：</span>{r.reflection.stuck}</div>}
                </div>
              ) : <p className="mt-2 text-sm text-ink-muted">{r.checkOutAt ? '沒有填寫' : '簽退時填寫'}</p>}
            </section>
          </div>

          <section className="card p-5">
            <h2 className="font-semibold">💡 給家長的溝通建議</h2>
            <ul className="mt-2 space-y-1 text-sm text-ink-soft">{r.tipsForParent.map((t, i) => <li key={i}>• {t}</li>)}</ul>
          </section>
        </>
      )}

      <section className="card p-5">
        <h2 className="font-semibold">近 7 天專注時間</h2>
        <p className="text-xs text-ink-muted">長條為專注分鐘數；下方為當天練習題數</p>
        <div className="mt-3 flex h-32 items-end gap-2 border-b border-[color:var(--viz-grid)]">
          {weekly.map(w => (
            <div key={w.date} className="flex flex-1 flex-col items-center justify-end" title={`${w.label}（${w.weekday}）：專注 ${w.focusMinutes} 分、練習 ${w.answered} 題${w.attended ? '' : '、未到館'}`}>
              {w.focusMinutes > 0 && <span className="mb-0.5 text-[11px] tabular-nums text-ink-soft">{w.focusMinutes}</span>}
              <div className="w-full max-w-[36px] rounded-t hover:opacity-80" style={{ height: (w.focusMinutes / maxFocus) * 100, minHeight: w.focusMinutes ? 3 : 0, background: 'var(--viz-series-1)' }} />
            </div>
          ))}
        </div>
        <div className="mt-1 flex gap-2">
          {weekly.map(w => (
            <div key={w.date} className={`flex-1 text-center text-xs ${w.date === date ? 'font-bold text-ink' : 'text-ink-muted'}`}>
              <div>{w.label}</div><div>{w.attended ? w.weekday : '—'}</div><div className="tabular-nums">{w.answered} 題</div>
            </div>
          ))}
        </div>
        <div className="mt-3 text-sm text-ink-soft">
          本週到館 {weekly.filter(w => w.attended).length} 天 · 專注 {fmtMinutes(weekly.reduce((s, w) => s + w.focusMinutes, 0))} · 練習 {weekly.reduce((s, w) => s + w.answered, 0)} 題
        </div>
      </section>

      {day && <NoteBox key={date} date={date} initial={day.parentNote?.text ?? ''} read={!!day.parentNote?.read} onSaved={() => setTick(t => t + 1)} />}

      <details className="no-print card p-5 text-sm">
        <summary className="cursor-pointer font-semibold">LINE 訊息預覽</summary>
        <pre className="mt-2 whitespace-pre-wrap rounded-xl bg-[#e8f5e9] p-3 font-sans text-[13px] leading-relaxed">{text}</pre>
      </details>

      <div className="no-print text-sm"><Link href="/study" className="text-brand-600 hover:underline">← 回 K書模式</Link></div>
    </div>
  )
}

function NoteBox({ date, initial, read, onSaved }: { date: string; initial: string; read: boolean; onSaved: () => void }) {
  const [msg, setMsg] = useState(initial)
  const [sent, setSent] = useState(false)
  return (
    <section className="card no-print p-5">
      <h2 className="font-semibold">💌 留言給孩子</h2>
      <p className="text-xs text-ink-muted">孩子下次打開 K書模式 時會看到。</p>
      <textarea value={msg} onChange={e => { setMsg(e.target.value); setSent(false) }} maxLength={100} rows={2} placeholder="例：今天很認真！晚上想吃什麼？"
        className="mt-2 w-full rounded-xl border border-black/10 px-3 py-2 text-sm outline-none focus:border-brand-500" />
      <div className="mt-2 flex items-center gap-3">
        <button className="btn-primary" onClick={() => { setParentNote(date, msg); setSent(true); onSaved() }}>送出留言</button>
        {sent ? <span className="text-sm text-green-700">已送出</span>
          : initial && <span className="text-sm text-ink-muted">{read ? '孩子已讀 ✓' : '孩子尚未讀取'}</span>}
      </div>
    </section>
  )
}
