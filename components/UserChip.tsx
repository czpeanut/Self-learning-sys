'use client'

import { useEffect, useState } from 'react'
import { currentAccount } from '@/lib/accounts'
import { doLogout } from './LoginGate'

export default function UserChip() {
  const [name, setName] = useState('')
  useEffect(() => { setName(currentAccount()?.name ?? '') }, [])
  if (!name) return null
  return (
    <button onClick={() => { if (confirm(`${name}，要登出嗎？`)) doLogout() }} title="登出"
      className="shrink-0 rounded-lg px-2.5 py-1.5 text-sm text-ink-soft hover:bg-black/5">👤 {name}</button>
  )
}
