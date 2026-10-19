'use client'

// 家長通知：管道設定狀態＋最近 200 則紀錄（成功／失敗／略過）
import { useEffect, useState } from 'react'
import { adminApi, errMsg } from './api'

type Log = { id: number; student: string; guardian: string; channel: string; kind: string; status: string; detail: string | null; created_at: string }
type Data = { channels: { line: boolean; lineWebhook: boolean; email: boolean }; logs: Log[] }
const KIND: Record<string, string> = { checkin: '到館', checkout: '離館', test: '檢測成績', invoice: '繳費通知', 'test-message': '測試' }
const STATUS: Record<string, string> = { sent: '✅ 送出', failed: '❌ 失敗', skipped: '⏭ 略過' }

export default function Notifications() {
  const [d, setD] = useState<Data | null>(null)
  const [err, setErr] = useState('')
  useEffect(() => { adminApi<Data>('/api/admin/notifications').then(setD).catch(e => setErr(errMsg(e))) }, [])
  if (err) return <div className="rounded-xl bg-red-50 px-4 py-2 text-sm text-red-700">{err}</div>
  if (!d) return null
  const c = d.channels
  return (
    <div className="space-y-5">
      <section className="card space-y-2 p-5 text-sm">
        <h2 className="font-semibold">通知管道</h2>
        <div>{c.line ? '✅' : '⬜'} <b>LINE 官方帳號</b>（建議）：家長加好友、輸入綁定碼後，孩子到館／離館、檢測成績、繳費通知都會傳到 LINE。
          {!c.line && <span className="text-ink-muted"> 需要 LINE_CHANNEL_ACCESS_TOKEN。</span>}
          {c.line && !c.lineWebhook && <span className="text-amber-800"> 還缺 LINE_CHANNEL_SECRET，家長傳綁定碼時無法完成綁定。</span>}</div>
        <div>{c.email ? '✅' : '⬜'} <b>Email</b>（Resend）：適合沒有 LINE 的家長。{!c.email && <span className="text-ink-muted"> 需要 RESEND_API_KEY 與 MAIL_FROM。</span>}</div>
        <p className="text-xs text-ink-muted">設定步驟見 docs/ERP.md。家長聯絡人在「學生與家長」設定，每位家長可以傳測試通知確認收得到。</p>
      </section>
      <section className="card p-5 text-sm">
        <h2 className="font-semibold">最近的通知（{d.logs.length}）</h2>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full min-w-[640px]">
            <thead className="text-left text-xs text-ink-muted"><tr><th className="py-1 font-normal">時間</th><th className="font-normal">學生</th><th className="font-normal">家長</th><th className="font-normal">類型</th><th className="font-normal">管道</th><th className="font-normal">結果</th><th className="font-normal">說明</th></tr></thead>
            <tbody>
              {d.logs.map(l => (
                <tr key={l.id} className="border-t border-black/5">
                  <td className="py-1.5 tabular-nums">{new Date(l.created_at).toLocaleString('zh-TW', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false })}</td>
                  <td>{l.student}</td><td>{l.guardian}</td><td>{KIND[l.kind] ?? l.kind}</td><td>{l.channel === 'line' ? 'LINE' : 'Email'}</td>
                  <td>{STATUS[l.status] ?? l.status}</td><td className="max-w-[260px] truncate text-xs text-ink-muted" title={l.detail ?? ''}>{l.detail}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {d.logs.length === 0 && <div className="py-3 text-ink-muted">還沒有通知紀錄</div>}
        </div>
      </section>
    </div>
  )
}
