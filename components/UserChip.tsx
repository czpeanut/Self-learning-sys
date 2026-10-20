'use client'

import { useEffect, useState } from 'react'
import { currentUser } from '@/lib/accounts'
import { type SyncStatus, getSyncStatus, onSyncStatus } from '@/lib/cloud-sync'
import { doLogout } from './LoginGate'

const SYNC: Record<SyncStatus, { icon: string; title: string }> = {
  idle: { icon: '☁️', title: '紀錄已存到雲端' },
  syncing: { icon: '⏳', title: '正在同步紀錄…' },
  offline: { icon: '⚠️', title: '連不上雲端，紀錄先存在這台裝置，連線後自動上傳' },
}

export default function UserChip({ compact = false }: { compact?: boolean }) {
  const [name, setName] = useState('')
  const [cloud, setCloud] = useState(false)
  const [sync, setSync] = useState<SyncStatus>('idle')
  useEffect(() => {
    const u = currentUser()
    setName(u?.name ?? '')
    setCloud(!!u?.cloud)
    setSync(getSyncStatus())
    return onSyncStatus(setSync)
  }, [])
  if (!name) return null
  const onClick = () => { if (confirm(`${name}，要登出嗎？`)) doLogout() }
  const title = cloud ? `${name} · ${SYNC[sync].title}；點一下登出` : `${name} · 點一下登出`
  if (compact) {
    // 平板／桌機左側直欄：姓名第一個字的頭像，同步狀態用小圓點
    return (
      <button onClick={onClick} title={title} aria-label={title}
        className="t-violet tile relative h-10 w-10 text-sm font-bold">
        <span>{name.slice(0, 1)}</span>
        {cloud && <span className={`absolute right-1 top-1 h-2 w-2 rounded-full ${sync === 'offline' ? 'bg-amber-300' : sync === 'syncing' ? 'bg-sky-200' : 'bg-lime-300'}`} />}
      </button>
    )
  }
  return (
    <button onClick={onClick} title={title}
      className="shrink-0 leaf-sm px-2.5 py-1.5 text-sm text-ink-soft hover:bg-ink/5">
      {cloud && <span className="mr-1" aria-label={SYNC[sync].title}>{SYNC[sync].icon}</span>}👤 {name}
    </button>
  )
}
