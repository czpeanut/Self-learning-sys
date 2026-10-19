'use client'

// 首頁：館方派的程度檢測還沒做（雲端模式）
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { CLOUD } from '@/lib/auth-shared'
import { authFetch } from '@/lib/supabase'

export default function PendingTests() {
  const [n, setN] = useState<{ count: number; title: string; due: string | null } | null>(null)
  useEffect(() => {
    if (!CLOUD) return
    authFetch('/api/tests').then(r => (r.ok ? r.json() : null)).then((d: { tests: { title: string; status: string; due_date: string | null }[] } | null) => {
      const todo = (d?.tests ?? []).filter(t => t.status !== 'submitted')
      if (todo.length) setN({ count: todo.length, title: todo[0].title, due: todo[0].due_date })
    }).catch(() => {})
  }, [])
  if (!n) return null
  return (
    <Link href="/tests" className="card flex flex-wrap items-center justify-between gap-3 border-brand-500/30 bg-brand-50 p-4 hover:shadow-md">
      <div>
        <div className="font-semibold">📝 有 {n.count} 份程度檢測還沒做</div>
        <div className="text-sm text-ink-soft">{n.title}{n.due && ` · 期限 ${n.due}`}</div>
      </div>
      <span className="btn-primary">去作答</span>
    </Link>
  )
}
