'use client'

// 觀念卡：專屬教材每個題型前的圖解觀念講解（列印與畫面共用，尺寸用 mm）
// 資料格式與驗證在 lib/concept.ts；幾何／坐標圖沿用 student-app 的 GeometryFigure

import GeometryFigure from './GeometryFigure'
import MathText from './MathText'
import type { ConceptCard as Card, Visual } from '@/lib/concept'

const tex = (s: string) => (/[\\^_=+\-*/()0-9a-zA-Z]/.test(s) && !/[一-鿿]/.test(s) ? `$${s}$` : s)

export default function ConceptCard({ card }: { card: Card }) {
  return (
    <div style={{ display: 'flex', gap: '4mm', alignItems: 'stretch', border: '0.25mm solid #222', borderLeft: '1.6mm solid #222', padding: '2mm 3mm', margin: '1mm 0 2mm', background: '#fafafa', fontSize: '9pt', lineHeight: 1.5 }}>
      {card.visual && <div style={{ flexShrink: 0, maxWidth: '78mm', display: 'flex', alignItems: 'center' }}><VisualView v={card.visual} /></div>}
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ fontWeight: 900, fontSize: '10pt' }}>觀念｜{card.title}</div>
        {card.formula && <div style={{ margin: '0.8mm 0', padding: '0.6mm 2mm', border: '0.2mm dashed #666', display: 'inline-block' }}><MathText>{tex(card.formula)}</MathText></div>}
        <ul style={{ margin: '0.5mm 0 0', paddingLeft: '4mm', listStyle: 'square' }}>
          {card.points.map((p, i) => <li key={i}><MathText>{p}</MathText></li>)}
        </ul>
      </div>
    </div>
  )
}

function VisualView({ v }: { v: Visual }) {
  if (v.type === 'numberline') return <NumberLine v={v} />
  if (v.type === 'bars') return <Bars v={v} />
  if (v.type === 'figure') return <GeometryFigure spec={v.figure} size={150} bg="#fafafa" />
  if (v.type === 'flow') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '0.4mm' }}>
        {v.steps.map((s, i) => (
          <div key={i}>
            {i > 0 && <div style={{ fontSize: '7.5pt', color: '#444', paddingLeft: '3mm' }}>↓ {s.note}</div>}
            <div style={{ border: '0.25mm solid #222', padding: '0.4mm 2.5mm', background: '#fff' }}><MathText>{`$${s.expr}$`}</MathText></div>
          </div>
        ))}
      </div>
    )
  }
  if (v.type === 'area') {
    const cell: React.CSSProperties = { border: '0.25mm solid #222', padding: '1mm 2.5mm', textAlign: 'center', background: '#fff', minWidth: '12mm' }
    return (
      <div>
        <table style={{ borderCollapse: 'collapse' }}>
          <thead><tr><td />{v.cols.map((c, i) => <td key={i} style={{ textAlign: 'center', fontSize: '8pt', padding: '0 1mm' }}><MathText>{`$${c}$`}</MathText></td>)}</tr></thead>
          <tbody>
            {v.rows.map((r, i) => (
              <tr key={i}>
                <td style={{ fontSize: '8pt', paddingRight: '1mm', textAlign: 'right' }}><MathText>{`$${r}$`}</MathText></td>
                {v.cells[i].map((c, j) => <td key={j} style={{ ...cell, background: (i + j) % 2 ? '#eee' : '#fff' }}><MathText>{`$${c}$`}</MathText></td>)}
              </tr>
            ))}
          </tbody>
        </table>
        {v.caption && <div style={{ fontSize: '8pt', marginTop: '0.5mm' }}><MathText>{`$${v.caption}$`}</MathText></div>}
      </div>
    )
  }
  // table
  return (
    <table style={{ borderCollapse: 'collapse', fontSize: '8pt' }}>
      <thead><tr>{v.head.map((h, i) => <th key={i} style={{ border: '0.25mm solid #222', padding: '0.5mm 1.5mm', background: '#e8e8e8' }}><MathText>{h}</MathText></th>)}</tr></thead>
      <tbody>{v.rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j} style={{ border: '0.25mm solid #222', padding: '0.5mm 1.5mm', background: '#fff', fontWeight: j === 0 ? 700 : 400 }}><MathText>{c}</MathText></td>)}</tr>)}</tbody>
    </table>
  )
}

