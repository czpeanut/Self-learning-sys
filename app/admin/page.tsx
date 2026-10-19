'use client'

// 館方後台（ERP）：總覽、學生與家長、程度檢測、收費帳務（只有管理員）、家長通知
// 館方人員用 Google 登入（白名單 NEXT_PUBLIC_ADMIN_EMAILS 或 staff 表）；權限在 /api/admin/* 伺服器端再驗

import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { doLogout } from '@/components/LoginGate'
import Billing from '@/components/admin/Billing'
import Notifications from '@/components/admin/Notifications'
import Overview, { type OverviewData } from '@/components/admin/Overview'
import Students from '@/components/admin/Students'
import Tests from '@/components/admin/Tests'
import { adminApi, errMsg } from '@/components/admin/api'
import { CLOUD } from '@/lib/auth-shared'

const TABS = [
  { id: 'overview', label: '總覽' },
  { id: 'students', label: '學生與家長' },
  { id: 'tests', label: '程度檢測' },
  { id: 'billing', label: '收費帳務', admin: true },
  { id: 'notify', label: '家長通知' },
] as const
type Tab = typeof TABS[number]['id']

export default function AdminPage() {
  if (!CLOUD) {
    return (
      <div className="card mx-auto max-w-xl p-6 text-sm leading-relaxed">
        <h1 className="text-lg font-bold">館方後台</h1>
        <p className="mt-2">目前沒有設定雲端帳號（Supabase），系統使用「裝置帳號」：學生在平板上自己用姓名＋4 位數密碼建立帳號，紀錄只存在那台裝置。</p>
        <p className="mt-2">學生帳號管理、程度檢測、收費帳務、家長通知都需要雲端資料庫，請依 <code>docs/AUTH.md</code> 與 <code>docs/ERP.md</code> 設定 Supabase。</p>
      </div>
    )
  }
  return <Suspense><Console /></Suspense>
}

function Console() {
  const router = useRouter()
  const params = useSearchParams()
  const [o, setO] = useState<OverviewData | null>(null)
  const [err, setErr] = useState('')
  useEffect(() => { adminApi<OverviewData>('/api/admin/overview').then(setO).catch(e => setErr(errMsg(e))) }, [])
  const admin = o?.me.role === 'admin'
  const tabs = TABS.filter(t => !('admin' in t) || admin)
  const tab = (tabs.find(t => t.id === params.get('tab'))?.id ?? 'overview') as Tab

  return (
    <div className="space-y-5">
      <div className="no-print flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">館方後台</h1>
          <div className="text-sm text-ink-soft">{o ? `${o.me.name} · ${admin ? '管理員' : '後台老師'}` : '載入中…'}</div>
        </div>
        <button className="btn-outline" onClick={doLogout}>登出</button>
      </div>
      <nav className="no-print flex gap-1 overflow-x-auto border-b border-black/5">
        {tabs.map(t => (
          <button key={t.id} onClick={() => router.replace(`/admin?tab=${t.id}`)}
            className={`shrink-0 border-b-2 px-3 py-2 text-sm ${tab === t.id ? 'border-brand-500 font-medium text-brand-700' : 'border-transparent text-ink-soft'}`}>{t.label}</button>
        ))}
      </nav>
      {err && <div className="rounded-xl bg-red-50 px-4 py-2 text-sm text-red-700">{err}</div>}
      {tab === 'overview' && o && <Overview d={o} />}
      {tab === 'students' && <Students admin={admin} />}
      {tab === 'tests' && <Tests />}
      {tab === 'billing' && admin && <Billing />}
      {tab === 'notify' && <Notifications />}
    </div>
  )
}
