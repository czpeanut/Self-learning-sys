'use client'

// 「安裝 App／加到主畫面」
//  - Android／Chrome／Edge：攔下 beforeinstallprompt，按一下就跳出系統安裝視窗
//  - iPhone／iPad（Safari）：蘋果不提供安裝 API，只能顯示「分享 → 加入主畫面」圖解
//  - LINE／Facebook／IG 內建瀏覽器：無法安裝，引導改用系統瀏覽器開啟（家長常從 LINE 點連結進來）
//  - 已經是安裝後的 App（standalone）就不顯示
//
// 瀏覽器規定：系統安裝視窗一定要由使用者「點一下」才能叫出來（prompt() 需要使用者手勢），
// 所以「主動跳窗」= 我們自己的視窗自動出現 → 學生點一下「一鍵安裝」→ 系統安裝視窗。

import { useCallback, useEffect, useState } from 'react'

type BeforeInstallPromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> }
type Env = 'installable' | 'ios' | 'in-app' | 'other' | 'installed'
declare global { interface Window { __bip?: BeforeInstallPromptEvent | null } }

function detect(): Env {
  const nav = navigator as Navigator & { standalone?: boolean }
  if (window.matchMedia('(display-mode: standalone)').matches || nav.standalone) return 'installed'
  if (window.__bip) return 'installable'
  const ua = navigator.userAgent
  if (/Line\/|FBAN|FBAV|Instagram/i.test(ua)) return 'in-app'
  const iOS = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)
  return iOS ? 'ios' : 'other'
}

/** 共用的安裝狀態：env 目前環境；install() 叫出系統安裝視窗（只在 installable 時有效） */
function useInstall() {
  const [env, setEnv] = useState<Env | null>(null)
  useEffect(() => {
    setEnv(detect())
    const refresh = () => setEnv(detect())
    const onInstalled = () => setEnv('installed')
    window.addEventListener('bip-ready', refresh)
    window.addEventListener('appinstalled', onInstalled)
    return () => { window.removeEventListener('bip-ready', refresh); window.removeEventListener('appinstalled', onInstalled) }
  }, [])
  const install = useCallback(async (): Promise<boolean> => {
    const e = window.__bip
    if (!e) return false
    await e.prompt()
    const { outcome } = await e.userChoice
    window.__bip = null                       // 同一個事件只能用一次
    setEnv(outcome === 'accepted' ? 'installed' : detect())
    return outcome === 'accepted'
  }, [])
  return { env, install }
}

// ── 手動入口：導覽列按鈕／頁面卡片 ──────────────────────────────
export default function InstallApp({ variant = 'nav' }: { variant?: 'nav' | 'rail' | 'card' }) {
  const { env, install } = useInstall()
  const [open, setOpen] = useState(false)

  // 桌機 Firefox 等不支援安裝的環境，導覽列就不佔位置
  if (!env || env === 'installed' || (env === 'other' && variant !== 'card')) return null

  const click = async () => { if (env === 'installable') await install(); else setOpen(true) }

  return (
    <>
      {variant === 'rail' ? (
        <button onClick={click} title="安裝 App" className="flex flex-col items-center gap-0.5 leaf-sm px-2 py-1.5 text-[10px] font-medium text-brand-700 hover:bg-brand-50"><span className="text-lg leading-none">📲</span>安裝</button>
      ) : variant === 'nav' ? (
        <button onClick={click} className="shrink-0 leaf-sm bg-brand-50 px-3 py-1.5 text-sm font-medium text-brand-700 hover:bg-brand-100">📲 安裝 App</button>
      ) : (
        <div className="card flex flex-wrap items-center justify-between gap-3 p-4">
          <div>
            <div className="font-semibold">📲 把練功房加到主畫面</div>
            <div className="text-sm text-ink-soft">全螢幕開啟，不用找網址</div>
          </div>
          <button className="btn-primary" onClick={click}>{env === 'installable' ? '一鍵安裝' : '怎麼安裝？'}</button>
        </div>
      )}
      {open && (
        <Sheet onClose={() => setOpen(false)}>
          <h2 className="text-lg font-bold">加到主畫面</h2>
          <Steps env={env} />
          <button className="btn-ghost w-full" onClick={() => setOpen(false)}>知道了</button>
        </Sheet>
      )}
    </>
  )
}

