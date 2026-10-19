import type { MetadataRoute } from 'next'

// PWA 設定：讓瀏覽器把網站當成 App 安裝（加到主畫面、全螢幕開啟、有自己的圖示）
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/',
    name: '自習練功房',
    short_name: '練功房',
    description: '國中生自主學習：選範圍 → 自適應多波練習 → 學習報告；K書模式、問 AI、家長日報',
    lang: 'zh-TW',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'any',
    background_color: '#f3f3ef',
    theme_color: '#2b6f62',
    categories: ['education'],
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
    shortcuts: [
      { name: 'K書模式', url: '/study', icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }] },
      { name: '開始自習', url: '/practice/new', icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }] },
      { name: '家長日報', url: '/parent', icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }] },
    ],
  }
}
