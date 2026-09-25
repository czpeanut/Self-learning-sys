'use client'

import { useEffect, useState } from 'react'

export type AIStatus = { ai: boolean; model: string | null }

let cache: AIStatus | null = null

/** 查詢後端是否有設定 Gemini（決定畫面要不要顯示「示範模式」提示） */
export function useAIStatus(): AIStatus | null {
  const [s, setS] = useState<AIStatus | null>(cache)
  useEffect(() => {
    if (cache) return
    fetch('/api/status').then(r => r.json()).then((d: AIStatus) => { cache = d; setS(d) }).catch(() => setS({ ai: false, model: null }))
  }, [])
  return s
}
