'use client'

// 簽到／簽退時通知伺服器（寫到館紀錄、通知家長）；只在雲端模式，失敗不影響簽到本身
import { CLOUD } from './auth-shared'
import { authFetch } from './supabase'
import type { CheckoutSummary } from './notify'

export function reportAttendance(action: 'in' | 'out', extra: { seat?: string; summary?: CheckoutSummary } = {}) {
  if (!CLOUD) return
  void authFetch('/api/attendance', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, ...extra }) }).catch(() => {})
}
