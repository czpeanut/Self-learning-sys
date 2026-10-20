// 「霓虹方塊」視覺的共用元件：標誌、圖示、漸層功能入口、放射刻度環、六角徽章、主色區塊裝飾

import Link from 'next/link'

/** 標誌：一角尖漸層方塊＋「練」 */
export function BrandMark({ size = 32 }: { size?: number }) {
  return (
    <span aria-hidden className="inline-flex shrink-0 items-center justify-center font-black text-ink"
      style={{ width: size, height: size, fontSize: size * 0.48, background: 'var(--brand-grad)', clipPath: `polygon(0 0, ${size * 0.72}px 0, ${size}px ${size * 0.28}px, ${size}px ${size}px, 0 ${size}px)` }}>
      練
    </span>
  )
}

const PATHS = {
  home: <path d="M3 10.5L12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" />,
  book: <><path d="M2 4h7a3 3 0 0 1 3 3v13a2 2 0 0 0-2-2H2z" /><path d="M22 4h-7a3 3 0 0 0-3 3v13a2 2 0 0 1 2-2h8z" /></>,
  target: <><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5" /><circle cx="12" cy="12" r="1.5" /></>,
  wrong: <><path d="M5 3h11l3 3v15H5z" /><path d="M9.5 10.5l5 5M14.5 10.5l-5 5" /></>,
  bolt: <path d="M13 2L4 14h7l-1 8 9-12h-7z" />,
  check: <><rect x="5" y="3" width="14" height="18" rx="2" /><path d="M9 3v2h6V3M9 12l2 2 4-4" /></>,
  chart: <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />,
  timer: <><circle cx="12" cy="13" r="8" /><path d="M12 9v4l2.5 2.5M9 2h6" /></>,
  pulse: <path d="M3 12h4l3-8 4 16 3-8h4" />,
  trend: <path d="M3 17l6-6 4 4 8-8M15 7h6v6" />,
  family: <><circle cx="8" cy="7" r="3" /><circle cx="17" cy="9" r="2.5" /><path d="M2 21a6 6 0 0 1 12 0M14 21a4 4 0 0 1 8 0" /></>,
  cal: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></>,
  card: <><rect x="3" y="6" width="18" height="13" rx="2" /><path d="M3 10h18M7 15h4" /></>,
  user: <><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></>,
  'user+': <><circle cx="10" cy="8" r="4" /><path d="M3 21a7 7 0 0 1 14 0M19 8v6M16 11h6" /></>,
  doc: <><path d="M6 3h9l4 4v14H6z" /><path d="M9 12h7M9 16h7" /></>,
  msg: <path d="M4 4h16v12H9l-5 4z" />,
  bell: <><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" /></>,
  flame: <path d="M12 2c1 3.5 5 5.5 5 10a5 5 0 0 1-10 0c0-2 1-3.5 2-4.5 0 2 1 3 2 3 0-3-1-5.5 1-8.5z" />,
  more: <><rect x="4" y="4" width="6" height="6" rx="1.5" /><rect x="14" y="4" width="6" height="6" rx="1.5" /><rect x="4" y="14" width="6" height="6" rx="1.5" /><rect x="14" y="14" width="6" height="6" rx="1.5" /></>,
  play: <path d="M8 5v14l11-7z" fill="currentColor" />,
} as const
export type IconName = keyof typeof PATHS

export function Icon({ name, size = 22, stroke = 2 }: { name: IconName; size?: number; stroke?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={stroke}
      strokeLinecap="round" strokeLinejoin="round" aria-hidden className="shrink-0">{PATHS[name]}</svg>
  )
}

export type TileColor = 'blue' | 'orange' | 'pink' | 'violet' | 'green' | 'yellow' | 'sky' | 'slate' | 'lime'

/** 漸層圖示方塊 */
export function Tile({ color, icon, size = 52, iconSize }: { color: TileColor; icon: IconName; size?: number; iconSize?: number }) {
  return <span className={`tile t-${color}`} style={{ width: size, height: size }}><Icon name={icon} size={iconSize ?? Math.round(size * 0.48)} /></span>
}

/** 功能入口（金剛區）：方塊＋文字 */
export function Entry({ href, color, icon, label, size = 52 }: { href: string; color: TileColor; icon: IconName; label: string; size?: number }) {
  return (
    <Link href={href} className="flex flex-col items-center gap-1.5 text-center text-xs font-medium text-ink transition active:scale-95 sm:text-[13px]">
      <Tile color={color} icon={icon} size={size} />{label}
    </Link>
  )
}

const lerp = (a: string, b: string, t: number) => {
  const p = (h: string) => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16))
  const x = p(a), y = p(b)
  return `rgb(${x.map((v, i) => Math.round(v + (y[i] - v) * t)).join(',')})`
}
const brandAt = (t: number) => t < 0.5 ? lerp('#c6ea2a', '#3fd08d', t * 2) : lerp('#3fd08d', '#2f9cff', (t - 0.5) * 2)

/** 放射刻度環：完成的刻度依序走品牌漸層；total 超過 40 時按比例畫 40 格 */
export function Gauge({ value, total, size = 84, children }: { value: number; total: number; size?: number; children?: React.ReactNode }) {
  const n = Math.max(1, Math.min(40, total))
  const done = total > 0 ? Math.min(n, Math.round((value / total) * n)) : 0
  const c = size / 2, r2 = size * 0.47, r1 = size * 0.35
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }} role="img" aria-label={`${value} / ${total}`}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
        {Array.from({ length: n }, (_, i) => (
          <line key={i} x1={c} y1={c - r2} x2={c} y2={c - r1} strokeWidth={size * 0.05} strokeLinecap="round"
            stroke={i < done ? brandAt(i / Math.max(1, done - 1)) : '#e3e7f0'} transform={`rotate(${(i * 360) / n} ${c} ${c})`} />
        ))}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">{children}</div>
    </div>
  )
}

/** 六角徽章（段考倒數天數） */
export function HexBadge({ value, sub, size = 58 }: { value: React.ReactNode; sub: string; size?: number }) {
  return (
    <div className="flex shrink-0 flex-col items-center justify-center bg-white/25 text-white"
      style={{ width: size, height: size * 1.08, clipPath: 'polygon(50% 0, 100% 25%, 100% 75%, 50% 100%, 0 75%, 0 25%)' }}>
      <div className="font-head font-bold leading-none" style={{ fontSize: size * 0.42 }}>{value}</div>
      <div className="font-mono text-[9px] font-bold">{sub}</div>
    </div>
  )
}

/** 主色區塊的裝飾：旋轉方塊、斜紋條、點陣 */
export function HeroDecor({ tone = '255,255,255' }: { tone?: string }) {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0">
      <div className="absolute -right-9 -top-12 h-44 w-44 rotate-45" style={{ background: `linear-gradient(135deg, rgba(${tone},0.32), rgba(${tone},0.04))` }} />
      <div className="absolute right-[38%] -top-16 hidden h-52 w-52 rotate-45 md:block" style={{ background: `linear-gradient(135deg, rgba(${tone},0.20), transparent)` }} />
      <div className="absolute -left-5 bottom-2 h-9 w-44 -rotate-[8deg]" style={{ background: `repeating-linear-gradient(90deg, rgba(${tone},0.22) 0 6px, transparent 6px 14px)` }} />
      <div className="absolute bottom-10 right-6 h-9 w-16" style={{ backgroundImage: `radial-gradient(rgba(${tone},0.5) 1.5px, transparent 1.6px)`, backgroundSize: '10px 10px' }} />
    </div>
  )
}
