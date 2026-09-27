'use client'

// ⚠️ 此檔為 czpeanut/student-app 的 components/GeometryFigure.tsx 快照（commit 59e1270），請勿單邊修改；student-app 更新時整份重新複製。

import { safeJsonParse } from '@/lib/quiz'

// ── 幾何圖形規格（由 AI 在詳解中以 ```figure {...}``` 區塊輸出）──────────
export type FigurePoint = {
  name?:      string
  x:          number
  y:          number
  label?:     string    // 顯示用標籤（預設用 name）
  showCoord?: boolean    // 是否在點旁標出座標
}
export type FigureSpec = {
  points?:      FigurePoint[]
  segments?:    { from: string; to: string; dashed?: boolean }[]
  polygons?:    { vertices: string[]; fill?: string; dashed?: boolean }[]
  circles?:     { center: string; r?: number; through?: string; dashed?: boolean }[]
  rightAngles?: { at: string; from: string; to: string }[]
  angles?:      { at: string; from: string; to: string; label?: string }[]
  segLabels?:   { on: string; text: string }[]   // on: "A-B"
  showAxes?:    boolean
  showGrid?:    boolean
}

/** 從 ```figure``` 區塊內容解析出規格；無有效點則回 null */
export function parseFigure(raw: string): FigureSpec | null {
  const spec = safeJsonParse<FigureSpec>(raw)
  if (!spec || !Array.isArray(spec.points) || spec.points.length === 0) return null
  return spec
}

const fmt = (n: number) => (Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100))

type P = { x: number; y: number }
const dist = (a: P, b: P) => Math.hypot(a.x - b.x, a.y - b.y)
const norm = (v: P): P => { const l = Math.hypot(v.x, v.y) || 1; return { x: v.x / l, y: v.y / l } }

// 估算文字像素寬（中文字較寬）
const charW = (ch: string, fs: number) => ((ch.codePointAt(0) ?? 0) > 0x2e80 ? fs * 1.0 : fs * 0.56)
const textW = (s: string, fs: number) => Array.from(s).reduce((w, c) => w + charW(c, fs), 0)

type LabelBox = { cx: number; cy: number; w: number; h: number; text: string; fs: number; weight?: number }

// 標籤防碰撞：重疊的標籤沿較小重疊軸互相推開
function resolveLabels(labels: LabelBox[]) {
  const gap = 2
  for (let iter = 0; iter < 60; iter++) {
    let moved = false
    for (let i = 0; i < labels.length; i++) {
      for (let j = i + 1; j < labels.length; j++) {
        const a = labels[i], b = labels[j]
        const dx = b.cx - a.cx, dy = b.cy - a.cy
        const ox = (a.w + b.w) / 2 + gap - Math.abs(dx)
        const oy = (a.h + b.h) / 2 + gap - Math.abs(dy)
        if (ox > 0 && oy > 0) {
          if (ox < oy) {
            const s = ((dx === 0 ? 1 : Math.sign(dx)) * ox) / 2
            a.cx -= s; b.cx += s
          } else {
            const s = ((dy === 0 ? 1 : Math.sign(dy)) * oy) / 2
            a.cy -= s; b.cy += s
          }
          moved = true
        }
      }
    }
    if (!moved) break
  }
}

const POINT_FS = 18
const LABEL_FS = 17

