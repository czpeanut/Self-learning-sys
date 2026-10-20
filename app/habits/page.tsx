'use client'

// 學習習慣：從錯題量、作答速度、錯的題型推估學習習慣與模式，給出有研究依據的改善建議（lib/learning-profile.ts）

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Empty } from '@/components/ui'
import { type Indicator, type LearningProfile, MIN_TOTAL, REFS, REF_MS } from '@/lib/learning-profile'
import { collectProfile } from '@/lib/profile-data'
import { type Profile, getProfile, saveProfile } from '@/lib/storage'

const LEVEL = {
  good: { label: '良好', icon: '●', cls: 'bg-green-50 text-green-800' },
  watch: { label: '留意', icon: '◐', cls: 'bg-amber-50 text-amber-800' },
  concern: { label: '需要調整', icon: '▲', cls: 'bg-red-50 text-red-700' },
  na: { label: '資料不足', icon: '○', cls: 'bg-black/5 text-ink-muted' },
}
const TONE = { good: 'border-green-600/30 bg-green-50/50', watch: 'border-amber-500/30 bg-amber-50/50', concern: 'border-red-500/30 bg-red-50/50' }
const QUADRANTS = [
  // 上排正確率高、下排正確率低；左快右慢
  { id: 'fluent', label: '快又準確', sub: '流暢' }, { id: 'reflective', label: '慢而準確', sub: '沉思型' },
  { id: 'impulsive', label: '快但錯多', sub: '衝動型' }, { id: 'struggling', label: '慢且錯多', sub: '吃力' },
] as const

export default function HabitsPage() {
  const [p, setP] = useState<LearningProfile | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  useEffect(() => { setP(collectProfile()); setProfile(getProfile()) }, [])
  if (!p || !profile) return null

  const calmPref = profile.calmMode ?? 'auto'
  const setCalm = (v: 'auto' | 'on' | 'off') => { const np = { ...profile, calmMode: v }; saveProfile(np); setProfile(np) }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold">學習習慣</h1>
        <p className="mt-1 text-sm text-ink-soft">
          從你的作答速度、錯題量與錯的題型，看出你的作答習慣，並給出有研究依據的改善方法。
          這是「作答方式」的觀察，不是能力的評價——習慣都可以調整。
        </p>
      </div>

      {!p.enough && (
        <div className="leaf-sm bg-amber-50 px-4 py-3 text-sm text-amber-900">
          目前有 {p.total} 題作答紀錄，至少 {MIN_TOTAL} 題後判斷才比較可靠；下方先列出資料已足夠的部分。
          <Link href="/practice/new" className="ml-2 underline">去練習</Link>
        </div>
      )}

      {/* 模式 */}
      <section className="grid gap-3 md:grid-cols-[1fr_260px]">
        <div className="space-y-3">
          {p.patterns.length === 0 ? <Empty>還看不出明顯的作答模式，多練一些再回來看</Empty> : p.patterns.map(x => (
            <div key={x.id} className={`card border p-4 ${TONE[x.tone]}`}>
              <div className="font-semibold">{x.tone === 'good' ? '✓' : x.tone === 'concern' ? '▲' : '◐'} {x.name}</div>
              <p className="mt-1 text-sm leading-relaxed text-ink-soft">{x.desc}</p>
            </div>
          ))}
        </div>
        <TempoChart p={p} />
      </section>

      {/* 建議 */}
      {p.advice.length > 0 && (
        <section className="card p-5">
          <h2 className="font-semibold">改善建議（依重要性）</h2>
          <ol className="mt-3 space-y-4">
            {p.advice.map((a, i) => (
              <li key={a.id} className="flex gap-3">
                <span className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-500 text-xs font-bold text-white">{i + 1}</span>
                <div className="min-w-0">
                  <div className="font-medium">{a.title}</div>
                  <div className="text-sm text-ink-soft">{a.why}</div>
                  <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm">{a.how.map((h, j) => <li key={j}>{h}</li>)}</ul>
                  <div className="mt-1 text-xs text-ink-muted">研究依據：{REFS[a.ref].short}</div>
                </div>
              </li>
            ))}
          </ol>
        </section>
      )}

      {/* 冷靜作答設定 */}
      <section className="card flex flex-wrap items-center justify-between gap-3 p-4">
        <div>
          <div className="font-semibold">🧘 冷靜作答</div>
          <div className="text-sm text-ink-soft">
            送出答案前顯示檢查口訣、題目出現 5 秒後才能送出。
            {calmPref === 'auto' && (p.calmMode ? '（偵測到快而錯多，目前已自動開啟）' : '（目前沒有偵測到衝動型作答，未開啟）')}
          </div>
        </div>
        <div className="flex leaf-sm bg-black/5 p-0.5 text-sm">
          {(['auto', 'on', 'off'] as const).map(v => (
            <button key={v} onClick={() => setCalm(v)} className={`leaf-sm px-3 py-1 ${calmPref === v ? 'bg-white font-medium shadow-sm' : 'text-ink-soft'}`}>
              {{ auto: '自動', on: '開啟', off: '關閉' }[v]}
            </button>
          ))}
        </div>
      </section>

      {/* 指標 */}
      <section className="card p-5">
        <h2 className="font-semibold">各項指標</h2>
        <p className="text-xs text-ink-muted">每項只在資料量足夠時才判斷；點「研究依據」看出處</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {p.indicators.map(i => <IndicatorCard key={i.id} i={i} />)}
        </div>
      </section>

      <p className="text-xs text-ink-muted">
        判斷用的參考作答時間：基礎題 {REF_MS[1] / 1000} 秒、標準題 {REF_MS[2] / 1000} 秒、進階題 {REF_MS[3] / 1000} 秒（之後會用全體學生的實際作答時間校正）。
        研究整理與門檻說明見 docs/LEARNING-PROFILE.md。
      </p>
    </div>
  )
}

