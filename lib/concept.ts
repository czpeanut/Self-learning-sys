// ── 觀念卡（純函式）：專屬教材每個題型前面的圖解觀念講解 ──────────────────────
//
// AI 依題型挑一種圖解，填資料；畫面由 components/ConceptCard.tsx 畫出（不讓 AI 直接寫 SVG）。
// 圖解種類：
//   numberline  數線（正負數、絕對值、不等式、距離）
//   flow        步驟流程（解方程式、因式分解、運算順序：每一步的式子＋做了什麼）
//   area        面積模型（乘法公式、多項式乘法、因式分解）
//   figure      幾何／坐標圖（沿用 student-app 的 GeometryFigure 規格）
//   table       比較表（分類、性質對照）
//   bars        長條圖（統計）
// 同一個題型的觀念卡全館共用，存在 concept_cards，不用每份教材重算。

import type { FigureSpec } from '@/components/GeometryFigure'

export type Visual =
  | { type: 'numberline'; min: number; max: number; points?: { x: number; label?: string; open?: boolean }[]; ranges?: { from: number; to: number; label?: string }[]; jumps?: { from: number; to: number; label?: string }[] }
  | { type: 'flow'; steps: { expr: string; note?: string }[] }
  | { type: 'area'; cols: string[]; rows: string[]; cells: string[][]; caption?: string }
  | { type: 'figure'; figure: FigureSpec }
  | { type: 'table'; head: string[]; rows: string[][] }
  | { type: 'bars'; items: { label: string; value: number }[]; unit?: string }

export type ConceptCard = { title: string; points: string[]; formula?: string; visual?: Visual }

const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '')
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null)
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : [])
type O = Record<string, unknown>

/** 整理 AI 給的圖解；資料不合理就丟掉（只留文字） */
export function cleanVisual(raw: unknown): Visual | undefined {
  const v = (raw ?? {}) as O
  switch (v.type) {
    case 'numberline': {
      const min = num(v.min), max = num(v.max)
      if (min == null || max == null || max <= min || max - min > 200) return undefined
      const inR = (x: number | null): x is number => x != null && x >= min && x <= max
      const points = arr(v.points).map(p => ({ x: num((p as O).x), label: str((p as O).label, 10), open: (p as O).open === true })).filter(p => inR(p.x)).slice(0, 6) as { x: number; label: string; open: boolean }[]
      const ranges = arr(v.ranges).map(r => ({ from: num((r as O).from), to: num((r as O).to), label: str((r as O).label, 12) })).filter(r => inR(r.from) && inR(r.to) && r.from! < r.to!).slice(0, 3) as { from: number; to: number; label: string }[]
      const jumps = arr(v.jumps).map(r => ({ from: num((r as O).from), to: num((r as O).to), label: str((r as O).label, 10) })).filter(r => inR(r.from) && inR(r.to) && r.from !== r.to).slice(0, 4) as { from: number; to: number; label: string }[]
      return points.length + ranges.length + jumps.length ? { type: 'numberline', min, max, points, ranges, jumps } : undefined
    }
    case 'flow': {
      const steps = arr(v.steps).map(s => ({ expr: str((s as O).expr, 60), note: str((s as O).note, 14) })).filter(s => s.expr).slice(0, 5)
      return steps.length >= 2 ? { type: 'flow', steps } : undefined
    }
    case 'area': {
      const cols = arr(v.cols).map(x => str(x, 16)).slice(0, 4), rows = arr(v.rows).map(x => str(x, 16)).slice(0, 4)
      const cells = arr(v.cells).slice(0, rows.length).map(r => arr(r).slice(0, cols.length).map(x => str(x, 24)))
      if (cols.length < 1 || rows.length < 1 || cols.length * rows.length < 2 || cells.length !== rows.length || cells.some(r => r.length !== cols.length)) return undefined
      return { type: 'area', cols, rows, cells, caption: str(v.caption, 40) }
    }
    case 'figure': {
      const f = (v.figure ?? {}) as FigureSpec
      if (!Array.isArray(f.points) || f.points.length === 0 || f.points.length > 12) return undefined
      if (f.points.some(p => num(p.x) == null || num(p.y) == null)) return undefined
      return { type: 'figure', figure: f }
    }
    case 'table': {
      const head = arr(v.head).map(x => str(x, 16)).slice(0, 4)
      const rows = arr(v.rows).slice(0, 5).map(r => arr(r).slice(0, head.length).map(x => str(x, 24))).filter(r => r.length === head.length)
      return head.length >= 2 && rows.length >= 1 ? { type: 'table', head, rows } : undefined
    }
    case 'bars': {
      const items = arr(v.items).map(i => ({ label: str((i as O).label, 8), value: num((i as O).value) })).filter(i => i.label && i.value != null && i.value >= 0).slice(0, 8) as { label: string; value: number }[]
      return items.length >= 2 ? { type: 'bars', items, unit: str(v.unit, 6) } : undefined
    }
  }
  return undefined
}

export function cleanCard(raw: unknown, fallbackTitle: string): ConceptCard | null {
  const c = (raw ?? {}) as O
  const points = arr(c.points).map(p => str(p, 40)).filter(Boolean).slice(0, 3)
  if (!points.length) return null
  return { title: str(c.title, 16) || fallbackTitle.slice(0, 16), points, formula: str(c.formula, 80) || undefined, visual: cleanVisual(c.visual) }
}

/** 沒有 AI 時的觀念卡：只有題型說明 */
export const plainCard = (name: string, desc: string): ConceptCard => ({ title: name.slice(0, 16), points: desc ? [desc.slice(0, 40)] : [] })

/** 給 AI 的圖解規格說明 */
export const VISUAL_SPEC = `visual 從下列挑最能「看圖就懂」的一種（選不出來可省略）：
- numberline：{"type":"numberline","min":-5,"max":5,"points":[{"x":-3,"label":"A"}],"ranges":[{"from":1,"to":5,"label":"x>1"}],"jumps":[{"from":-3,"to":2,"label":"+5"}]}　正負數、絕對值、距離、不等式（空心點 open:true）
- flow：{"type":"flow","steps":[{"expr":"2x+3=7"},{"expr":"2x=4","note":"兩邊減 3"},{"expr":"x=2","note":"兩邊除以 2"}]}　解方程式、化簡、因式分解的步驟（expr 用 LaTeX，不加 $；note ≤10 字）
- area：{"type":"area","cols":["a","b"],"rows":["a","b"],"cells":[["a^2","ab"],["ab","b^2"]],"caption":"(a+b)^2=a^2+2ab+b^2"}　乘法公式、多項式乘法、因式分解（LaTeX，不加 $）
- figure：{"type":"figure","figure":{"points":[{"name":"A","x":0,"y":4}],"segments":[{"from":"A","to":"B"}],"circles":[{"center":"O","through":"A"}],"rightAngles":[{"at":"B","from":"A","to":"C"}],"angles":[{"at":"B","from":"A","to":"C","label":"θ"}],"segLabels":[{"on":"A-B","text":"5"}],"showAxes":false}}　幾何、坐標（坐標圖設 showAxes:true，點可加 "showCoord":true）；座標要符合圖形性質
- table：{"type":"table","head":["","外心","內心"],"rows":[["作法","中垂線","角平分線"]]}　分類、性質對照（≤4 欄 5 列）
- bars：{"type":"bars","items":[{"label":"一月","value":12}],"unit":"人"}　統計圖`