export default function GeometryFigure({
  spec, size = 300, bg = '#fffdf8',
}: { spec: FigureSpec; size?: number; bg?: string }) {
  const pts = spec.points ?? []
  const byName = new Map<string, FigurePoint>()
  for (const p of pts) if (p.name) byName.set(p.name, p)
  const get = (n: string) => byName.get(n)

  const radiusOf = (c: { center: string; r?: number; through?: string }) => {
    if (c.r != null) return c.r
    const ctr = get(c.center), thr = c.through ? get(c.through) : undefined
    return ctr && thr ? dist(ctr, thr) : 0
  }

  // ── 邊界 ────────────────────────────────────────────────
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  const ext = (x: number, y: number) => {
    minX = Math.min(minX, x); minY = Math.min(minY, y)
    maxX = Math.max(maxX, x); maxY = Math.max(maxY, y)
  }
  for (const p of pts) ext(p.x, p.y)
  for (const c of spec.circles ?? []) {
    const ctr = get(c.center); if (!ctr) continue
    const r = radiusOf(c); ext(ctr.x - r, ctr.y - r); ext(ctr.x + r, ctr.y + r)
  }
  if (spec.showAxes) ext(0, 0)
  if (!isFinite(minX)) return null

  const rangeX = (maxX - minX) || 1
  const rangeY = (maxY - minY) || 1
  const scale  = size / Math.max(rangeX, rangeY)
  const pad    = 40
  const W = rangeX * scale + pad * 2
  const H = rangeY * scale + pad * 2
  const sx = (x: number) => pad + (x - minX) * scale
  const sy = (y: number) => pad + (maxY - y) * scale   // 翻轉 y（數學 y 向上）
  const S  = (p: P): P => ({ x: sx(p.x), y: sy(p.y) })

  const centroid = {
    x: pts.reduce((s, p) => s + p.x, 0) / pts.length,
    y: pts.reduce((s, p) => s + p.y, 0) / pts.length,
  }
  const dash = (d?: boolean) => (d ? '5 4' : undefined)
  const cs = { x: sx(centroid.x), y: sy(centroid.y) }   // 螢幕上的圖形中心

  // ── 收集所有文字標籤的初始錨點（之後做防碰撞）──────────────
  const labels: LabelBox[] = []
  const pushLabel = (cx: number, cy: number, text: string, fs: number, weight?: number) => {
    labels.push({ cx, cy, text, fs, weight, w: textW(text, fs) + 4, h: fs * 1.1 })
  }

  // 角弧的標記
  for (const ag of spec.angles ?? []) {
    const at = get(ag.at), a = get(ag.from), b = get(ag.to)
    if (!at || !a || !b || !ag.label) continue
    const B = S(at)
    const a1 = Math.atan2(S(a).y - B.y, S(a).x - B.x)
    let diff = Math.atan2(S(b).y - B.y, S(b).x - B.x) - a1
    while (diff <= -Math.PI) diff += 2 * Math.PI
    while (diff > Math.PI) diff -= 2 * Math.PI
    const mid = a1 + diff / 2
    pushLabel(B.x + 34 * Math.cos(mid), B.y + 34 * Math.sin(mid), ag.label, LABEL_FS)
  }
  // 邊長標記（往遠離圖形中心的一側）
  for (const sl of spec.segLabels ?? []) {
    const [an, bn] = sl.on.split('-')
    const a = get(an), b = get(bn); if (!a || !b) continue
    const A = S(a), Bp = S(b)
    const mx = (A.x + Bp.x) / 2, my = (A.y + Bp.y) / 2
    const dx = Bp.x - A.x, dy = Bp.y - A.y, l = Math.hypot(dx, dy) || 1
    let nx = -dy / l, ny = dx / l
    if ((mx - cs.x) * nx + (my - cs.y) * ny < 0) { nx = -nx; ny = -ny }
    pushLabel(mx + nx * 16, my + ny * 16, sl.text, LABEL_FS)
  }
  // 點符號／座標（往遠離中心方向）
  for (const p of pts) {
    const sp = S(p)
    let dx = sp.x - cs.x, dy = sp.y - cs.y
    const l = Math.hypot(dx, dy) || 1
    dx /= l; dy /= l
    const tag = (p.label ?? p.name ?? '') + (p.showCoord ? `(${fmt(p.x)}, ${fmt(p.y)})` : '')
    if (!tag) continue
    const gap = 14 + textW(tag, POINT_FS) / 2
    pushLabel(sp.x + dx * gap, sp.y + dy * gap, tag, POINT_FS, 600)
  }

  resolveLabels(labels)

  // ── 依最終標籤位置撐大 viewBox，避免裁切 ──────────────────
  let bx0 = 0, by0 = 0, bx1 = W, by1 = H
  for (const L of labels) {
    bx0 = Math.min(bx0, L.cx - L.w / 2 - 2); by0 = Math.min(by0, L.cy - L.h / 2 - 2)
    bx1 = Math.max(bx1, L.cx + L.w / 2 + 2); by1 = Math.max(by1, L.cy + L.h / 2 + 2)
  }
  const VBW = bx1 - bx0, VBH = by1 - by0
  const k = 2 / 3   // 整體顯示縮到原本的 2/3（含圖形與文字等比例縮小）

  return (
    <svg viewBox={`${bx0} ${by0} ${VBW} ${VBH}`} width={VBW * k} height={VBH * k}
         style={{ maxWidth: '100%', height: 'auto' }}>

      {/* 格線 */}
      {spec.showGrid && (
        <g stroke="currentColor" strokeWidth={0.5} opacity={0.18}>
          {Array.from({ length: Math.floor(rangeX) + 1 }, (_, i) => Math.ceil(minX) + i)
            .map(gx => <line key={`vx${gx}`} x1={sx(gx)} y1={pad} x2={sx(gx)} y2={H - pad} />)}
          {Array.from({ length: Math.floor(rangeY) + 1 }, (_, i) => Math.ceil(minY) + i)
            .map(gy => <line key={`hy${gy}`} x1={pad} y1={sy(gy)} x2={W - pad} y2={sy(gy)} />)}
        </g>
      )}

      {/* 座標軸 */}
      {spec.showAxes && (
        <g stroke="currentColor" strokeWidth={1} opacity={0.4}>
          {minY <= 0 && maxY >= 0 && <line x1={pad} y1={sy(0)} x2={W - pad} y2={sy(0)} />}
          {minX <= 0 && maxX >= 0 && <line x1={sx(0)} y1={pad} x2={sx(0)} y2={H - pad} />}
        </g>
      )}

      {/* 多邊形 */}
      {(spec.polygons ?? []).map((poly, i) => {
        const vs = poly.vertices.map(get).filter(Boolean) as FigurePoint[]
        if (vs.length < 2) return null
        const d = vs.map(v => `${sx(v.x)},${sy(v.y)}`).join(' ')
        return <polygon key={`poly${i}`} points={d}
                        fill={poly.fill ?? 'currentColor'} fillOpacity={poly.fill ? 0.9 : 0.06}
                        stroke="currentColor" strokeWidth={1.8} strokeDasharray={dash(poly.dashed)} />
      })}

      {/* 圓 */}
      {(spec.circles ?? []).map((c, i) => {
        const ctr = get(c.center); if (!ctr) return null
        const r = radiusOf(c); if (r <= 0) return null
        return <circle key={`cir${i}`} cx={sx(ctr.x)} cy={sy(ctr.y)} r={r * scale}
                       fill="none" stroke="currentColor" strokeWidth={1.8} strokeDasharray={dash(c.dashed)} />
      })}

      {/* 線段 */}
      {(spec.segments ?? []).map((s, i) => {
        const a = get(s.from), b = get(s.to); if (!a || !b) return null
        return <line key={`seg${i}`} x1={sx(a.x)} y1={sy(a.y)} x2={sx(b.x)} y2={sy(b.y)}
                     stroke="currentColor" strokeWidth={1.8} strokeDasharray={dash(s.dashed)} />
      })}

      {/* 直角符號 */}
      {(spec.rightAngles ?? []).map((ra, i) => {
        const at = get(ra.at), a = get(ra.from), b = get(ra.to)
        if (!at || !a || !b) return null
        const B = S(at), uA = norm({ x: S(a).x - B.x, y: S(a).y - B.y }), uC = norm({ x: S(b).x - B.x, y: S(b).y - B.y })
        const m = 13
        const p1 = `${B.x + uA.x * m},${B.y + uA.y * m}`
        const p2 = `${B.x + (uA.x + uC.x) * m},${B.y + (uA.y + uC.y) * m}`
        const p3 = `${B.x + uC.x * m},${B.y + uC.y * m}`
        return <polyline key={`ra${i}`} points={`${p1} ${p2} ${p3}`} fill="none" stroke="currentColor" strokeWidth={1.5} />
      })}

      {/* 角弧 */}
      {(spec.angles ?? []).map((ag, i) => {
        const at = get(ag.at), a = get(ag.from), b = get(ag.to)
        if (!at || !a || !b) return null
        const B = S(at)
        const a1 = Math.atan2(S(a).y - B.y, S(a).x - B.x)
        let diff = Math.atan2(S(b).y - B.y, S(b).x - B.x) - a1
        while (diff <= -Math.PI) diff += 2 * Math.PI
        while (diff > Math.PI) diff -= 2 * Math.PI
        const R = 22, steps = 14
        const arc = Array.from({ length: steps + 1 }, (_, k) => {
          const t = a1 + (diff * k) / steps
          return `${B.x + R * Math.cos(t)},${B.y + R * Math.sin(t)}`
        }).join(' ')
        return <polyline key={`ang${i}`} points={arc} fill="none" stroke="currentColor" strokeWidth={1.5} />
      })}

      {/* 點 */}
      {pts.map((p, i) => {
        const sp = S(p)
        return <circle key={`pt${i}`} cx={sp.x} cy={sp.y} r={3.4} fill="currentColor" />
      })}

      {/* 所有文字標籤（已做防碰撞）— 帶 halo 描邊避免壓線 */}
      {labels.map((L, i) => (
        <text key={`lb${i}`} x={L.cx} y={L.cy} fontSize={L.fs} fontWeight={L.weight}
              fill="currentColor" stroke={bg} strokeWidth={5} strokeLinejoin="round"
              style={{ paintOrder: 'stroke' }} textAnchor="middle" dominantBaseline="middle">
          {L.text}
        </text>
      ))}
    </svg>
  )
}
