import { masteryLevel } from '@/lib/engine'

/** 統計卡：小標＋大數字（en＝英文小標，選填） */
export function Tile({ label, value, sub, en }: { label: string; value: React.ReactNode; sub?: React.ReactNode; en?: string }) {
  return (
    <div className="card px-4 py-3.5">
      <div className="text-xs text-ink-muted">{label}{en && <span className="ml-1 font-mono text-[9px] uppercase tracking-[0.12em]">{en}</span>}</div>
      <div className="mt-1 font-head text-[28px] font-bold leading-none tabular-nums">{value}</div>
      {sub != null && <div className="mt-1 text-xs text-ink-soft">{sub}</div>}
    </div>
  )
}

const TONE_CLASS = {
  good: 'border-brand-500/30 bg-brand-50 text-brand-700',
  mid: 'border-amber-600/30 bg-amber-50 text-amber-800',
  bad: 'border-red-600/30 bg-red-50 text-red-700',
}
const TONE_ICON = { good: '✓', mid: '↗', bad: '!' }

/** 掌握度徽章：顏色一定搭配圖示與文字，不只靠顏色辨識 */
export function MasteryBadge({ score, showScore = true }: { score: number | undefined; showScore?: boolean }) {
  if (score == null) return <span className="chip bg-ink/5 text-ink-muted">未練習</span>
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
    <div className={`leaf-sm h-2 w-full overflow-hidden bg-ink/[.07] ${className}`}>
      <div className="sweep leaf-sm h-full transition-all" style={{ width: `${pct}%`, background: 'var(--brand-grad)' }} />
    </div>
  )
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <div className="leaf border border-dashed border-line-strong bg-white/70 p-6 text-center text-sm text-ink-muted">{children}</div>
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

/** 掌握度分段條：待加強／進步中／已掌握 的題數比例（v2 三段條，方格版） */
export function SegBar({ bad, mid, good, className = '' }: { bad: number; mid: number; good: number; className?: string }) {
  const total = bad + mid + good
  return (
    <div className={`segbar ${className}`} role="img" aria-label={`待加強 ${bad}、進步中 ${mid}、已掌握 ${good}`}>
      {total === 0 ? <div className="none flex-1" /> : <>
        {bad > 0 && <div className="bad" style={{ flex: bad }} />}
        {mid > 0 && <div className="mid" style={{ flex: mid }} />}
        {good > 0 && <div className="good" style={{ flex: good }} />}
      </>}
    </div>
  )
}
