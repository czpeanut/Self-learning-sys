'use client'

// 專屬教材列印頁（A4）：先在隱藏區量每個區塊高度、分頁，再畫出每一頁；
// 每頁四角定位方塊（左上中空）＋頁碼條碼，每個作答區四角定位角＋題號。
// 畫好後量出作答區、步驟列、劃記圈的位置（mm）存回伺服器，拍照閱卷時依此裁切與判讀。

import { Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import ConceptCard from '@/components/ConceptCard'
import MathText from '@/components/MathText'
import { adminApi, errMsg } from '@/components/admin/api'
import {
  BUBBLE_D, CODE_BITS, CODE_CELL, CODE_STEP, CODE_X0, CODE_Y, CONTENT, FID_CENTERS, FID_HOLE, FID_SIZE, LETTERS, type Layout, MAX_PAGES,
  PAGE_H, PAGE_W, type WorkbookItem, encodePage,
} from '@/lib/workbook'

type WB = { id: string; code: string; title: string; name: string; round: number; items: WorkbookItem[]; layout: Layout | null }
type Block = { key: string; kind: 'cover' | 'section' | 'unit' | 'item'; item?: WorkbookItem; text?: string; sub?: string }

const CIRCLED = ['①', '②', '③', '④', '⑤', '⑥']
const STEP_H = 9       // mm
const ANS_H = 8.5

export default function PrintPage() {
  return <Suspense><Printer /></Suspense>
}

function Printer() {
  const id = useSearchParams().get('id') ?? ''
  const [wb, setWb] = useState<WB | null>(null)
  const [msg, setMsg] = useState('載入中…')
  const [pages, setPages] = useState<Block[][] | null>(null)
  const [saved, setSaved] = useState(false)
  const measure = useRef<HTMLDivElement>(null)
  const sheets = useRef<HTMLDivElement>(null)

  const load = useCallback(async () => {
    try {
      let w = (await adminApi<{ workbook: WB }>(`/api/admin/workbooks?id=${id}`)).workbook
      // 第一次列印：準備圖解觀念卡與步驟提示（一次一批，觀念卡全館共用、做過的直接沿用）
      for (let guard = 0; guard < 10 && w.items.some(it => !it.prepared); guard++) {
        setMsg(`準備圖解觀念卡 ${w.items.filter(it => it.prepared).length}/${w.items.length}…`)
        const r = await adminApi<{ remaining: number }>('/api/admin/workbooks', 'POST', { action: 'prepare', id }).catch(() => null)
        w = (await adminApi<{ workbook: WB }>(`/api/admin/workbooks?id=${id}`)).workbook
        if (!r) break
      }
      setWb(w); setMsg('排版中…')
    } catch (e) { setMsg(errMsg(e)) }
  }, [id])
  useEffect(() => { void load() }, [load])

  const blocks: Block[] = useMemo(() => (wb ? buildBlocks(wb) : []), [wb])

  // 1. 量高度、分頁
  useLayoutEffect(() => {
    if (!wb || pages || !measure.current) return
    let alive = true
    void document.fonts.ready.then(() => {
      if (!alive || !measure.current) return
      const pxPerMm = measure.current.getBoundingClientRect().width / CONTENT.w
      const h = new Map<string, number>()
      measure.current.querySelectorAll<HTMLElement>('[data-block]').forEach(el => h.set(el.dataset.block!, el.getBoundingClientRect().height / pxPerMm + 2.5))
      const out: Block[][] = [[]]
      let used = 0
      blocks.forEach((b, i) => {
        const need = h.get(b.key) ?? 20
        const withNext = b.kind === 'section' || b.kind === 'unit' ? need + (h.get(blocks[i + 1]?.key ?? '') ?? 0) : need
        if (used + withNext > CONTENT.h && out[out.length - 1].length) { out.push([]); used = 0 }
        out[out.length - 1].push(b); used += need
      })
      setPages(out)
    })
    return () => { alive = false }
  }, [wb, pages, blocks])

  // 2. 畫好後量作答區位置，存回伺服器
  useLayoutEffect(() => {
    if (!wb || !pages || !sheets.current || saved) return
    const layout: Layout = { total: pages.length, pages: [] }
    sheets.current.querySelectorAll<HTMLElement>('[data-page]').forEach(pg => {
      const pr = pg.getBoundingClientRect()
      const k = pr.width / PAGE_W
      const mm = (r: DOMRect) => ({ x: +((r.left - pr.left) / k).toFixed(2), y: +((r.top - pr.top) / k).toFixed(2), w: +(r.width / k).toFixed(2), h: +(r.height / k).toFixed(2) })
      layout.pages.push({
        page: Number(pg.dataset.page),
        regions: Array.from(pg.querySelectorAll<HTMLElement>('[data-area]')).map(a => ({
          no: Number(a.dataset.area),
          box: mm(a.getBoundingClientRect()),
          steps: Array.from(a.querySelectorAll<HTMLElement>('[data-step]')).map(s => mm(s.getBoundingClientRect())),
          bubbles: Array.from(a.querySelectorAll<HTMLElement>('[data-bubble]')).map(b => { const r = mm(b.getBoundingClientRect()); return { x: +(r.x + r.w / 2).toFixed(2), y: +(r.y + r.h / 2).toFixed(2) } }),
        })),
      })
    })
    setSaved(true)
    if (pages.length > MAX_PAGES) { setMsg(`超過 ${MAX_PAGES} 頁，頁碼條碼放不下，請減少題目`); return }
    adminApi('/api/admin/workbooks', 'POST', { action: 'layout', id: wb.id, layout })
      .then(() => setMsg('')).catch(e => setMsg(`版面沒有存到：${errMsg(e)}（拍照閱卷會改用整頁判讀）`))
  }, [wb, pages, saved])

  return (
    <div>
      <style>{`
        @page { size: A4; margin: 0 }
        @media print { body { background: #fff !important } main { padding: 0 !important; max-width: none !important; animation: none !important } .no-print { display: none !important } .sheet { margin: 0 !important; box-shadow: none !important } }
        .sheet { font-family: 'Noto Sans TC', 'Noto Serif TC', system-ui, sans-serif; color: #111; }
      `}</style>
      <div className="no-print mb-4 flex flex-wrap items-center gap-3">
        <h1 className="text-lg font-bold">{wb ? `${wb.name} · ${wb.title}` : '專屬教材'}</h1>
        {msg && <span className="text-sm text-ink-muted">{msg}</span>}
        {pages && <span className="text-sm text-ink-muted">{pages.length} 頁 · {wb?.items.length} 題</span>}
        <button className="btn-primary ml-auto" disabled={!pages} onClick={() => window.print()}>列印</button>
      </div>

      {/* 量高度用（看不到） */}
      {wb && !pages && (
        <div ref={measure} className="sheet" style={{ position: 'absolute', left: -10000, top: 0, width: `${CONTENT.w}mm`, visibility: 'hidden' }}>
          {blocks.map(b => <div key={b.key} data-block={b.key}><BlockView b={b} wb={wb} /></div>)}
        </div>
      )}

      {wb && pages && (
        <div ref={sheets}>
          {pages.map((pg, i) => (
            <div key={i} data-page={i + 1} className="sheet relative mx-auto mb-6 bg-white shadow-lift" style={{ width: `${PAGE_W}mm`, height: `${PAGE_H}mm`, overflow: 'hidden', breakAfter: 'page' }}>
              <PageMarks page={i + 1} total={pages.length} wb={wb} />
              <div style={{ position: 'absolute', left: `${CONTENT.x}mm`, top: `${CONTENT.y}mm`, width: `${CONTENT.w}mm` }}>
                {pg.map(b => <div key={b.key} style={{ marginBottom: '2.5mm' }}><BlockView b={b} wb={wb} /></div>)}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function buildBlocks(wb: WB): Block[] {
  const out: Block[] = [{ key: 'cover', kind: 'cover' }]
  const pre = wb.items.filter(i => i.section === 'prereq')
  if (pre.length) {
    out.push({ key: 's-pre', kind: 'section', text: '前置觀念補強', sub: '先把以前沒學穩的觀念補起來' })
    for (const it of pre) out.push({ key: `i${it.no}`, kind: 'item', item: it })
  }
  out.push({ key: 's-core', kind: 'section', text: '本輪重點觀念', sub: '觀念圖解＋一題重點題' })
  let unit = ''
  for (const it of wb.items.filter(i => i.section === 'core')) {
    if (it.unit !== unit) { unit = it.unit; out.push({ key: `u${it.unit}`, kind: 'unit', text: `${it.unit} ${it.unitTitle}` }) }
    out.push({ key: `i${it.no}`, kind: 'item', item: it })
  }
  return out
}

/** 頁面四角定位方塊、頁碼條碼、頁首頁尾 */
function PageMarks({ page, total, wb }: { page: number; total: number; wb: WB }) {
  const bits = encodePage(page)
  return (
    <>
      {FID_CENTERS.map(([cx, cy], i) => (
        <div key={i} style={{ position: 'absolute', left: `${cx - FID_SIZE / 2}mm`, top: `${cy - FID_SIZE / 2}mm`, width: `${FID_SIZE}mm`, height: `${FID_SIZE}mm`, background: '#000' }}>
          {i === 0 && <div style={{ position: 'absolute', left: `${(FID_SIZE - FID_HOLE) / 2}mm`, top: `${(FID_SIZE - FID_HOLE) / 2}mm`, width: `${FID_HOLE}mm`, height: `${FID_HOLE}mm`, background: '#fff' }} />}
        </div>
      ))}
      {Array.from({ length: CODE_BITS }, (_, i) => (
        <div key={i} style={{ position: 'absolute', left: `${CODE_X0 + i * CODE_STEP}mm`, top: `${CODE_Y - CODE_CELL / 2}mm`, width: `${CODE_CELL}mm`, height: `${CODE_CELL}mm`, background: bits[i] ? '#000' : '#fff', outline: '0.2mm solid #bbb' }} />
      ))}
      <div style={{ position: 'absolute', left: '18mm', top: '5mm', fontSize: '8pt', lineHeight: 1.35 }}>
        <div style={{ fontWeight: 700, fontSize: '10.5pt' }}>{wb.title}</div>
        <div>{wb.name} · 代碼 {wb.code}</div>
      </div>
      <div style={{ position: 'absolute', left: `${CODE_X0}mm`, top: `${CODE_Y + 3}mm`, fontSize: '7pt', fontFamily: 'monospace' }}>{wb.code}-{String(page).padStart(2, '0')}</div>
      <div style={{ position: 'absolute', left: '18mm', right: '18mm', top: '21mm', borderTop: '0.3mm solid #111' }} />
      <div style={{ position: 'absolute', left: '18mm', right: '18mm', top: '284.5mm', display: 'flex', justifyContent: 'space-between', fontSize: '7.5pt', color: '#555' }}>
        <span>拍照時四角方塊都要入鏡</span><span>{page} / {total}</span>
      </div>
    </>
  )
}

function BlockView({ b, wb }: { b: Block; wb: WB }) {
  if (b.kind === 'cover') {
    const pre = wb.items.filter(i => i.section === 'prereq').length
    return (
      <div style={{ display: 'flex', gap: '6mm', alignItems: 'flex-end', borderBottom: '0.2mm solid #999', paddingBottom: '2mm' }}>
        <div style={{ fontSize: '16pt', fontWeight: 900 }}>{wb.name}的專屬教材</div>
        <div style={{ fontSize: '9pt' }}>{wb.items.length} 個觀念{pre > 0 && `（前置補強 ${pre}）`} · 先看觀念圖解再作答，每題寫出步驟、塗滿選項圓圈</div>
      </div>
    )
  }
  if (b.kind === 'section') {
    return (
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '3mm', borderBottom: '0.4mm solid #111', paddingBottom: '1mm' }}>
        <span style={{ fontSize: '13pt', fontWeight: 900 }}>{b.text}</span><span style={{ fontSize: '8.5pt', color: '#555' }}>{b.sub}</span>
      </div>
    )
  }
  if (b.kind === 'unit') return <div style={{ borderLeft: '1.2mm solid #111', paddingLeft: '2mm', fontSize: '10.5pt', fontWeight: 700 }}>{b.text}</div>
  return <ItemView it={b.item!} />
}

function ItemView({ it }: { it: WorkbookItem }) {
  return (
    <div style={{ fontSize: '9.5pt', lineHeight: 1.5 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '2mm', flexWrap: 'wrap' }}>
        <span style={{ border: '0.3mm solid #111', padding: '0 1.6mm', fontWeight: 700 }}>{it.no}</span>
        {it.cite && <span style={{ border: '0.2mm solid #666', padding: '0 1mm', fontSize: '7.5pt' }}>{it.cite.replace(/^\[|\]$/g, '')}</span>}
        <span style={{ fontSize: '8.5pt', color: '#333' }}>題型：<b>{it.typeName}</b></span>
      </div>
      {it.reason && <div style={{ fontSize: '8pt', color: '#555' }}>補強原因：{it.reason}</div>}
      <ConceptCard card={it.concept ?? { title: it.typeName, points: it.typeDesc ? [it.typeDesc] : [] }} />
      <div style={{ marginTop: '1mm' }}><MathText>{it.stem}</MathText></div>
      <div style={{ display: 'flex', flexWrap: 'wrap', columnGap: '6mm', marginTop: '0.5mm' }}>
        {it.options.map((o, i) => <span key={i}>({LETTERS[i]}) <MathText>{o}</MathText></span>)}
      </div>
      <AnswerArea it={it} />
    </div>
  )
}

/** 步驟式作答欄：四角定位角＋題號，每一步一列，最後一列是選項劃記圈 */
function AnswerArea({ it }: { it: WorkbookItem }) {
  const corner = (pos: React.CSSProperties, rot: number) => (
    <span style={{ position: 'absolute', width: '3mm', height: '3mm', borderTop: '0.7mm solid #000', borderLeft: '0.7mm solid #000', transform: `rotate(${rot}deg)`, ...pos }} />
  )
  return (
    <div data-area={it.no} style={{ position: 'relative', marginTop: '2mm', padding: '4mm 3mm 1mm', border: '0.2mm solid #bbb' }}>
      {corner({ left: '-0.2mm', top: '-0.2mm' }, 0)}
      {corner({ right: '-0.2mm', top: '-0.2mm' }, 90)}
      {corner({ right: '-0.2mm', bottom: '-0.2mm' }, 180)}
      {corner({ left: '-0.2mm', bottom: '-0.2mm' }, 270)}
      <span style={{ position: 'absolute', left: '4mm', top: '0.6mm', fontSize: '7pt', fontWeight: 700, fontFamily: 'monospace' }}>Q{String(it.no).padStart(2, '0')}</span>
      {it.steps.map((s, i) => (
        <div key={i} data-step={i + 1} style={{ display: 'flex', height: `${STEP_H}mm`, borderBottom: '0.2mm dashed #aaa' }}>
          <span style={{ width: '36mm', flexShrink: 0, fontSize: '8pt', color: '#444', paddingTop: '1mm' }}>{CIRCLED[i]} {s}</span>
        </div>
      ))}
      <div style={{ display: 'flex', alignItems: 'center', gap: '4mm', height: `${ANS_H}mm`, fontSize: '8.5pt' }}>
        <span style={{ width: '32mm', fontWeight: 700 }}>答案（塗滿）</span>
        {it.options.map((_, i) => (
          <span key={i} data-bubble={i} style={{ width: `${BUBBLE_D}mm`, height: `${BUBBLE_D}mm`, borderRadius: '50%', border: '0.3mm solid #333', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: '6.5pt', color: '#c8c8c8' }}>{LETTERS[i]}</span>
        ))}
      </div>
    </div>
  )
}
