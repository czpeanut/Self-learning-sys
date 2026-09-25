'use client'

/**
 * MathText — 解析文字中的 LaTeX、Markdown 表格並渲染
 *
 * 支援：
 *  $$...$$ / \[...\]  → 區塊公式
 *  $...$   / \(...\)  → 行內公式
 *  | a | b |          → Markdown 表格（含 |---|---| 分隔列）渲染成 <table>
 *
 * 貨幣處理：US$10、NT$100 的錢字號（或 AI 明確跳脫的 \$）會被當成字面 $，
 * 不會被誤判為 LaTeX 數學起訖符（修「US$10 ~ US$25」被渲染成斜體公式的問題）。
 */

import { useMemo } from 'react'
import katex from 'katex'
import 'katex/dist/katex.min.css'

// 字面錢字號的暫存佔位符（純 ASCII、不會出現在題目文字中）：解析數學前換掉，最後還原
const DOLLAR = '@@DOLLAR@@'

type Segment =
  | { type: 'text';  content: string }
  | { type: 'inline'; content: string }
  | { type: 'block';  content: string }

// 把「字面錢字號」換成佔位符，避免被當成 $...$ 數學
function protectDollars(s: string): string {
  return s
    .replace(/\\\$/g, DOLLAR)                       // AI 明確跳脫的 \$
    .replace(/(?<=[A-Za-z])\$(?=\s?\d)/g, DOLLAR)   // 貨幣：字母 + $ + 數字（US$10、NT$ 100）
}

function parseSegments(raw: string): Segment[] {
  const segments: Segment[] = []
  // Ordered: $$ before $, \[...\] before \(...\)
  const pattern = /(\$\$[\s\S]+?\$\$|\\\[[\s\S]+?\\\]|\$[^$\n]+?\$|\\\([\s\S]+?\\\))/g
  let last = 0
  let m: RegExpExecArray | null

  while ((m = pattern.exec(raw)) !== null) {
    if (m.index > last) segments.push({ type: 'text', content: raw.slice(last, m.index) })
    const token = m[1]
    if (token.startsWith('$$') || token.startsWith('\\[')) {
      segments.push({ type: 'block', content: token.slice(2, -2).trim() })
    } else {
      const inner = token.startsWith('$') ? token.slice(1, -1) : token.slice(2, -2)
      segments.push({ type: 'inline', content: inner.trim() })
    }
    last = m.index + token.length
  }
  if (last < raw.length) segments.push({ type: 'text', content: raw.slice(last) })
  return segments
}

function renderKatex(tex: string, display: boolean): string {
  try {
    return katex.renderToString(tex, { displayMode: display, throwOnError: false, strict: false, trust: false })
  } catch {
    return `<span style="color:#f87171">[公式錯誤: ${tex}]</span>`
  }
}

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

// 一段（非表格）文字 → HTML：處理貨幣、數學公式、換行
function renderInline(raw: string, newlines: boolean): string {
  const segments = parseSegments(protectDollars(raw))
  return segments.map(seg => {
    if (seg.type === 'block')  return renderKatex(seg.content, true)
    if (seg.type === 'inline') return renderKatex(seg.content, false)
    let out = escapeHtml(seg.content).split(DOLLAR).join('$')   // 還原字面 $
    if (newlines) out = out.replace(/\n/g, '<br>')
    return out
  }).join('')
}

// ── Markdown 表格 ──────────────────────────────────────────
const isTableLine    = (l: string) => { const t = l.trim(); return t.startsWith('|') && t.endsWith('|') && t.length > 1 }
const isSeparatorRow = (l: string) => /^\s*\|(?:\s*:?-+:?\s*\|)+\s*$/.test(l)

function splitCells(line: string): string[] {
  return line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(c => c.trim())
}

function renderTable(lines: string[]): string {
  const sepIdx = lines.findIndex(isSeparatorRow)
  const headerLines = sepIdx >= 0 ? lines.slice(0, sepIdx) : lines.slice(0, 1)
  const bodyLines   = sepIdx >= 0 ? lines.slice(sepIdx + 1) : lines.slice(1)

  const cell = 'border:1px solid rgba(128,128,128,0.45);padding:3px 8px;text-align:left;vertical-align:top;'
  const th = (c: string) => `<th style="${cell}font-weight:600;">${renderInline(c, false)}</th>`
  const td = (c: string) => `<td style="${cell}">${renderInline(c, false)}</td>`

  const thead = headerLines.length
    ? `<thead>${headerLines.map(l => `<tr>${splitCells(l).map(th).join('')}</tr>`).join('')}</thead>` : ''
  const tbody = `<tbody>${bodyLines.map(l => `<tr>${splitCells(l).map(td).join('')}</tr>`).join('')}</tbody>`
  return `<table style="border-collapse:collapse;margin:6px 0;font-size:0.92em;max-width:100%;">${thead}${tbody}</table>`
}

// 把整段文字切成「表格區塊」與「一般文字區塊」並各自渲染
function renderAll(raw: string, newlines: boolean): { html: string; hasTable: boolean } {
  const lines = raw.split('\n')
  let html = ''
  let hasTable = false
  let buf: string[] = []
  const flush = () => { if (buf.length) { html += renderInline(buf.join('\n'), newlines); buf = [] } }

  let i = 0
  while (i < lines.length) {
    // 表格起點：本行與下一行都是 | 列（至少兩列才算表格）
    if (isTableLine(lines[i]) && i + 1 < lines.length && isTableLine(lines[i + 1])) {
      flush()
      const run: string[] = []
      while (i < lines.length && isTableLine(lines[i])) { run.push(lines[i]); i++ }
      html += renderTable(run)
      hasTable = true
    } else {
      buf.push(lines[i]); i++
    }
  }
  flush()
  return { html, hasTable }
}

interface Props {
  children: string
  className?: string
  /** 讓換行符 \n 變成 <br>（預設 true） */
  newlines?: boolean
}

export default function MathText({ children, className, newlines = true }: Props) {
  const { html, hasTable } = useMemo(() => renderAll(children ?? '', newlines), [children, newlines])

  // 含表格時用 <div>（block，<table> 不能放在 <span> 內）；否則維持 <span> 行內行為
  if (hasTable) {
    return <div className={className} dangerouslySetInnerHTML={{ __html: html }} />
  }
  return <span className={className} dangerouslySetInnerHTML={{ __html: html }} />
}
