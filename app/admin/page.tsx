'use client'

// 館方後台（ERP）：總覽、學生與家長、程度檢測、收費帳務（只有管理員）、家長通知
// 館方人員用 Google 登入（白名單 NEXT_PUBLIC_ADMIN_EMAILS 或 staff 表）；權限在 /api/admin/* 伺服器端再驗

import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { doLogout } from '@/components/LoginGate'
import { BrandMark } from '@/components/brand'
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
      {/* 頂列：標誌＋分頁（作用中＝品牌漸層一角尖）＋身分 */}
      <header className="no-print flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2.5">
          <BrandMark size={38} />
          <div>
            <div className="font-head text-lg font-black leading-none">館方後台</div>
            <div className="kicker mt-1">ERP · Back office</div>
          </div>
        </div>
        <nav className="flex max-w-full gap-0.5 overflow-x-auto border border-line bg-white p-1 shadow-card" style={{ borderRadius: '18px 4px 18px 18px' }}>
          {tabs.map(t => (
            <button key={t.id} onClick={() => router.replace(`/admin?tab=${t.id}`)} aria-current={tab === t.id ? 'page' : undefined}
              className={`shrink-0 px-4 py-2 text-sm leaf-sm ${tab === t.id ? 'font-bold text-ink shadow-[0_6px_14px_-6px_rgba(95,227,161,0.8)]' : 'text-ink-muted hover:bg-ink/[.04] hover:text-ink'}`}
              style={tab === t.id ? { background: 'var(--brand-grad)' } : undefined}>{t.label}</button>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-2.5">
          {o && <span className="chip border-transparent bg-brand-50 text-brand-700">{admin ? '管理員' : '後台老師'}</span>}
          <span className="t-violet tile h-9 w-9 text-sm font-bold">{(o?.me.name ?? '…').slice(0, 1)}</span>
          <span className="text-sm">{o?.me.name ?? '載入中…'}</span>
          <button className="text-xs text-ink-muted hover:text-ink" onClick={doLogout}>登出</button>
        </div>
      </header>
      {err && <div className="leaf bg-red-50 px-4 py-2 text-sm text-red-700">{err}</div>}
      {tab === 'overview' && o && <Overview d={o} />}
      {tab === 'students' && <Students admin={admin} />}
      {tab === 'tests' && <Tests />}
      {tab === 'billing' && admin && <Billing />}
      {tab === 'notify' && <Notifications />}
    </div>
  )
}
