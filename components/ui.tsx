import { masteryLevel } from '@/lib/engine'

export function Tile({ label, value, sub }: { label: string; value: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <div className="card p-4">
      <div className="label">{label}</div>
      <div className="mt-1 text-2xl font-bold tabular-nums">{value}</div>
      {sub != null && <div className="mt-0.5 text-xs text-ink-muted">{sub}</div>}
    </div>
  )
}

const TONE_CLASS = {
  good: 'bg-green-50 text-green-800',
  mid: 'bg-amber-50 text-amber-800',
  bad: 'bg-red-50 text-red-700',
}
const TONE_ICON = { good: '✓', mid: '↗', bad: '!' }

/** 掌握度徽章：顏色一定搭配圖示與文字，不只靠顏色辨識 */
export function MasteryBadge({ score, showScore = true }: { score: number | undefined; showScore?: boolean }) {
  if (score == null) return <span className="chip bg-black/5 text-ink-muted">未練習</span>
  const lv = masteryLevel(score)
  return (
    <span className={`chip ${TONE_CLASS[lv.tone]}`}>
      {TONE_ICON[lv.tone]} {lv.label}{showScore && <span className="ml-1 tabular-nums opacity-80">{Math.round(score)}</span>}
    </span>
  )
}

export function ProgressBar({ value, max = 1, className = '' }: { value: number; max?: number; className?: string }) {
  const pct = Math.max(0, Math.min(100, (value / (max || 1)) * 100))
  return (
    <div className={`h-2 w-full overflow-hidden rounded-full bg-black/5 ${className}`}>
      <div className="h-full rounded-full bg-brand-500 transition-all" style={{ width: `${pct}%` }} />
    </div>
  )
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <div className="rounded-xl border border-dashed border-black/10 p-6 text-center text-sm text-ink-muted">{children}</div>
}

export const fmtPct = (v: number) => `${Math.round(v * 100)}%`
export const fmtSec = (ms: number) => {
  const s = Math.round(ms / 1000)
  return s >= 60 ? `${Math.floor(s / 60)} 分 ${s % 60} 秒` : `${s} 秒`
}
export const fmtDate = (t: number) => {
  const d = new Date(t)
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}
