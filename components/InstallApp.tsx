'use client'

// 「安裝 App／加到主畫面」
//  - Android／Chrome／Edge：攔下 beforeinstallprompt，按鈕一鍵跳出系統安裝視窗
//  - iPhone／iPad（Safari）：蘋果不提供一鍵安裝 API，改顯示「分享 → 加入主畫面」圖解
//  - LINE／Facebook／IG 內建瀏覽器：無法安裝，引導改用 Safari／Chrome 開啟（家長常從 LINE 點連結進來）
//  - 已經是安裝後的 App（standalone）就不顯示

import { useEffect, useState } from 'react'

type BeforeInstallPromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> }
type Env = 'installable' | 'ios' | 'in-app' | 'other' | 'installed'

function detect(): Env {
  const nav = navigator as Navigator & { standalone?: boolean }
  if (window.matchMedia('(display-mode: standalone)').matches || nav.standalone) return 'installed'
  const ua = navigator.userAgent
  if (/Line\/|FBAN|FBAV|Instagram/i.test(ua)) return 'in-app'
  const iOS = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)
  return iOS ? 'ios' : 'other'
}

export default function InstallApp({ variant = 'nav' }: { variant?: 'nav' | 'card' }) {
  const [env, setEnv] = useState<Env | null>(null)
  const [prompt, setPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    setEnv(detect())
    const onPrompt = (e: Event) => { e.preventDefault(); setPrompt(e as BeforeInstallPromptEvent); setEnv('installable') }
    const onInstalled = () => { setPrompt(null); setEnv('installed'); setOpen(false) }
    window.addEventListener('beforeinstallprompt', onPrompt)
    window.addEventListener('appinstalled', onInstalled)
    return () => { window.removeEventListener('beforeinstallprompt', onPrompt); window.removeEventListener('appinstalled', onInstalled) }
  }, [])

  // 桌機 Firefox 等不支援安裝、又沒有提示可用時，導覽列就不佔位置
  if (!env || env === 'installed' || (env === 'other' && variant === 'nav')) return null

  const click = async () => {
    if (prompt) {
      await prompt.prompt()
      const { outcome } = await prompt.userChoice
      if (outcome === 'accepted') setEnv('installed')
      setPrompt(null)
      return
    }
    setOpen(true)
  }

  return (
    <>
      {variant === 'nav' ? (
        <button onClick={click} className="ml-auto shrink-0 rounded-lg bg-brand-50 px-3 py-1.5 text-sm font-medium text-brand-700 hover:bg-brand-100">📲 安裝 App</button>
      ) : (
        <div className="card flex flex-wrap items-center justify-between gap-3 p-4">
          <div>
            <div className="font-semibold">📲 把練功房加到主畫面</div>
            <div className="text-sm text-ink-soft">像 App 一樣全螢幕開啟、不用每次找網址。</div>
          </div>
          <button className="btn-primary" onClick={click}>{prompt ? '一鍵安裝' : '怎麼安裝？'}</button>
        </div>
      )}
      {open && <Guide env={env} onClose={() => setOpen(false)} />}
    </>
  )
}

function Guide({ env, onClose }: { env: Env; onClose: () => void }) {
  const url = typeof window !== 'undefined' ? window.location.href : ''
  // LINE 內建瀏覽器支援 openExternalBrowser=1，直接跳到系統瀏覽器
  const external = url + (url.includes('?') ? '&' : '?') + 'openExternalBrowser=1'
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center" onClick={onClose}>
      <div className="card w-full max-w-sm space-y-3 p-5" onClick={e => e.stopPropagation()}>
        <h2 className="text-lg font-bold">加到主畫面</h2>
        {env === 'ios' && (
          <ol className="list-decimal space-y-2 pl-5 text-sm">
            <li>請用 <b>Safari</b> 開啟本頁（Chrome 等其他瀏覽器在 iPhone 上可能沒有此選項）</li>
            <li>點下方工具列的 <b>分享</b> 按鈕 <span className="inline-block rounded border px-1">⬆︎</span></li>
            <li>往下滑，選 <b>「加入主畫面」</b></li>
            <li>按右上角 <b>「新增」</b>，主畫面就會出現「練功房」圖示</li>
          </ol>
        )}
        {env === 'in-app' && (
          <div className="space-y-2 text-sm">
            <p>你現在在 LINE／Facebook 的內建瀏覽器裡，這裡沒辦法安裝。</p>
            <a href={external} className="btn-primary w-full">用手機瀏覽器開啟</a>
            <p className="text-xs text-ink-muted">若沒有反應：點右上角「⋯」→「用預設瀏覽器開啟」，再按「安裝 App」。</p>
          </div>
        )}
        {env !== 'ios' && env !== 'in-app' && (
          <ol className="list-decimal space-y-2 pl-5 text-sm">
            <li>Android：用 <b>Chrome</b> 開啟本頁，點右上角「⋮」→ <b>「安裝應用程式」</b>或<b>「加到主畫面」</b></li>
            <li>電腦：用 Chrome／Edge 開啟，網址列右側會有 <b>安裝</b> 圖示</li>
          </ol>
        )}
        <button className="btn-ghost w-full" onClick={onClose}>知道了</button>
      </div>
    </div>
  )
}
