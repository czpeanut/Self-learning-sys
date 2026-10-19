'use client'

// 後台共用：帶登入憑證呼叫 /api/admin/*、下載 CSV
import { authFetch } from '@/lib/supabase'

export async function adminApi<T = Record<string, unknown>>(path: string, method = 'GET', body?: unknown): Promise<T> {
  const res = await authFetch(path, {
    method, headers: body ? { 'Content-Type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined,
  })
  const d = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error((d as { error?: string }).error ?? `HTTP ${res.status}`)
  return d as T
}

/** 下載需要登入的檔案（CSV 匯出） */
export async function download(path: string, filename: string) {
  const res = await authFetch(path)
  if (!res.ok) throw new Error(`下載失敗（HTTP ${res.status}）`)
  const url = URL.createObjectURL(await res.blob())
  const a = document.createElement('a')
  a.href = url; a.download = filename; a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/** 前端產生 CSV 並下載（含 BOM，Excel 不亂碼） */
export function downloadCSV(rows: (string | number | null | undefined)[][], filename: string) {
  const esc = (v: string | number | null | undefined) => { const s = v == null ? '' : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s }
  const blob = new Blob(['﻿' + rows.map(r => r.map(esc).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = filename; a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export const money = (n: number) => `$${Math.round(n).toLocaleString()}`
export const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e))
export const hm = (iso: string) => new Date(iso).toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit', hour12: false })