// ── 主動跳窗：進站幾秒後自動出現 ─────────────────────────────────
const SNOOZE_KEY = 'sls:install-snooze'   // 裝置層級（不分學生）
const SNOOZE_DAYS = 3
const DELAY_MS = 4000

/** 不打擾的頁面：作答中、列印頁 */
const QUIET = ['/practice/session']

export function InstallPopup() {
  const { env, install } = useInstall()
  const [show, setShow] = useState(false)

  useEffect(() => {
    if (!env || env === 'installed' || env === 'other') return
    if (QUIET.some(p => window.location.pathname.startsWith(p))) return
    try {
      const until = Number(localStorage.getItem(SNOOZE_KEY) ?? 0)
      if (until && Date.now() < until) return
    } catch { /* 無法讀取就照常顯示 */ }
    const t = setTimeout(() => setShow(true), DELAY_MS)
    return () => clearTimeout(t)
  }, [env])

  if (!show || !env || env === 'installed' || env === 'other') return null

  const snooze = (days: number) => {
    try { localStorage.setItem(SNOOZE_KEY, String(Date.now() + days * 86400000)) } catch { /* 忽略 */ }
    setShow(false)
  }

  return (
    <Sheet onClose={() => snooze(SNOOZE_DAYS)}>
      <div className="flex items-center gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/icons/icon-192.png" alt="" className="h-14 w-14 leaf" />
        <div>
          <div className="text-lg font-bold">安裝「練功房」App</div>
          <div className="text-sm text-ink-soft">加到主畫面，下次一點就開、全螢幕更專心</div>
        </div>
      </div>
      {env === 'installable' ? (
        <button className="btn-primary w-full py-3 text-base" onClick={async () => { if (await install()) setShow(false); else snooze(SNOOZE_DAYS) }}>
          一鍵安裝
        </button>
      ) : (
        <Steps env={env} />
      )}
      <div className="flex justify-between text-sm">
        <button className="text-ink-soft hover:underline" onClick={() => snooze(SNOOZE_DAYS)}>以後再說</button>
        <button className="text-ink-muted hover:underline" onClick={() => snooze(3650)}>不要再提醒</button>
      </div>
    </Sheet>
  )
}

// ── 共用 UI ─────────────────────────────────────────────────────
function Sheet({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="no-print fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center" onClick={onClose}>
      <div role="dialog" aria-modal="true" className="card w-full max-w-sm space-y-4 p-5" onClick={e => e.stopPropagation()}>
        {children}
      </div>
    </div>
  )
}

function Steps({ env }: { env: Env }) {
  if (env === 'ios') {
    return (
      <ol className="list-decimal space-y-2 pl-5 text-sm">
        <li>請用 <b>Safari</b> 開啟本頁（iPhone 上其他瀏覽器可能沒有此選項）</li>
        <li>點下方工具列的 <b>分享</b> 按鈕 <span className="inline-block rounded border px-1">⬆︎</span></li>
        <li>往下滑，選 <b>「加入主畫面」</b></li>
        <li>按右上角 <b>「新增」</b>，主畫面就會出現「練功房」圖示</li>
      </ol>
    )
  }
  if (env === 'in-app') {
    const url = window.location.href
    // LINE 內建瀏覽器支援 openExternalBrowser=1，直接跳到系統瀏覽器
    const external = url + (url.includes('?') ? '&' : '?') + 'openExternalBrowser=1'
    return (
      <div className="space-y-2 text-sm">
        <p>內建瀏覽器無法安裝</p>
        <a href={external} className="btn-primary w-full">用手機瀏覽器開啟</a>
        <p className="text-xs text-ink-muted">沒反應就點右上角「⋯」→「用預設瀏覽器開啟」</p>
      </div>
    )
  }
  return (
    <ol className="list-decimal space-y-2 pl-5 text-sm">
      <li>Android：用 <b>Chrome</b> 開啟本頁，點右上角「⋮」→ <b>「安裝應用程式」</b>或<b>「加到主畫面」</b></li>
      <li>電腦：用 Chrome／Edge 開啟，網址列右側會有 <b>安裝</b> 圖示</li>
    </ol>
  )
}
