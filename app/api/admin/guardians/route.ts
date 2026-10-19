import { NextResponse } from 'next/server'
import { fail, forbidden, handle, must, readJSON } from '@/lib/api-util'
import { notifyGuardians } from '@/lib/notify'
import { createServiceClient, getStaffUser } from '@/lib/server-auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// 家長聯絡人：新增／修改／刪除、產生 LINE 綁定碼、傳測試通知（館方人員）

type Body = {
  action?: 'create' | 'update' | 'delete' | 'code' | 'test'
  id?: string; student_id?: string; name?: string; relation?: string; email?: string; phone?: string
  notify_attendance?: boolean; notify_reports?: boolean
}

const code6 = () => String(Math.floor(100000 + Math.random() * 900000))
const clean = (s: string | undefined, n: number) => (s ?? '').trim().slice(0, n) || null
const validEmail = (e: string | null) => !e || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)

/** 產生還沒被用的綁定碼 */
async function freshCode(db: ReturnType<typeof createServiceClient>) {
  for (let i = 0; i < 10; i++) {
    const c = code6()
    const { data } = await db.from('guardians').select('id').eq('link_code', c).maybeSingle()
    if (!data) return c
  }
  throw new Error('無法產生綁定碼，請再試一次')
}

export const POST = handle(async req => {
  if (!(await getStaffUser(req))) return forbidden()
  const b = await readJSON<Body>(req)
  if (!b) return fail('請求格式錯誤')
  const db = createServiceClient()
  const fields = () => {
    const email = clean(b.email, 100)
    if (!validEmail(email)) throw new Error('Email 格式不對')
    return {
      name: clean(b.name, 30) ?? '家長', relation: clean(b.relation, 10), email: email?.toLowerCase() ?? null, phone: clean(b.phone, 20),
      notify_attendance: b.notify_attendance ?? true, notify_reports: b.notify_reports ?? true,
    }
  }
  switch (b.action) {
    case 'create': {
      if (!b.student_id) return fail('缺少學生')
      const row = must(await db.from('guardians').insert({ student_id: b.student_id, ...fields(), link_code: await freshCode(db) }).select('id, link_code').single())
      return NextResponse.json({ guardian: row })
    }
    case 'update': {
      if (!b.id) return fail('缺少 id')
      must(await db.from('guardians').update(fields()).eq('id', b.id))
      return NextResponse.json({ ok: true })
    }
    case 'delete': {
      if (!b.id) return fail('缺少 id')
      must(await db.from('guardians').delete().eq('id', b.id))
      return NextResponse.json({ ok: true })
    }
    case 'code': {   // 重新產生 LINE 綁定碼（換手機、換家長時）
      if (!b.id) return fail('缺少 id')
      const link_code = await freshCode(db)
      must(await db.from('guardians').update({ link_code }).eq('id', b.id))
      return NextResponse.json({ link_code })
    }
    case 'test': {
      if (!b.id) return fail('缺少 id')
      const g = must(await db.from('guardians').select('student_id, name').eq('id', b.id).single()) as { student_id: string; name: string }
      const sum = await notifyGuardians(db, g.student_id, 'test-message', { subject: '通知測試', text: `${g.name}您好，這是自習館的通知測試訊息。之後孩子到館、離館時會用這個管道通知您。` }, b.id)
      return NextResponse.json({ notified: sum })
    }
  }
  return fail('未知的 action')
})
