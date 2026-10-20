'use client'

import { Suspense, useState } from 'react'
import { useSearchParams } from 'next/navigation'

export default function AccessPage() {
  return <Suspense><AccessForm /></Suspense>
}

function AccessForm() {
  const next = useSearchParams().get('next') || '/'
  const [code, setCode] = useState('')
  const [err, setErr] = useState('')
  const submit = async () => {
    setErr('')
    const res = await fetch('/api/access', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code }) })
    if (res.ok) window.location.href = next.startsWith('/') ? next : '/'
    else setErr('通行碼不對')
  }
  return (
    <div className="mx-auto mt-10 max-w-sm space-y-4 text-center">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/icons/icon-192.png" alt="" className="mx-auto h-16 w-16 leaf" />
      <h1 className="text-xl font-bold">自習練功房</h1>
      <p className="text-sm text-ink-soft">這台裝置第一次使用，請輸入館方提供的通行碼</p>
      <div className="card space-y-3 p-5">
        <input type="password" value={code} onChange={e => setCode(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') submit() }}
          className="w-full leaf-sm border border-black/10 px-3 py-2 text-center outline-none focus:border-brand-500" autoFocus />
        {err && <div className="text-sm text-red-600">{err}</div>}
        <button className="btn-primary w-full" disabled={!code} onClick={submit}>確認</button>
      </div>
    </div>
  )
}
