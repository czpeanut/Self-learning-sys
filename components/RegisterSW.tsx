'use client'

import { useEffect } from 'react'

/** 註冊 Service Worker（只在正式版；開發模式註冊會讓熱更新被快取卡住） */
export default function RegisterSW() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production' || !('serviceWorker' in navigator)) return
    navigator.serviceWorker.register('/sw.js').catch(e => console.warn('Service Worker 註冊失敗', e))
  }, [])
  return null
}
