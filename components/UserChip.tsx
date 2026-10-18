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

export default function UserChip() {
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
  return (
    <button onClick={() => { if (confirm(`${name}，要登出嗎？`)) doLogout() }} title={cloud ? `${SYNC[sync].title}；點一下登出` : '登出'}
      className="shrink-0 rounded-lg px-2.5 py-1.5 text-sm text-ink-soft hover:bg-black/5">
      {cloud && <span className="mr-1" aria-label={SYNC[sync].title}>{SYNC[sync].icon}</span>}👤 {name}
    </button>
  )
}
