// ── 拍照閱卷的影像處理（純函式，瀏覽器與測試共用） ─────────────────────────
//
// 1. findFiducials：在灰階圖四個角落找定位方塊（左上中空、其他實心），得到四點與方向
// 2. homography＋warpPage：把照片校正成標準 A4（每 mm 固定像素），不怕斜拍、旋轉 180°
// 3. readPageNo：讀頁碼條碼；readBubble：讀劃記圈；cropGray：裁出作答區給 AI 看步驟
// 版面座標（mm）全部來自 lib/workbook.ts，列印頁與這裡共用同一套。

import { CODE_BITS, CODE_CELL, CODE_STEP, CODE_X0, CODE_Y, FID_CENTERS, PAGE_H, PAGE_W, type Rect, decodePage } from './workbook'

export type Gray = { w: number; h: number; d: Float32Array }   // 0＝黑、1＝白

export function grayFromRGBA(rgba: Uint8ClampedArray | Uint8Array, w: number, h: number): Gray {
  const d = new Float32Array(w * h)
  for (let i = 0; i < w * h; i++) d[i] = (0.299 * rgba[i * 4] + 0.587 * rgba[i * 4 + 1] + 0.114 * rgba[i * 4 + 2]) / 255
  return { w, h, d }
}

export function downscale(g: Gray, maxW: number): { g: Gray; scale: number } {
  if (g.w <= maxW) return { g, scale: 1 }
  const s = g.w / maxW
  const w = maxW, h = Math.round(g.h / s)
  const d = new Float32Array(w * h)
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    // 區塊平均（避免細線消失）
    const x0 = Math.floor(x * s), y0 = Math.floor(y * s), x1 = Math.min(g.w, Math.floor((x + 1) * s)), y1 = Math.min(g.h, Math.floor((y + 1) * s))
    let sum = 0, n = 0
    for (let yy = y0; yy < y1; yy++) for (let xx = x0; xx < x1; xx++) { sum += g.d[yy * g.w + xx]; n++ }
    d[y * w + x] = n ? sum / n : 1
  }
  return { g: { w, h, d }, scale: s }
}

/** Otsu 門檻 */
export function otsu(g: Gray): number {
  const hist = new Array(256).fill(0)
  for (let i = 0; i < g.d.length; i++) hist[Math.max(0, Math.min(255, Math.round(g.d[i] * 255)))]++
  const total = g.d.length
  let sum = 0
  for (let i = 0; i < 256; i++) sum += i * hist[i]
  let sumB = 0, wB = 0, best = 0, t = 128
  for (let i = 0; i < 256; i++) {
    wB += hist[i]; if (!wB) continue
    const wF = total - wB; if (!wF) break
    sumB += i * hist[i]
    const mB = sumB / wB, mF = (sum - sumB) / wF
    const v = wB * wF * (mB - mF) ** 2
    if (v > best) { best = v; t = i }
  }
  return t / 255
}

type Blob = { cx: number; cy: number; w: number; h: number; area: number; fill: number }

/** 某個矩形範圍內的暗色連通區塊 */
function blobs(g: Gray, t: number, x0: number, y0: number, x1: number, y1: number): Blob[] {
  const W = x1 - x0, H = y1 - y0
  const seen = new Uint8Array(W * H)
  const out: Blob[] = []
  const stack: number[] = []
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x
    if (seen[i] || g.d[(y + y0) * g.w + x + x0] >= t) continue
    let area = 0, minx = x, maxx = x, miny = y, maxy = y
    seen[i] = 1; stack.push(i)
    while (stack.length) {
      const j = stack.pop()!
      const jx = j % W, jy = (j - jx) / W
      area++
      if (jx < minx) minx = jx; if (jx > maxx) maxx = jx; if (jy < miny) miny = jy; if (jy > maxy) maxy = jy
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = jx + dx, ny = jy + dy
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue
        const k = ny * W + nx
        if (seen[k] || g.d[(ny + y0) * g.w + nx + x0] >= t) continue
        seen[k] = 1; stack.push(k)
      }
    }
    const w = maxx - minx + 1, h = maxy - miny + 1
    out.push({ cx: (minx + maxx) / 2 + x0, cy: (miny + maxy) / 2 + y0, w, h, area, fill: area / (w * h) })
  }
  return out
}

export type Pt = [number, number]

/**
 * 找四個定位方塊。回傳依「頁面的」左上、右上、右下、左下排好的四點（照片座標）；找不到回 null。
 * 方向：左上那個是中空方框（填滿率低），照片轉 90°／180° 也能對回去。
 */
export function findFiducials(g: Gray): Pt[] | null {
  const t = Math.min(0.55, otsu(g))
  const short = Math.min(g.w, g.h)
  const minS = short * 0.015, maxS = short * 0.1
  const cw = Math.round(g.w * 0.4), ch = Math.round(g.h * 0.4)
  const wins: [number, number, number, number, Pt][] = [
    [0, 0, cw, ch, [0, 0]], [g.w - cw, 0, g.w, ch, [g.w, 0]], [g.w - cw, g.h - ch, g.w, g.h, [g.w, g.h]], [0, g.h - ch, cw, g.h, [0, g.h]],
  ]
  const found: (Blob | null)[] = wins.map(([x0, y0, x1, y1, corner]) => {
    const c = blobs(g, t, x0, y0, x1, y1).filter(b => b.w >= minS && b.h >= minS && b.w <= maxS && b.h <= maxS && b.w / b.h > 0.6 && b.w / b.h < 1.6 && b.fill > 0.5)
    c.sort((a, b) => Math.hypot(a.cx - corner[0], a.cy - corner[1]) - Math.hypot(b.cx - corner[0], b.cy - corner[1]))
    return c[0] ?? null
  })
  if (found.some(b => !b)) return null
  const bs = found as Blob[]
  // 中空的那個（填滿率最低）就是頁面左上
  let k = 0
  for (let i = 1; i < 4; i++) if (bs[i].fill < bs[k].fill) k = i
  const others = bs.filter((_, i) => i !== k).map(b => b.fill)
  if (bs[k].fill > Math.min(...others) - 0.1) return null      // 分不出方向
  return [0, 1, 2, 3].map(i => { const b = bs[(k + i) % 4]; return [b.cx, b.cy] as Pt })
}

