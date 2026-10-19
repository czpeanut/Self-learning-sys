'use client'

// 雲端登入關卡（有設定 Supabase 時）：
//   學生：館方發的帳號＋密碼 → 下載雲端紀錄 → 進入系統；閒置 20 分鐘自動登出並清掉這台裝置的快取
//   管理員：Google 登入（白名單），只能進 /admin 管理學生帳號

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { IDLE_LOGOUT_MS, currentUser, idleFor, setCloudUser, touch } from '@/lib/accounts'
import { type Me, cloudSignOut, consumeOAuthFragment, fetchMe, signInAdminWithGoogle, signInStudent } from '@/lib/cloud-auth'
import { startSync } from '@/lib/cloud-sync'
import { supabase } from '@/lib/supabase'

type State =
  | { s: 'loading'; msg?: string }
  | { s: 'login'; error?: string }
  | { s: 'student'; me: Me; offline?: string }
  | { s: 'admin'; me: Me }
  | { s: 'blocked'; email: string | null }

export default function CloudGate({ children }: { children: React.ReactNode }) {
  const path = usePathname()
  const [st, setSt] = useState<State>({ s: 'loading' })
  const handled = useRef<string | null>(null)

  const apply = useCallback(async (token: string | null, userId: string | null) => {
    if (!token || !userId) { handled.current = null; setSt(prev => (prev.s === 'login' ? prev : { s: 'login' })); return }
    if (handled.current === userId) return
    handled.current = userId
    setSt({ s: 'loading', msg: '確認身分中…' })
    const me = await fetchMe(token)
    if ('error' in me) { handled.current = null; setSt({ s: 'login', error: `無法確認身分：${me.error}` }); return }
    if (me.role === 'admin' || me.role === 'teacher') { setCloudUser(me.id, me.displayName ?? me.email ?? '管理員'); setSt({ s: 'admin', me }); return }
    if (me.role !== 'student') { setSt({ s: 'blocked', email: me.email }); return }
    setCloudUser(me.id, me.displayName ?? me.username ?? '', me.username)
    setSt({ s: 'loading', msg: '正在載入你的學習紀錄…' })
    const r = await startSync(me.id)
    setSt({ s: 'student', me, offline: r.ok ? undefined : r.error })
  }, [])

  useEffect(() => {
    if (!supabase) return
    let alive = true
    // 上一位學生沒登出就離開、平板放到隔天：登入狀態還在 → 超過閒置時間先登出，不讓下一位接著用
    const stale = currentUser()?.cloud && idleFor() > IDLE_LOGOUT_MS ? cloudSignOut() : Promise.resolve(true)
    stale.then(() => consumeOAuthFragment()).then(err => {
      if (err && alive) setSt({ s: 'login', error: err })
      supabase!.auth.getSession().then(({ data }) => { if (alive) void apply(data.session?.access_token ?? null, data.session?.user.id ?? null) })
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      if (alive) void apply(session?.access_token ?? null, session?.user.id ?? null)
    })
    return () => { alive = false; subscription.unsubscribe() }
  }, [apply])

  const signOut = useCallback(async () => {
    setSt({ s: 'loading', msg: '正在把紀錄存到雲端…' })
    const ok = await cloudSignOut()
    if (!ok) alert('有些紀錄還沒傳到雲端（可能沒有網路），已先保留在這台裝置，下次登入會自動補傳。')
    handled.current = null
    window.location.href = '/'
  }, [])

  // 閒置自動登出（無人館多人共用平板）；doLogout() 也走這裡
  useEffect(() => {
    if (st.s !== 'student' && st.s !== 'admin') return
    const onAct = () => touch()
    const evs = ['pointerdown', 'keydown', 'scroll'] as const
    evs.forEach(e => window.addEventListener(e, onAct, { passive: true }))
    const t = setInterval(() => { if (idleFor() > IDLE_LOGOUT_MS) void signOut() }, 30000)
    const onLogout = () => { void signOut() }
    window.addEventListener('sls-logout', onLogout)
    return () => { evs.forEach(e => window.removeEventListener(e, onAct)); clearInterval(t); window.removeEventListener('sls-logout', onLogout) }
  }, [st.s, signOut])

  if (st.s === 'loading') return <Centered><div className="mx-auto h-8 w-8 animate-spin rounded-full border-4 border-brand-100 border-t-brand-500" /><div className="mt-3 text-sm text-ink-soft">{st.msg ?? '載入中…'}</div></Centered>
  if (st.s === 'login') return <StudentLogin error={st.error} admin={path.startsWith('/admin')} />
  if (st.s === 'blocked') {
    return (
      <Centered>
        <div className="text-lg font-semibold">這個帳號沒有使用權限</div>
        <p className="mt-1 text-sm text-ink-soft">{st.email ?? ''} 不是館方管理員，或學生帳號已停用。學生請用館方發的帳號密碼登入。</p>
        <button className="btn-primary mt-4" onClick={signOut}>登出</button>
      </Centered>
    )
  }
  if (st.s === 'admin') {
    if (path.startsWith('/admin')) return <>{children}</>
    return (
      <Centered>
        <div className="text-lg font-semibold">管理員已登入</div>
        <p className="mt-1 text-sm text-ink-soft">{st.me.email} · 管理員帳號用來管理學生帳號；練習請用學生帳號登入。</p>
        <div className="mt-4 flex justify-center gap-2">
          <Link className="btn-primary" href="/admin">前往管理後台</Link>
          <button className="btn-outline" onClick={signOut}>登出</button>
        </div>
      </Centered>
    )
  }
  if (path.startsWith('/admin')) {
    return <Centered><div className="font-semibold">這裡是館方管理後台</div><p className="mt-1 text-sm text-ink-soft">請先登出學生帳號，再用管理員 Google 帳號登入。</p><Link href="/" className="btn-primary mt-4 inline-block">回首頁</Link></Centered>
  }
  return (
    <div key={st.me.id}>
      {st.offline && <div className="no-print bg-amber-50 px-4 py-1.5 text-center text-xs text-amber-900">目前連不上雲端，先用這台裝置上的紀錄；連線後會自動同步。</div>}
      {children}
    </div>
  )
}

