// 自習練功房 Service Worker
// 目的：讓「加到主畫面」的 App 開得快、網路不穩時仍打得開畫面。
// 原則：
//   - /api/* 一律不經過快取（出題、AI 詳解都要即時，且不能回舊資料）
//   - /_next/static/*、/icons/*：檔名帶版本 → 快取優先
//   - 頁面（導覽）：網路優先，斷線時退回上次快取的頁面
// 改版時調整 VERSION，舊快取會在 activate 時清掉。
const VERSION = 'v2'   // 改版（新視覺、新圖示）時加一，舊快取會被清掉
const STATIC_CACHE = `static-${VERSION}`
const PAGE_CACHE = `pages-${VERSION}`
const PRECACHE = ['/', '/study', '/practice/new', '/wrong-book', '/progress', '/parent', '/icons/icon-192.png']

self.addEventListener('install', event => {
  event.waitUntil(caches.open(PAGE_CACHE).then(c => c.addAll(PRECACHE)).catch(() => {}))
  self.skipWaiting()
})

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => ![STATIC_CACHE, PAGE_CACHE].includes(k)).map(k => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', event => {
  const req = event.request
  const url = new URL(req.url)
  if (req.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return

  if (url.pathname.startsWith('/_next/static/') || url.pathname.startsWith('/icons/')) {
    event.respondWith(
      caches.match(req).then(hit => hit || fetch(req).then(res => {
        if (res.ok) { const copy = res.clone(); caches.open(STATIC_CACHE).then(c => c.put(req, copy)) }
        return res
      })),
    )
    return
  }

  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req).then(res => {
        if (res.ok) { const copy = res.clone(); caches.open(PAGE_CACHE).then(c => c.put(url.pathname, copy)) }
        return res
      }).catch(() => caches.match(url.pathname).then(hit => hit || caches.match('/'))),
    )
  }
})