/** 求單應矩陣 H（src → dst，各 4 點） */
export function homography(src: Pt[], dst: Pt[]): number[] {
  const A: number[][] = []
  for (let i = 0; i < 4; i++) {
    const [x, y] = src[i], [u, v] = dst[i]
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y, u])
    A.push([0, 0, 0, x, y, 1, -v * x, -v * y, v])
  }
  // 高斯消去
  for (let c = 0; c < 8; c++) {
    let p = c
    for (let r = c + 1; r < 8; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r
    ;[A[c], A[p]] = [A[p], A[c]]
    for (let r = 0; r < 8; r++) {
      if (r === c) continue
      const f = A[r][c] / A[c][c]
      for (let k = c; k < 9; k++) A[r][k] -= f * A[c][k]
    }
  }
  const h = A.map((row, i) => row[8] / row[i])
  return [...h, 1]
}

export function apply(H: number[], x: number, y: number): Pt {
  const z = H[6] * x + H[7] * y + H[8]
  return [(H[0] * x + H[1] * y + H[2]) / z, (H[3] * x + H[4] * y + H[5]) / z]
}

function sample(g: Gray, x: number, y: number): number {
  if (x < 0 || y < 0 || x >= g.w - 1 || y >= g.h - 1) return 1
  const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0
  const i = y0 * g.w + x0
  return g.d[i] * (1 - fx) * (1 - fy) + g.d[i + 1] * fx * (1 - fy) + g.d[i + g.w] * (1 - fx) * fy + g.d[i + g.w + 1] * fx * fy
}

/** 把照片校正成標準頁面（pxPerMm 像素／mm）。fid＝findFiducials 的四點（照片座標） */
export function warpPage(photo: Gray, fid: Pt[], pxPerMm = 5): Gray {
  const H = homography(FID_CENTERS as Pt[], fid)            // 頁面 mm → 照片像素
  const w = Math.round(PAGE_W * pxPerMm), h = Math.round(PAGE_H * pxPerMm)
  const d = new Float32Array(w * h)
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const [px, py] = apply(H, (x + 0.5) / pxPerMm, (y + 0.5) / pxPerMm)
    d[y * w + x] = sample(photo, px, py)
  }
  return { w, h, d }
}

/** 頁面上某個 mm 圓形範圍的平均灰度 */
function meanCircle(page: Gray, pxPerMm: number, cx: number, cy: number, r: number): number {
  let s = 0, n = 0
  const R = r * pxPerMm, X = cx * pxPerMm, Y = cy * pxPerMm
  for (let y = Math.floor(Y - R); y <= Math.ceil(Y + R); y++) for (let x = Math.floor(X - R); x <= Math.ceil(X + R); x++) {
    if ((x - X) ** 2 + (y - Y) ** 2 > R * R || x < 0 || y < 0 || x >= page.w || y >= page.h) continue
    s += page.d[y * page.w + x]; n++
  }
  return n ? s / n : 1
}

/** 讀頁碼（校正後的頁面） */
export function readPageNo(page: Gray, pxPerMm = 5): number | null {
  const v = Array.from({ length: CODE_BITS }, (_, i) => meanCircle(page, pxPerMm, CODE_X0 + i * CODE_STEP + CODE_CELL / 2, CODE_Y, CODE_CELL * 0.3))
  const lo = Math.min(...v), hi = Math.max(...v)
  if (hi - lo < 0.25) return null
  const mid = (lo + hi) / 2
  return decodePage(v.map(x => x < mid))
}

/**
 * 讀一題的劃記圈：最暗的那格夠暗、且明顯比第二暗的暗，才算有劃記；否則 null（空白或塗改，交給 AI）
 * 回傳 index 與每格的「塗黑程度」0–1
 */
export function readBubble(page: Gray, bubbles: { x: number; y: number }[], d: number, pxPerMm = 5): { chosen: number | null; ink: number[] } {
  // 圈內扣掉印刷的圓框與字母：只看中心 55% 半徑，以同頁紙白當基準
  const ink = bubbles.map(b => 1 - meanCircle(page, pxPerMm, b.x, b.y, (d / 2) * 0.55))
  const order = ink.map((v, i) => [v, i]).sort((a, b) => b[0] - a[0])
  const [top, second] = [order[0], order[1] ?? [0, -1]]
  const chosen = top[0] > 0.35 && top[0] - second[0] > 0.18 ? top[1] : null
  return { chosen, ink }
}

/** 裁出頁面上的某個 mm 矩形（給 AI 看步驟） */
export function cropGray(page: Gray, r: Rect, pxPerMm = 5, pad = 2): Gray {
  const x0 = Math.max(0, Math.floor((r.x - pad) * pxPerMm)), y0 = Math.max(0, Math.floor((r.y - pad) * pxPerMm))
  const x1 = Math.min(page.w, Math.ceil((r.x + r.w + pad) * pxPerMm)), y1 = Math.min(page.h, Math.ceil((r.y + r.h + pad) * pxPerMm))
  const w = x1 - x0, h = y1 - y0
  const d = new Float32Array(w * h)
  for (let y = 0; y < h; y++) d.set(page.d.subarray((y + y0) * page.w + x0, (y + y0) * page.w + x1), y * w)
  return { w, h, d }
}
