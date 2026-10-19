// ── 家長通知（伺服器端）：LINE 官方帳號（Messaging API）＋ Email（Resend） ─────────
//
// LINE：家長加館方的 LINE 官方帳號為好友，傳館方給的 6 位數綁定碼 → /api/line/webhook 記下家長的 LINE userId，
//       之後用 push API 傳訊息（LINE Notify 已於 2025-03-31 停止服務，不能用）。
// Email：Resend 的 HTTP API（不需要裝套件）；沒設定就略過。
// 每則通知都寫進 notifications 表（成功／失敗／略過），ERP 可以查。

import type { SupabaseClient } from '@supabase/supabase-js'
import { cleanEnv } from './env'

const env = (k: string) => cleanEnv(process.env[k])
// 預設官方網址；*_API_BASE 只在測試或經由代理時才需要改
const LINE_BASE = () => env('LINE_API_BASE') || 'https://api.line.me'
const RESEND_BASE = () => env('RESEND_API_BASE') || 'https://api.resend.com'

export const channels = () => ({
  line: !!env('LINE_CHANNEL_ACCESS_TOKEN'),
  lineWebhook: !!env('LINE_CHANNEL_SECRET'),
  email: !!env('RESEND_API_KEY') && !!env('MAIL_FROM'),
})

export async function pushLine(to: string, text: string): Promise<void> {
  const res = await fetch(`${LINE_BASE()}/v2/bot/message/push`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env('LINE_CHANNEL_ACCESS_TOKEN')}` },
    body: JSON.stringify({ to, messages: [{ type: 'text', text: text.slice(0, 4900) }] }),
  })
  if (!res.ok) throw new Error(`LINE ${res.status} ${(await res.text()).slice(0, 200)}`)
}

export async function replyLine(replyToken: string, text: string): Promise<void> {
  await fetch(`${LINE_BASE()}/v2/bot/message/reply`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env('LINE_CHANNEL_ACCESS_TOKEN')}` },
    body: JSON.stringify({ replyToken, messages: [{ type: 'text', text }] }),
  }).catch(() => {})
}

export async function sendEmail(to: string, subject: string, text: string): Promise<void> {
  const res = await fetch(`${RESEND_BASE()}/emails`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env('RESEND_API_KEY')}` },
    body: JSON.stringify({ from: env('MAIL_FROM'), to: [to], subject, text }),
  })
  if (!res.ok) throw new Error(`Email ${res.status} ${(await res.text()).slice(0, 200)}`)
}

export type Guardian = {
  id: string; student_id: string; name: string; email: string | null; line_user_id: string | null
  notify_attendance: boolean; notify_reports: boolean
}
export type NotifyKind = 'checkin' | 'checkout' | 'test' | 'invoice' | 'test-message'
export type NotifySummary = { sent: number; failed: number; skipped: number }

/** 通知某位學生的家長；kind 決定看哪個開關（到館類看 notify_attendance，其他看 notify_reports） */
export async function notifyGuardians(
  db: SupabaseClient, studentId: string, kind: NotifyKind, msg: { subject: string; text: string }, onlyGuardian?: string,
): Promise<NotifySummary> {
  let q = db.from('guardians').select('id, student_id, name, email, line_user_id, notify_attendance, notify_reports').eq('student_id', studentId)
  if (onlyGuardian) q = q.eq('id', onlyGuardian)
  const { data } = await q
  const ch = channels()
  const sum: NotifySummary = { sent: 0, failed: 0, skipped: 0 }
  const logs: Record<string, unknown>[] = []
  for (const g of (data ?? []) as Guardian[]) {
    const wants = kind === 'test-message' || (kind === 'checkin' || kind === 'checkout' ? g.notify_attendance : g.notify_reports)
    if (!wants) continue
    const tryOne = async (channel: 'line' | 'email', ready: boolean, target: string | null, send: () => Promise<void>) => {
      if (!target) return
      if (!ready) { sum.skipped++; logs.push({ student_id: studentId, guardian_id: g.id, channel, kind, status: 'skipped', detail: '尚未設定這個通知管道' }); return }
      try { await send(); sum.sent++; logs.push({ student_id: studentId, guardian_id: g.id, channel, kind, status: 'sent', detail: msg.subject }) }
      catch (e) { sum.failed++; logs.push({ student_id: studentId, guardian_id: g.id, channel, kind, status: 'failed', detail: e instanceof Error ? e.message.slice(0, 300) : String(e) }) }
    }
    await tryOne('line', ch.line, g.line_user_id, () => pushLine(g.line_user_id!, msg.text))
    await tryOne('email', ch.email, g.email, () => sendEmail(g.email!, msg.subject, msg.text))
  }
  if (logs.length) await db.from('notifications').insert(logs)
  return sum
}

// ── 訊息內容（家長在手機上看：短行、有表情符號） ──
const TZ = 'Asia/Taipei'
export const taipeiDate = (d = new Date()) => d.toLocaleDateString('sv-SE', { timeZone: TZ })
export const taipeiTime = (d: Date) => d.toLocaleTimeString('zh-TW', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false })
const md = (d: Date) => d.toLocaleDateString('zh-TW', { timeZone: TZ, month: 'numeric', day: 'numeric' })
const dur = (min: number) => (min >= 60 ? `${Math.floor(min / 60)} 小時 ${min % 60} 分` : `${min} 分鐘`)

export type CheckoutSummary = { focusMinutes?: number; answered?: number; correct?: number; mood?: string; learned?: string }

export function checkinMessage(name: string, at: Date, seat?: string | null) {
  return {
    subject: `${name} 已到館`,
    text: `📍 ${name} ${md(at)} ${taipeiTime(at)} 已到館${seat ? `（座位 ${seat}）` : ''}。\n離館時會再通知您今天的學習情形。`,
  }
}

export function checkoutMessage(name: string, inAt: Date, outAt: Date, s: CheckoutSummary) {
  const stay = Math.max(0, Math.round((outAt.getTime() - inAt.getTime()) / 60000))
  const L = [`🏠 ${name} ${md(outAt)} ${taipeiTime(outAt)} 已離館（${taipeiTime(inAt)} 到館，在館 ${dur(stay)}）。`]
  if (s.focusMinutes) L.push(`⏱ 專注讀書 ${dur(s.focusMinutes)}`)
  if (s.answered) L.push(`✏️ 練習 ${s.answered} 題${s.correct != null ? `，正確率 ${Math.round((s.correct / s.answered) * 100)}%` : ''}`)
  if (s.mood) L.push(`💬 孩子的心得：${s.mood}${s.learned ? `｜學到：${s.learned}` : ''}`)
  return { subject: `${name} 已離館`, text: L.join('\n') }
}