/** 數線：刻度、點（空心＝不含）、範圍（粗線）、跳躍弧線（加減、距離） */
function NumberLine({ v }: { v: Extract<Visual, { type: 'numberline' }> }) {
  const W = 150, H = 46, L = 8, R = W - 8, Y = 30
  const X = (x: number) => L + ((x - v.min) / (v.max - v.min)) * (R - L)
  const span = v.max - v.min
  const step = span <= 12 ? 1 : span <= 24 ? 2 : span <= 60 ? 5 : 10
  const ticks: number[] = []
  for (let t = Math.ceil(v.min / step) * step; t <= v.max; t += step) ticks.push(t)
  return (
    <svg width="70mm" height={`${(70 * H) / W}mm`} viewBox={`0 0 ${W} ${H}`} style={{ overflow: 'visible' }}>
      <line x1={L - 4} y1={Y} x2={R + 4} y2={Y} stroke="#111" strokeWidth={0.8} />
      <path d={`M${R + 4},${Y} l-3,-2 v4 z`} fill="#111" />
      {ticks.map(t => (
        <g key={t}>
          <line x1={X(t)} y1={Y - 1.6} x2={X(t)} y2={Y + 1.6} stroke="#111" strokeWidth={0.5} />
          <text x={X(t)} y={Y + 6.5} fontSize={4} textAnchor="middle">{t}</text>
        </g>
      ))}
      {(v.ranges ?? []).map((r, i) => (
        <g key={i}>
          <line x1={X(r.from)} y1={Y - 4 - i * 3} x2={X(r.to)} y2={Y - 4 - i * 3} stroke="#555" strokeWidth={2} />
          {r.label && <text x={(X(r.from) + X(r.to)) / 2} y={Y - 6.5 - i * 3} fontSize={3.8} textAnchor="middle">{r.label}</text>}
        </g>
      ))}
      {(v.jumps ?? []).map((j, i) => {
        const a = X(j.from), b = X(j.to), h = 10 + i * 4
        return (
          <g key={i}>
            <path d={`M${a},${Y - 1} Q${(a + b) / 2},${Y - h * 2} ${b},${Y - 1}`} fill="none" stroke="#111" strokeWidth={0.6} strokeDasharray="1.5 1" />
            <path d={`M${b},${Y - 1} l${b > a ? -2.5 : 2.5},-2 l0,2.6 z`} fill="#111" />
            {j.label && <text x={(a + b) / 2} y={Y - h - 1.5} fontSize={3.8} textAnchor="middle">{j.label}</text>}
          </g>
        )
      })}
      {(v.points ?? []).map((p, i) => (
        <g key={i}>
          <circle cx={X(p.x)} cy={Y} r={1.6} fill={p.open ? '#fff' : '#111'} stroke="#111" strokeWidth={0.6} />
          {p.label && <text x={X(p.x)} y={Y + 11.5} fontSize={4} textAnchor="middle" fontWeight={700}>{p.label}</text>}
        </g>
      ))}
    </svg>
  )
}

function Bars({ v }: { v: Extract<Visual, { type: 'bars' }> }) {
  const W = 120, H = 56, B = 46, max = Math.max(...v.items.map(i => i.value), 1)
  const bw = (W - 10) / v.items.length
  return (
    <svg width="60mm" height={`${(60 * H) / W}mm`} viewBox={`0 0 ${W} ${H}`}>
      <line x1={6} y1={B} x2={W} y2={B} stroke="#111" strokeWidth={0.6} />
      {v.items.map((it, i) => {
        const h = (it.value / max) * (B - 8)
        return (
          <g key={i}>
            <rect x={8 + i * bw + bw * 0.15} y={B - h} width={bw * 0.7} height={h} fill={i % 2 ? '#888' : '#333'} />
            <text x={8 + i * bw + bw / 2} y={B - h - 1.5} fontSize={3.6} textAnchor="middle">{it.value}{v.unit}</text>
            <text x={8 + i * bw + bw / 2} y={B + 5} fontSize={3.6} textAnchor="middle">{it.label}</text>
          </g>
        )
      })}
    </svg>
  )
}
