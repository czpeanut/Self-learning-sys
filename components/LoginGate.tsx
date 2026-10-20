'use client'

// 登入關卡：沒登入就先顯示登入畫面；登入後閒置 20 分鐘自動登出（無人館多人共用平板）。
// 有設定 Supabase → 雲端帳號（components/CloudGate.tsx）；沒設定 → 這台裝置上的帳號（姓名＋4 位數密碼）。

import { useCallback, useEffect, useState } from 'react'
import { type Account, type CurrentUser, currentUser, expireIfIdle, listAccounts, login, logout, touch } from '@/lib/accounts'
import { CLOUD } from '@/lib/auth-shared'
import CloudGate from './CloudGate'

export default function LoginGate({ children }: { children: React.ReactNode }) {
  return CLOUD ? <CloudGate>{children}</CloudGate> : <LocalGate>{children}</LocalGate>
}

function LocalGate({ children }: { children: React.ReactNode }) {
  const [acc, setAcc] = useState<CurrentUser | null | undefined>(undefined)
  const refresh = useCallback(() => { expireIfIdle(); setAcc(currentUser()) }, [])

  useEffect(() => {
    refresh()
    const onAct = () => touch()
    const evs = ['pointerdown', 'keydown', 'scroll'] as const
    evs.forEach(e => window.addEventListener(e, onAct, { passive: true }))
    const t = setInterval(() => { if (expireIfIdle()) setAcc(null) }, 30000)
    const onLogout = () => setAcc(null)
    window.addEventListener('sls-logout', onLogout)
    return () => { evs.forEach(e => window.removeEventListener(e, onAct)); clearInterval(t); window.removeEventListener('sls-logout', onLogout) }
  }, [refresh])

  if (acc === undefined) return null
  if (!acc) return <LoginScreen onDone={refresh} />
  // key：換人登入時整個畫面重新掛載，不會殘留上一位的資料
  return <div key={acc.id}>{children}</div>
}

/** 登出（雲端模式由 CloudGate 先上傳紀錄再登出） */
export function doLogout() {
  if (CLOUD) { window.dispatchEvent(new Event('sls-logout')); return }
  logout()
  window.dispatchEvent(new Event('sls-logout'))
  window.location.href = '/'
}

function LoginScreen({ onDone }: { onDone: () => void }) {
  const [accounts, setAccounts] = useState<Account[]>([])
  const [mode, setMode] = useState<'pick' | 'new'>('pick')
  const [name, setName] = useState('')
  const [pin, setPin] = useState('')
  const [pin2, setPin2] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => { const a = listAccounts(); setAccounts(a); if (a.length === 0) setMode('new') }, [])

  const submit = async () => {
    setErr('')
    if (mode === 'new' && pin !== pin2) { setErr('兩次輸入的密碼不一樣'); return }
    setBusy(true)
    const r = await login(name, pin, mode === 'new')
    setBusy(false)
    if (!r.ok) { setErr(r.error); setPin(''); return }
    if (mode === 'new' && !r.created) { setErr('這個名字已經有人用了，請直接登入或換個名字') ; logout(); return }
    onDone()
  }

  return (
    <div className="mx-auto mt-6 max-w-sm space-y-4">
      <div className="text-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/icons/icon-192.png" alt="" className="mx-auto h-16 w-16 leaf" />
        <div className="kicker mt-3">Self-study · K書中心</div>
        <h1 className="text-[28px] font-semibold">自習練功房</h1>
        <p className="text-sm text-ink-soft">登入後，你的練習紀錄、段考準備度都會記下來</p>
      </div>
      <div className="frame card space-y-4 p-5">
        <div className="flex leaf-sm bg-black/5 p-0.5 text-sm">
          {(['pick', 'new'] as const).map(m => (
            <button key={m} onClick={() => { setMode(m); setErr(''); setPin(''); setPin2('') }}
              className={`flex-1 leaf-sm py-1.5 ${mode === m ? 'bg-white font-medium shadow-sm' : 'text-ink-soft'}`}>
              {m === 'pick' ? '登入' : '我是新同學'}
            </button>
          ))}
        </div>
        {mode === 'pick' && accounts.length > 0 && (
          <div>
            <div className="label mb-1.5">選你的名字</div>
            <div className="flex flex-wrap gap-1.5">
              {accounts.slice(0, 30).map(a => (
                <button key={a.id} onClick={() => setName(a.name)}
                  className={`leaf-sm px-3 py-1.5 text-sm ${name === a.name ? 'bg-brand-500 text-white' : 'bg-black/5'}`}>{a.name}</button>
              ))}
            </div>
          </div>
        )}
        {(mode === 'new' || accounts.length === 0) && (
          <label className="block"><span className="label">名字</span>
            <input value={name} onChange={e => setName(e.target.value)} maxLength={20} placeholder="例：王小明"
              className="mt-1 w-full leaf-sm border border-black/10 px-3 py-2 outline-none focus:border-brand-500" /></label>
        )}
        <label className="block"><span className="label">{mode === 'new' ? '設定 4 位數密碼' : '4 位數密碼'}</span>
          <input value={pin} onChange={e => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))} inputMode="numeric" type="password" autoComplete="off"
            onKeyDown={e => { if (e.key === 'Enter') submit() }}
            className="mt-1 w-full leaf-sm border border-black/10 px-3 py-2 text-center text-xl tracking-[0.5em] outline-none focus:border-brand-500" /></label>
        {mode === 'new' && (
          <label className="block"><span className="label">再輸入一次</span>
            <input value={pin2} onChange={e => setPin2(e.target.value.replace(/\D/g, '').slice(0, 4))} inputMode="numeric" type="password" autoComplete="off"
              onKeyDown={e => { if (e.key === 'Enter') submit() }}
              className="mt-1 w-full leaf-sm border border-black/10 px-3 py-2 text-center text-xl tracking-[0.5em] outline-none focus:border-brand-500" /></label>
        )}
        {err && <div className="text-sm text-red-600">{err}</div>}
        <button className="btn-primary w-full py-2.5" disabled={busy || !name.trim() || pin.length !== 4} onClick={submit}>
          {mode === 'new' ? '建立帳號並開始' : '登入'}
        </button>
        <p className="text-center text-xs text-ink-muted">閒置 20 分鐘會自動登出，保護你的紀錄</p>
      </div>
    </div>
  )
}
