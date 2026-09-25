'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Empty, fmtDate, fmtPct } from '@/components/ui'
import { masteryLevel } from '@/lib/engine'
import {
  type DayLog, type Profile, clearAll, deleteSession, exportAll, getActivity, getMasteryMap, getProfile, importAll, listSessions, saveProfile,
} from '@/lib/storage'
import { RECORDABLE_SUBJECTS, TAXONOMY } from '@/lib/taxonomy'
import type { KPMastery, Session } from '@/lib/types'
import { kpKey } from '@/lib/types'

const TONE_BG = { good: 'var(--viz-good)', mid: 'var(--viz-mid)', bad: 'var(--viz-bad)' }

export default function ProgressPage() {
  const [mastery, setMastery] = useState<Record<string, KPMastery>>({})
  const [sessions, setSessions] = useState<Session[]>([])
  const [activity, setActivity] = useState<DayLog[]>([])
  const [profile, setProfile] = useState<Profile | null>(null)
  const [subject, setSubject] = useState('數學')
  const [msg, setMsg] = useState('')

  const reload = () => {
    setMastery(getMasteryMap()); setSessions(listSessions()); setActivity(getActivity()); setProfile(getProfile())
  }
  useEffect(reload, [])

  if (!profile) return null

  const practiced = Object.values(mastery).filter(m => m.subject === subject && m.attempts > 0)
  const totalKPs = Object.values(TAXONOMY[subject]).flat().length

  // 近 28 天活動
  const days = Array.from({ length: 28 }, (_, i) => {
    const d = new Date(); d.setDate(d.getDate() - 27 + i)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    return { key, label: `${d.getMonth() + 1}/${d.getDate()}`, log: activity.find(a => a.date === key) }
  })
  const maxDay = Math.max(1, ...days.map(d => d.log?.answered ?? 0))

  const download = () => {
    const blob = new Blob([exportAll()], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `自習紀錄備份-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-bold">學習歷程</h1>

      <section className="card p-5">
        <h2 className="font-semibold">近 28 天練習量</h2>
        <p className="text-xs text-ink-muted">每格一天，高度代表作答題數</p>
        <div className="mt-3 flex h-24 items-end gap-[3px] border-b border-[color:var(--viz-grid)]">
          {days.map(d => (
            <div key={d.key} className="flex-1" title={`${d.label}：${d.log?.answered ?? 0} 題${d.log?.answered ? `，正確率 ${fmtPct(d.log.correct / d.log.answered)}，${d.log.minutes} 分鐘` : ''}`}>
              <div className="rounded-t-[3px] hover:opacity-80" style={{ height: `${((d.log?.answered ?? 0) / maxDay) * 88}px`, minHeight: d.log?.answered ? 3 : 0, background: 'var(--viz-series-1)' }} />
            </div>
          ))}
        </div>
        <div className="mt-1 flex justify-between text-xs text-ink-muted"><span>{days[0].label}</span><span>今天</span></div>
      </section>

      <section className="card p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-semibold">知識點掌握地圖</h2>
          <div className="flex items-center gap-3 text-xs text-ink-muted">
            {(['bad', 'mid', 'good'] as const).map(t => (
              <span key={t} className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: TONE_BG[t] }} />{{ bad: '待加強 <55', mid: '進步中 55–79', good: '已掌握 ≥80' }[t]}</span>
            ))}
            <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm bg-black/10" />未練習</span>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {RECORDABLE_SUBJECTS.map(s => (
            <button key={s} onClick={() => setSubject(s)} className={`rounded-lg px-3 py-1 text-sm ${s === subject ? 'bg-brand-500 text-white' : 'bg-black/5'}`}>{s}</button>
          ))}
        </div>
        <div className="mt-2 text-sm text-ink-soft">已練習 {practiced.length} / {totalKPs} 個知識點，已掌握 {practiced.filter(m => m.score >= 80).length} 個</div>
        <div className="mt-3 space-y-3">
          {Object.entries(TAXONOMY[subject]).map(([chapter, kps]) => (
            <div key={chapter}>
              <div className="mb-1 text-sm font-medium">{chapter}</div>
              <div className="flex flex-wrap gap-1">
                {kps.map(kp => {
                  const m = mastery[kpKey({ subject, chapter, kp })]
                  const tone = m && m.attempts > 0 ? masteryLevel(m.score).tone : null
                  return (
                    <span key={kp} title={m ? `${kp}：掌握度 ${Math.round(m.score)}（${m.correct}/${m.attempts}）` : `${kp}：未練習`}
                      className={`rounded px-1.5 py-0.5 text-xs ${tone ? 'text-white' : 'bg-black/5 text-ink-muted'}`}
                      style={tone ? { background: TONE_BG[tone] } : undefined}>
                      {kp}{m && m.attempts > 0 && <span className="ml-1 tabular-nums opacity-90">{Math.round(m.score)}</span>}
                    </span>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="card p-5">
        <h2 className="font-semibold">練習紀錄</h2>
        <div className="mt-2">
          {sessions.length === 0 ? <Empty>還沒有紀錄</Empty> : (
            <div className="divide-y divide-black/5">
              {sessions.map(s => {
                const ans = s.rounds.flatMap(r => r.answers)
                const c = ans.filter(a => a.correct).length
                return (
                  <div key={s.id} className="flex items-center justify-between gap-2 py-2 text-sm">
                    <Link href={s.status === 'finished' ? `/report?id=${s.id}` : `/practice/session?id=${s.id}`} className="flex-1 hover:underline">
                      <span className="font-medium">{s.mode === 'review' ? '錯題複習' : s.subject}</span>
                      <span className="ml-2 text-xs text-ink-muted">{fmtDate(s.createdAt)} · {s.rounds.length} 波 · {s.status === 'active' ? '進行中' : `${c}/${ans.length}`}</span>
                    </Link>
                    <button className="text-xs text-ink-muted hover:text-red-600" onClick={() => { if (confirm('刪除這筆紀錄？（掌握度不會回復）')) { deleteSession(s.id); reload() } }}>刪除</button>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </section>

      <section className="card space-y-3 p-5">
        <h2 className="font-semibold">個人設定與資料</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="block text-sm"><span className="label">暱稱</span>
            <input className="mt-1 w-full rounded-xl border border-black/10 px-3 py-1.5" value={profile.name} onChange={e => setProfile({ ...profile, name: e.target.value })} /></label>
          <label className="block text-sm"><span className="label">年級（出題參考）</span>
            <select className="mt-1 w-full rounded-xl border border-black/10 bg-white px-3 py-1.5" value={profile.grade} onChange={e => setProfile({ ...profile, grade: e.target.value })}>
              <option value="">不指定</option><option>七年級</option><option>八年級</option><option>九年級</option>
            </select></label>
          <label className="block text-sm"><span className="label">每日目標題數</span>
            <input type="number" min={5} max={200} className="mt-1 w-full rounded-xl border border-black/10 px-3 py-1.5" value={profile.dailyGoal} onChange={e => setProfile({ ...profile, dailyGoal: Number(e.target.value) || 20 })} /></label>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="btn-primary" onClick={() => { saveProfile(profile); setMsg('已儲存設定') }}>儲存設定</button>
          <button className="btn-outline" onClick={download}>匯出備份</button>
          <label className="btn-outline cursor-pointer">匯入備份
            <input type="file" accept="application/json" className="hidden" onChange={async e => {
              const f = e.target.files?.[0]
              if (!f) return
              setMsg(importAll(await f.text()) ? '匯入成功' : '檔案格式不正確')
              reload()
            }} />
          </label>
          <button className="btn-ghost text-red-600" onClick={() => { if (confirm('確定清除本機所有學習紀錄？此動作無法復原')) { clearAll(); reload(); setMsg('已清除') } }}>清除全部資料</button>
        </div>
        {msg && <div className="text-sm text-green-700">{msg}</div>}
        <p className="text-xs text-ink-muted">雛形版資料只存在這台裝置的瀏覽器中；換裝置請先匯出備份。正式版將改存雲端帳號。</p>
      </section>
    </div>
  )
}
