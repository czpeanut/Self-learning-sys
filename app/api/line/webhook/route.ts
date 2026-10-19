import crypto from 'crypto'
import { NextResponse } from 'next/server'
import { cleanEnv } from '@/lib/env'
import { replyLine } from '@/lib/notify'
import { createServiceClient } from '@/lib/server-auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// LINE 官方帳號 webhook（LINE Developers → Messaging API → Webhook URL 填 https://<網址>/api/line/webhook）
//  - 加好友：回覆綁定說明
//  - 傳 6 位數綁定碼：把這個 LINE 帳號綁到對應的家長（館方在 ERP 產生綁定碼），之後到館／離館都會收到通知
//  - 封鎖：解除綁定

type LineEvent = { type: string; replyToken?: string; source?: { userId?: string }; message?: { type: string; text?: string } }

export async function POST(req: Request) {
  const secret = cleanEnv(process.env.LINE_CHANNEL_SECRET)
  const raw = await req.text()
  if (!secret) return NextResponse.json({ error: '未設定 LINE_CHANNEL_SECRET' }, { status: 503 })
  const sig = req.headers.get('x-line-signature') ?? ''
  const expect = crypto.createHmac('sha256', secret).update(raw).digest('base64')
  if (sig.length !== expect.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expect))) {
    return NextResponse.json({ error: '簽章不符' }, { status: 401 })
  }
  const db = createServiceClient()
  const events = ((JSON.parse(raw) as { events?: LineEvent[] }).events ?? [])
  for (const ev of events) {
    const userId = ev.source?.userId
    if (!userId) continue
    if (ev.type === 'follow' && ev.replyToken) {
      await replyLine(ev.replyToken, '您好！這裡是自習館的到館通知。\n請輸入館方提供的 6 位數「綁定碼」，綁定後孩子到館、離館時會通知您。')
    } else if (ev.type === 'unfollow') {
      await db.from('guardians').update({ line_user_id: null }).eq('line_user_id', userId)
    } else if (ev.type === 'message' && ev.message?.type === 'text' && ev.replyToken) {
      const code = (ev.message.text ?? '').replace(/\s/g, '').match(/^\d{6}$/)?.[0]
      if (!code) { await replyLine(ev.replyToken, '請輸入館方提供的 6 位數綁定碼。'); continue }
      const { data: g } = await db.from('guardians').select('id, name, student_id').eq('link_code', code).maybeSingle()
      if (!g) { await replyLine(ev.replyToken, '找不到這個綁定碼，請確認後再輸入一次，或請館方重新產生。'); continue }
      await db.from('guardians').update({ line_user_id: userId, link_code: null }).eq('id', g.id)
      const { data: s } = await db.from('students').select('display_name').eq('id', g.student_id).maybeSingle()
      await replyLine(ev.replyToken, `綁定完成 ✅\n${g.name}，之後 ${s?.display_name ?? '孩子'} 到館、離館時會在這裡通知您。`)
    }
  }
  return NextResponse.json({ ok: true })
}
