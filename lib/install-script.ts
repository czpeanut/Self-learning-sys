// 放在 <head> 的內嵌腳本（伺服器端 layout 直接輸出，所以不能放在 'use client' 檔案）。
// Chrome 可能在 React 載入前就發出 beforeinstallprompt，先存到 window.__bip，
// components/InstallApp 掛上後再取用，避免錯過一鍵安裝的機會。
export const EARLY_CAPTURE_SCRIPT =
  "window.addEventListener('beforeinstallprompt',function(e){e.preventDefault();window.__bip=e;window.dispatchEvent(new Event('bip-ready'))});" +
  "window.addEventListener('appinstalled',function(){window.__bip=null});"
