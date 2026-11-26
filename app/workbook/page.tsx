'use client'

// 學生：紙本練功卷——每一輪的狀態、閱卷結果、要補的前置觀念；做完可以自己拍照閱卷

import { useCallback, useEffect, useState } from 'react'
import WorkbookScan from '@/components/WorkbookScan'
import { Empty } from '@/components/ui'
import { CLOUD } from '@/lib/auth-shared'
import { authFetch } from '@/lib/supabase'
import { LETTERS, STATUS_LABEL } from '@/lib/workbook'
import { type MyWorkbook, syncWorkbooks } from '@/lib/workbook-client'

export default function WorkbookPage() {
  const [list, setList] = useState<MyWorkbook[] | null>(null)
  const [open, setOpen] = useState<string | null>(null)
  const load = useCallback(async () => { const l = await syncWorkbooks(); setList(l); setOpen(o => o ?? l[0]?.id ?? null) }, [])
  useEffect(() => { if (CLOUD) void load() }, [load])

  if (!CLOUD) return <Empty>紙本練功卷需要雲端帳號</Empty>
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <h1 className="text-xl font-bold">紙本練功卷</h1>
      {!list ? <p className="text-sm text-ink-muted">載入中…</p> : list.length === 0 ? <Empty>還沒有紙本教材</Empty> : list.map(w => {
        const s = w.summary
        const isOpen = open === w.id
        return (
          <section key={w.id} className="card">
            <button className="flex w-full flex-wrap items-center gap-2 p-4 text-left" onClick={() => setOpen(isOpen ? null : w.id)}>
              <span className="font-bold">{w.title}</span>
              <span className="chip">{STATUS_LABEL[w.status]}</span>
              <span className="ml-auto text-sm text-ink-muted">{s.graded ? `答對 ${s.correct}/${s.graded}` : `${s.total} 題`}</span>
            </button>
            {isOpen && (
              <div className="space-y-3 border-t border-line p-4">
                {w.status !== 'graded' && (
                  <WorkbookScan id={w.id} loadLayout={async () => (await syncWorkbooks()).find(x => x.id === w.id)?.layout ?? null} onDone={() => void load()} post={async b => {
                    const r = await authFetch('/api/workbooks/scan', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) })
                    const d = await r.json()
                    if (!r.ok) throw new Error(d.error ?? '閱卷失敗')
                    return d
                  }} />
                )}
                {w.diagnosis.length > 0 && (
                  <div className="border border-line bg-paper/60 p-3 text-sm">
                    <div className="font-semibold">要先補的前置觀念</div>
                    <ul className="mt-1">{w.diagnosis.map(x => <li key={`${x.book}${x.unit}${x.type}`}>{x.typeName}{x.why && <span className="text-ink-muted">（{x.why}）</span>}</li>)}</ul>
                  </div>
                )}
                <ul className="divide-y divide-line text-sm">
                  {w.items.map(it => {
                    const r = w.results[String(it.no)]
                    return (
                      <li key={it.no} className="flex flex-wrap items-center gap-2 py-2">
                        <span className="font-head font-bold">{it.no}</span>
                        {it.section === 'prereq' && <span className="chip bg-[#fff1e8] text-[#c2410c]">前置</span>}
                        <span className="min-w-0 flex-1 truncate">{it.typeName}</span>
                        {r ? <>
                          <span className={`chip border-transparent ${r.status === 'correct' ? 'bg-brand-50 text-brand-700' : 'bg-[#fff0f4] text-[#c2185b]'}`}>{r.status === 'correct' ? '✓' : r.status === 'wrong' ? '✗' : '空白'}</span>
                          {r.status !== 'correct' && it.answer != null && <span className="text-xs text-ink-muted">正解 {LETTERS[it.answer]}</span>}
                          {r.note && <span className="w-full pl-6 text-xs text-ink-soft">{r.note}</span>}
                        </> : <span className="text-xs text-ink-muted">未閱</span>}
                      </li>
                    )
                  })}
                </ul>
              </div>
            )}
          </section>
        )
      })}
    </div>
  )
}