function IndicatorCard({ i }: { i: Indicator }) {
  const l = LEVEL[i.level]
  return (
    <div className="leaf-sm border border-black/5 p-3 text-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="font-medium">{i.title}</div>
        <span className={`chip shrink-0 ${l.cls}`}>{l.icon} {l.label}</span>
      </div>
      <div className="mt-1">{i.display}</div>
      <div className="mt-0.5 text-xs text-ink-muted">{i.evidence}</div>
      <details className="mt-1 text-xs">
        <summary className="cursor-pointer text-brand-600">研究依據</summary>
        <div className="mt-1 leading-relaxed text-ink-soft">{REFS[i.ref].full}</div>
      </details>
    </div>
  )
}

/** 作答節奏四象限（Kagan）：橫軸速度、縱軸正確率，標出學生目前的位置 */
function TempoChart({ p }: { p: LearningProfile }) {
  const t = p.tempo
  // 速度：參考時間倍數 0.25–2（對數）→ 0–100%；左快右慢
  const x = t.relSpeed == null ? null : Math.min(100, Math.max(0, ((Math.log2(t.relSpeed) + 2) / 3) * 100))
  const y = t.accuracy == null ? null : Math.min(100, Math.max(0, (1 - t.accuracy) * 100))
  return (
    <div className="card p-4">
      <div className="text-sm font-semibold">作答節奏</div>
      <div className="text-xs text-ink-muted">Kagan 沉思型／衝動型四象限</div>
      <div className="relative mt-3 aspect-square w-full">
        <div className="absolute inset-0 grid grid-cols-2 grid-rows-2 gap-0.5 overflow-hidden leaf-sm">
          {QUADRANTS.map(qd => (
            <div key={qd.id} className={`flex flex-col items-center justify-center text-center ${t.quadrant === qd.id ? 'bg-brand-100' : 'bg-black/[.03]'}`}>
              <div className="text-xs font-medium">{qd.label}</div>
              <div className="text-[10px] text-ink-muted">{qd.sub}</div>
            </div>
          ))}
        </div>
        {x != null && y != null && (
          <div className="absolute h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-white" title={`速度 ${t.relSpeed!.toFixed(2)} 倍參考時間、正確率 ${Math.round(t.accuracy! * 100)}%`}
            style={{ left: `${x}%`, top: `${y}%`, background: 'var(--viz-series-1)' }} />
        )}
      </div>
      <div className="mt-1 flex justify-between text-[10px] text-ink-muted"><span>← 快</span><span>慢 →</span></div>
      <div className="mt-1 text-xs text-ink-soft">
        {t.relSpeed == null ? '資料不足（需要 20 題以上）' : `作答時間約參考時間的 ${t.relSpeed.toFixed(2)} 倍、正確率 ${Math.round(t.accuracy! * 100)}%（上＝正確率高）`}
      </div>
    </div>
  )
}
