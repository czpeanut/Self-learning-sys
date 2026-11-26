'use client'

// 拍照閱卷：一張照片一頁。前端先用四角定位方塊校正、讀頁碼條碼，依列印時存的版面裁出每題作答區、判讀劃記圈，
// 再送到 /api/workbooks/scan 由 AI 判斷步驟與前置觀念。找不到定位方塊時改送整頁照片。

import { useState } from 'react'
import { type Gray, cropGray, downscale, findFiducials, grayFromRGBA, readBubble, readPageNo, warpPage } from '@/lib/scan'
import { BUBBLE_D, type Layout } from '@/lib/workbook'

const PX = 5   // 校正後每 mm 像素

type Line = { name: string; text: string; ok: boolean | null }

async function loadGray(file: File, maxSide: number): Promise<{ gray: Gray; jpeg: () => string }> {
  const bmp = await createImageBitmap(file)
  const s = Math.min(1, maxSide / Math.max(bmp.width, bmp.height))
  const w = Math.round(bmp.width * s), h = Math.round(bmp.height * s)
  const c = document.createElement('canvas'); c.width = w; c.height = h
  const ctx = c.getContext('2d')!
  ctx.drawImage(bmp, 0, 0, w, h)
  const data = ctx.getImageData(0, 0, w, h).data
  return { gray: grayFromRGBA(data, w, h), jpeg: () => c.toDataURL('image/jpeg', 0.75).split(',')[1] }
}

function grayToJpeg(g: Gray): string {
  const c = document.createElement('canvas'); c.width = g.w; c.height = g.h
  const ctx = c.getContext('2d')!
  const img = ctx.createImageData(g.w, g.h)
  for (let i = 0; i < g.d.length; i++) { const v = Math.round(g.d[i] * 255); img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v; img.data[i * 4 + 3] = 255 }
  ctx.putImageData(img, 0, 0)
  return c.toDataURL('image/jpeg', 0.7).split(',')[1]
}

export default function WorkbookScan({ id, loadLayout, post, onDone }: {
  id: string
  /** 每次閱卷前重新讀版面（列印頁可能剛存好） */
  loadLayout: () => Promise<Layout | null>
  post: (body: unknown) => Promise<{ graded: number[]; status: string }>
  onDone: () => void
}) {
  const [lines, setLines] = useState<Line[]>([])
  const [busy, setBusy] = useState(false)
  const set = (i: number, l: Partial<Line>) => setLines(prev => prev.map((x, j) => (j === i ? { ...x, ...l } : x)))

  const run = async (files: FileList | null) => {
    if (!files?.length) return
    const list = Array.from(files)
    setLines(list.map(f => ({ name: f.name, text: '等待中', ok: null })))
    setBusy(true)
    const layout = await loadLayout().catch(() => null)
    for (let i = 0; i < list.length; i++) {
      try {
        set(i, { text: '校正中…' })
        const { gray, jpeg } = await loadGray(list[i], 2000)
        const small = downscale(gray, 900)
        const f = findFiducials(small.g)
        const page = f ? warpPage(gray, f.map(([x, y]) => [x * small.scale, y * small.scale]), PX) : null
        const no = page ? readPageNo(page, PX) : null
        const regions = no && layout ? layout.pages.find(p => p.page === no)?.regions : undefined
        let r
        if (page && no && regions?.length) {
          const payload = regions.map(rg => ({ no: rg.no, chosen: readBubble(page, rg.bubbles, BUBBLE_D, PX).chosen, image: grayToJpeg(cropGray(page, rg.box, PX)) }))
          set(i, { text: `第 ${no} 頁 · 劃記 ${payload.filter(p => p.chosen != null).length}/${payload.length} · AI 判讀步驟…` })
          r = await post({ id, page: no, regions: payload })
          set(i, { text: `第 ${no} 頁 · 已閱 ${r.graded.length} 題`, ok: true })
        } else {
          set(i, { text: `${f ? '讀不到頁碼' : '找不到四角定位方塊'}，改用整頁判讀…` })
          r = await post({ id, image: jpeg() })
          set(i, { text: `整頁判讀 · 已閱 ${r.graded.length} 題`, ok: r.graded.length > 0 })
        }
      } catch (e) {
        set(i, { text: e instanceof Error ? e.message : '失敗', ok: false })
      }
    }
    setBusy(false)
    onDone()
  }

  return (
    <div className="space-y-2">
      <label className={`btn-primary cursor-pointer ${busy ? 'pointer-events-none opacity-50' : ''}`}>
        拍照／選照片閱卷
        <input type="file" accept="image/*" capture="environment" multiple className="hidden" disabled={busy} onChange={e => { void run(e.target.files); e.target.value = '' }} />
      </label>
      {lines.length > 0 && (
        <ul className="space-y-1 text-sm">
          {lines.map((l, i) => <li key={i} className={l.ok === false ? 'text-red-600' : l.ok ? 'text-brand-700' : 'text-ink-soft'}>{l.ok === false ? '✗' : l.ok ? '✓' : '…'} {l.name}：{l.text}</li>)}
        </ul>
      )}
    </div>
  )
}