function Centered({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto mt-16 max-w-sm px-4 text-center">{children}</div>
}

function StudentLogin({ error, admin }: { error?: string; admin: boolean }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [err, setErr] = useState(error ?? '')
  const [busy, setBusy] = useState(false)
  useEffect(() => { setErr(error ?? '') }, [error])

  const submit = async () => {
    if (!username.trim() || !password) return
    setBusy(true); setErr('')
    const e = await signInStudent(username, password)
    setBusy(false)
    if (e) { setErr(e); setPassword('') }
  }

  return (
    <div className="mx-auto mt-6 max-w-sm space-y-4 px-4">
      <div className="text-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/icons/icon-192.png" alt="" className="mx-auto h-16 w-16 rounded-2xl" />
        <div className="kicker mt-3">Self-study · K書中心</div>
        <h1 className="text-[28px] font-semibold">自習練功房</h1>
        <p className="text-sm text-ink-soft">{admin ? '館方管理後台' : '用館方發給你的帳號登入，紀錄會存在雲端，換裝置也看得到'}</p>
      </div>
      {!admin && (
        <div className="frame card space-y-4 p-5">
          <label className="block"><span className="label">帳號</span>
            <input value={username} onChange={e => setUsername(e.target.value)} autoCapitalize="none" autoComplete="username" placeholder="例：s2026001"
              className="mt-1 w-full rounded-xl border border-black/10 px-3 py-2 outline-none focus:border-brand-500" /></label>
          <label className="block"><span className="label">密碼</span>
            <input value={password} onChange={e => setPassword(e.target.value)} type="password" autoComplete="current-password"
              onKeyDown={e => { if (e.key === 'Enter') void submit() }}
              className="mt-1 w-full rounded-xl border border-black/10 px-3 py-2 outline-none focus:border-brand-500" /></label>
          {err && <div className="text-sm text-red-600">{err}</div>}
          <button className="btn-primary w-full py-2.5" disabled={busy || !username.trim() || !password} onClick={submit}>{busy ? '登入中…' : '登入'}</button>
          <p className="text-center text-xs text-ink-muted">閒置 20 分鐘會自動登出；忘記密碼請聯絡館方重設</p>
        </div>
      )}
      {admin && err && <div className="text-center text-sm text-red-600">{err}</div>}
      <div className="text-center">
        <button className={admin ? 'btn-primary' : 'text-xs text-ink-muted underline'} onClick={() => void signInAdminWithGoogle()}>館方管理員：用 Google 登入</button>
      </div>
    </div>
  )
}
