'use client'

import { Suspense, useEffect, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { MasteryBadge } from '@/components/ui'
import { hasGenerator } from '@/lib/generators'
import { createPracticeSession } from '@/lib/session-client'
import { getMasteryMap, getProfile, saveProfile } from '@/lib/storage'
import { RECORDABLE_SUBJECTS, TAXONOMY, getChapters } from '@/lib/taxonomy'
import type { KPMastery, KPRef, SessionSettings } from '@/lib/types'
import { DEFAULT_SETTINGS, kpKey } from '@/lib/types'
import { useAIStatus } from '@/lib/use-ai-status'

const MAX_KPS = 30

export default function NewPracticePage() {
  return <Suspense><NewPractice /></Suspense>
}

function NewPractice() {
  const router = useRouter()
  const params = useSearchParams()
  const ai = useAIStatus()

  const [subject, setSubject] = useState<string>('數學')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [open, setOpen] = useState<Set<string>>(new Set())
  const [query, setQuery] = useState('')
  const [settings, setSettings] = useState<SessionSettings>(DEFAULT_SETTINGS)
  const [goal, setGoal] = useState('')
  const [mastery, setMastery] = useState<Record<string, KPMastery>>({})

  // 初始化：讀個人預設值；網址帶 ?kp=科目|大單元|知識點 時直接預選（報告頁「弱點再練」用）
  useEffect(() => {
    setMastery(getMasteryMap())
    setSettings(getProfile().defaults)
    const pre = params.getAll('kp')
    if (pre.length) {
      const subj = pre[0].split('|')[0]
      if (TAXONOMY[subj]) {
        setSubject(subj)
        setSelected(new Set(pre.filter(k => k.startsWith(subj + '|'))))
        setOpen(new Set(pre.map(k => k.split('|')[1])))
      }
    }
  }, [params])

  const chapters = getChapters(subject)
  const q = query.trim()

  const toggle = (key: string) => setSelected(prev => {
    const next = new Set(prev)
    if (next.has(key)) next.delete(key); else next.add(key)
    return next
  })
  const setChapter = (chapter: string, on: boolean) => setSelected(prev => {
    const next = new Set(prev)
    for (const kp of TAXONOMY[subject][chapter]) {
      const key = kpKey({ subject, chapter, kp })
      if (on) next.add(key); else next.delete(key)
    }
    return next
  })

  const switchSubject = (s: string) => { setSubject(s); setSelected(new Set()); setOpen(new Set()); setQuery('') }

  // 快速選取：我的弱點（練過且掌握度 < 60）
  const weakKeys = useMemo(() => Object.values(mastery)
    .filter(m => m.subject === subject && m.attempts > 0 && m.score < 60)
    .sort((a, b) => a.score - b.score).slice(0, 10).map(m => kpKey(m)), [mastery, subject])

  const scope: KPRef[] = Array.from(selected).map(k => { const [s, c, kp] = k.split('|'); return { subject: s, chapter: c, kp } })
  const tooMany = scope.length > MAX_KPS
  const offlineCount = scope.filter(r => hasGenerator(r.subject, r.kp)).length

  const start = () => {
    if (!scope.length || tooMany) return
    const p = getProfile()
    saveProfile({ ...p, defaults: settings })       // 記住這次的設定
    const s = createPracticeSession(subject, scope, settings, goal)
    router.push(`/practice/session?id=${s.id}`)
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold">選擇練習範圍</h1>
        <p className="mt-1 text-sm text-ink-soft">勾選想練的知識點。系統會先出一波檢測，依你的錯題調整下一波，最後給你學習報告。</p>
      </div>

      {ai && !ai.ai && (
        <div className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900">
          目前<strong>未連接 AI</strong>（沒有設定 GEMINI_API_KEY）。標示 <span className="chip bg-brand-50 text-brand-700">免AI</span> 的數學知識點會用程式出真題；其他知識點會出「示範題」，只能用來體驗流程。
        </div>
      )}

      {/* 科目 */}
      <div className="flex flex-wrap gap-2">
        {RECORDABLE_SUBJECTS.map(s => (
          <button key={s} onClick={() => switchSubject(s)}
            className={`rounded-xl px-3.5 py-1.5 text-sm font-medium ${s === subject ? 'bg-brand-500 text-white' : 'bg-white text-ink-soft ring-1 ring-black/5 hover:bg-black/5'}`}>
            {s}
          </button>
        ))}
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
        {/* 知識點樹 */}
        <section className="card p-4">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <input value={query} onChange={e => setQuery(e.target.value)} placeholder="搜尋知識點…"
              className="min-w-0 flex-1 rounded-xl border border-black/10 px-3 py-1.5 text-sm outline-none focus:border-brand-500" />
            {weakKeys.length > 0 && (
              <button className="btn-outline py-1.5" onClick={() => {
                setSelected(new Set(weakKeys))
                setOpen(new Set(weakKeys.map(k => k.split('|')[1])))
              }}>選我的弱點（{weakKeys.length}）</button>
            )}
            {selected.size > 0 && <button className="btn-ghost py-1.5" onClick={() => setSelected(new Set())}>清除</button>}
          </div>

          <div className="divide-y divide-black/5">
            {chapters.map(chapter => {
              const kps = TAXONOMY[subject][chapter].filter(kp => !q || kp.includes(q) || chapter.includes(q))
              if (q && kps.length === 0) return null
              const all = TAXONOMY[subject][chapter]
              const picked = all.filter(kp => selected.has(kpKey({ subject, chapter, kp }))).length
              const isOpen = open.has(chapter) || !!q
              return (
                <div key={chapter} className="py-2">
                  <div className="flex items-center gap-2">
                    <input type="checkbox" className="h-4 w-4 accent-brand-500"
                      checked={picked === all.length && all.length > 0}
                      ref={el => { if (el) el.indeterminate = picked > 0 && picked < all.length }}
                      onChange={e => setChapter(chapter, e.target.checked)} aria-label={`全選 ${chapter}`} />
                    <button className="flex flex-1 items-center justify-between text-left" onClick={() => setOpen(prev => {
                      const n = new Set(prev); if (n.has(chapter)) n.delete(chapter); else n.add(chapter); return n
                    })}>
                      <span className="font-medium">{chapter}</span>
                      <span className="text-xs text-ink-muted">{picked > 0 && <span className="mr-2 text-brand-600">已選 {picked}</span>}{all.length} 個知識點 {isOpen ? '▴' : '▾'}</span>
                    </button>
                  </div>
                  {isOpen && (
                    <div className="mt-2 flex flex-wrap gap-1.5 pl-6">
                      {kps.map(kp => {
                        const key = kpKey({ subject, chapter, kp })
                        const on = selected.has(key)
                        const m = mastery[key]
                        return (
                          <button key={kp} onClick={() => toggle(key)}
                            className={`group inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-sm transition ${on ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-black/10 bg-white hover:border-black/20'}`}>
                            {on ? '☑' : '☐'} {kp}
                            {m && m.attempts > 0 && <MasteryBadge score={m.score} showScore={false} />}
                            {hasGenerator(subject, kp) && <span className="chip bg-brand-50 px-1.5 text-[10px] text-brand-700">免AI</span>}
                          </button>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </section>

        {/* 設定 + 開始 */}
        <aside className="space-y-4 lg:sticky lg:top-16 lg:self-start">
          <div className="card space-y-4 p-4">
            <h2 className="font-semibold">練習設定</h2>
            <Field label="每波題數">
              <Seg value={settings.questionsPerRound} options={[5, 8, 10, 15]} onChange={v => setSettings({ ...settings, questionsPerRound: v })} />
            </Field>
            <Field label="最多幾波">
              <Seg value={settings.maxRounds} options={[2, 3, 4, 6]} onChange={v => setSettings({ ...settings, maxRounds: v })} />
            </Field>
            <Field label="難度">
              <Seg value={settings.difficulty} options={['adaptive', 1, 2, 3] as const}
                labels={{ adaptive: '自動', 1: '基礎', 2: '標準', 3: '進階' }}
                onChange={v => setSettings({ ...settings, difficulty: v })} />
            </Field>
            <Field label="每題建議時間">
              <Seg value={settings.secondsPerQuestion} options={[0, 60, 90, 180]}
                labels={{ 0: '不計時', 60: '1 分', 90: '1.5 分', 180: '3 分' }}
                onChange={v => setSettings({ ...settings, secondsPerQuestion: v })} />
            </Field>
            <Field label={`過關門檻：掌握度 ${settings.passScore}`}>
              <input type="range" min={60} max={95} step={5} value={settings.passScore}
                onChange={e => setSettings({ ...settings, passScore: Number(e.target.value) })} className="w-full accent-brand-500" />
            </Field>
            <Field label="這次的目標（選填）">
              <input value={goal} onChange={e => setGoal(e.target.value)} maxLength={40} placeholder="例：段考前把一元一次方程式練熟"
                className="w-full rounded-xl border border-black/10 px-3 py-1.5 text-sm outline-none focus:border-brand-500" />
            </Field>
          </div>

          <div className="card p-4">
            <div className="text-sm">已選 <strong className="text-brand-600">{scope.length}</strong> 個知識點
              {scope.length > 0 && ai && !ai.ai && <span className="text-ink-muted">（{offlineCount} 個可免 AI 出題）</span>}
            </div>
            {tooMany && <div className="mt-1 text-sm text-red-600">一次最多 {MAX_KPS} 個知識點，請縮小範圍</div>}
            <p className="mt-1 text-xs text-ink-muted">
              最多 {settings.maxRounds} 波、每波 {settings.questionsPerRound} 題；知識點全部過關會提早結束。
            </p>
            <button className="btn-primary mt-3 w-full py-2.5" disabled={!scope.length || tooMany} onClick={start}>開始練習</button>
          </div>
        </aside>
      </div>

      {/* 手機：知識點清單很長，底部固定開始按鈕 */}
      <div className="fixed inset-x-0 bottom-0 z-20 flex items-center gap-3 border-t border-black/5 bg-white/95 px-4 py-3 backdrop-blur lg:hidden">
        <div className="flex-1 text-sm">已選 <strong className="text-brand-600">{scope.length}</strong> 個知識點{tooMany && <span className="text-red-600">（超過 {MAX_KPS}）</span>}</div>
        <button className="btn-primary" disabled={!scope.length || tooMany} onClick={start}>開始練習</button>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><div className="label mb-1.5">{label}</div>{children}</div>
}

function Seg<T extends string | number>({ value, options, labels, onChange }: {
  value: T; options: readonly T[]; labels?: Partial<Record<string, string>>; onChange: (v: T) => void
}) {
  return (
    <div className="flex rounded-xl bg-black/5 p-0.5">
      {options.map(o => (
        <button type="button" key={String(o)} onClick={() => onChange(o)}
          className={`flex-1 rounded-lg px-2 py-1 text-sm ${o === value ? 'bg-white font-medium shadow-sm' : 'text-ink-soft'}`}>
          {labels?.[String(o)] ?? o}
        </button>
      ))}
    </div>
  )
}
