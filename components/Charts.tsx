// 報告用的小圖表（純 SVG / CSS，無外部套件）
// 原則：單一資料色（--viz-series-1）、對照用灰色、文字用墨色、每個標記都有 hover 說明。

import { fmtPct } from './ui'

/** 各波正確率長條（單一系列 → 不需圖例，標題說明即可） */
export function RoundBars({ rounds }: { rounds: { index: number; total: number; correct: number; accuracy: number }[] }) {
  const H = 120
  return (
    <div>
      <div className="flex h-[150px] items-end gap-3 border-b border-[color:var(--viz-grid)] px-1">
        {rounds.map(r => (
          <div key={r.index} className="group flex flex-1 flex-col items-center justify-end" title={`第 ${r.index} 波：${r.correct}/${r.total} 題正確（${fmtPct(r.accuracy)}）`}>
            <span className="mb-1 text-xs font-medium tabular-nums text-ink-soft">{fmtPct(r.accuracy)}</span>
            <div className="w-full max-w-[44px] rounded-t transition-opacity group-hover:opacity-80"
              style={{ height: Math.max(3, r.accuracy * H), background: 'var(--viz-series-1)' }} />
          </div>
        ))}
      </div>
      <div className="mt-1 flex gap-3 px-1">
        {rounds.map(r => <div key={r.index} className="flex-1 text-center text-xs text-ink-muted">第{r.index}波</div>)}
      </div>
    </div>
  )
}

/** 掌握度「練習前 → 練習後」啞鈴圖：灰點＝前、藍點＝後 */
export function MasteryDumbbell({ before, after }: { before: number; after: number }) {
  const lo = Math.min(before, after), hi = Math.max(before, after)
  return (
    <div className="relative h-4 w-full" title={`練習前 ${Math.round(before)} → 練習後 ${Math.round(after)}`}>
      <div className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-[color:var(--viz-grid)]" />
      {[55, 80].map(t => (
        <div key={t} className="absolute top-0 h-4 w-px bg-black/10" style={{ left: `${t}%` }} />
      ))}
      <div className="absolute top-1/2 h-0.5 -translate-y-1/2" style={{ left: `${lo}%`, width: `${hi - lo}%`, background: after >= before ? 'var(--viz-series-1)' : 'var(--viz-bad)' }} />
      <div className="absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-white" style={{ left: `${before}%`, background: 'var(--viz-baseline)' }} />
      <div className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-white" style={{ left: `${after}%`, background: 'var(--viz-series-1)' }} />
    </div>
  )
}

/** 水平長條（錯誤類型分佈等） */
export function HBars({ items }: { items: { label: string; value: number; note?: string }[] }) {
  const max = Math.max(1, ...items.map(i => i.value))
  return (
    <div className="space-y-2">
      {items.map(i => (
        <div key={i.label} className="grid grid-cols-[5.5rem_1fr_2rem] items-center gap-2 text-sm" title={`${i.label}：${i.value} 題${i.note ? `（${i.note}）` : ''}`}>
          <span className="text-ink-soft">{i.label}</span>
          <div className="h-3 rounded-r bg-black/[.03]">
            <div className="h-3 rounded-r" style={{ width: `${(i.value / max) * 100}%`, background: 'var(--viz-series-1)', minWidth: i.value ? 3 : 0 }} />
          </div>
          <span className="text-right tabular-nums">{i.value}</span>
        </div>
      ))}
    </div>
  )
}

/** 作答軌跡：每題一格，✓/✗ 同時用符號與顏色表示 */
export function AnswerTrail({ history }: { history: boolean[] }) {
  return (
    <div className="flex flex-wrap gap-0.5">
      {history.map((ok, i) => (
        <span key={i} title={`第 ${i + 1} 次：${ok ? '答對' : '答錯'}`}
          className={`inline-flex h-4 w-4 items-center justify-center rounded text-[10px] font-bold text-white ${ok ? 'bg-[color:var(--viz-good)]' : 'bg-[color:var(--viz-bad)]'}`}>
          {ok ? '✓' : '✗'}
        </span>
      ))}
    </div>
  )
}
