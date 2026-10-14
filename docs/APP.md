# 打包成 App

## 現在：PWA（已完成，部署後即可用）

網站本身就是可安裝的 App（PWA）。部署到 Vercel 後，用手機或平板開啟網址即可安裝：

| 裝置 | 安裝方式 |
|---|---|
| Android（Chrome）、電腦（Chrome／Edge） | 導覽列「📲 安裝 App」或首頁卡片 → **一鍵跳出系統安裝視窗** |
| iPhone／iPad（Safari） | 蘋果不開放一鍵安裝 → 按鈕會顯示圖解：分享 → 加入主畫面 → 新增 |
| LINE／FB／IG 內建瀏覽器 | 無法安裝 → 按鈕引導用系統瀏覽器開啟（LINE 帶 `openExternalBrowser=1`） |

### 主動跳窗

進站 4 秒後自動跳出「安裝練功房 App」視窗（作答中不打擾）：
- Android／電腦：視窗上的「一鍵安裝」→ 系統安裝視窗 → 完成。**瀏覽器規定系統安裝視窗必須由使用者點擊叫出，無法零點擊自動安裝**，所以最少是「點一下」。
- iPhone／iPad：蘋果沒有安裝 API，視窗直接顯示「分享 → 加入主畫面」步驟。
- LINE／FB 內建瀏覽器：視窗引導改用系統瀏覽器開啟。
- 「以後再說」3 天內不再跳出；「不要再提醒」就不再出現（存在該裝置的瀏覽器）。
- Chrome 可能在頁面載入前就送出安裝事件，`lib/install-script.ts` 的內嵌腳本會先接住，避免錯過。
- Chrome 有自己的判斷：已安裝過、或使用者最近拒絕過，就不會再給安裝機會，此時視窗不會出現一鍵安裝。

已實作：
- `app/manifest.ts`：名稱、圖示（含 Android 自適應 maskable）、全螢幕 standalone、主題色、長按圖示的捷徑（K書模式／開始自習／家長日報）
- `public/sw.js`：靜態檔快取優先、頁面網路優先＋斷線退回快取；`/api/*` 一律不快取
- `components/InstallApp.tsx`：依裝置顯示一鍵安裝或圖解（導覽列按鈕、頁面卡片、主動跳窗 `InstallPopup`）；已安裝就隱藏
- 圖示：`public/icons/`（`icon.svg` 為原稿，PNG 由它產生）

需要 **HTTPS**（Vercel 預設就是）才能安裝；`localhost` 也可以測試。
改版時把 `public/sw.js` 的 `VERSION` 加一，舊快取會自動清掉。

## 館內平板（無人館建議做法）

1. 用 Chrome 安裝 PWA。
2. 鎖定只能用這個 App：
   - **Android**：設定 → 安全性 →「螢幕固定」，或用 Kiosk 管理軟體（MDM），開機自動開啟、鎖住其他 App
   - **iPad**：設定 → 輔助使用 →「引導使用模式」，或 Apple Business Manager 的單一 App 模式
3. 正式版加上帳號後，記得設閒置自動登出（無人館的共用裝置）。

## 之後要上架商店的話

| 目標 | 做法 | 備註 |
|---|---|---|
| Google Play | 用 **Bubblewrap**／**PWABuilder** 把 PWA 包成 TWA（Trusted Web Activity） | 幾乎不用改程式；需要在網站放 `/.well-known/assetlinks.json` 證明網站是你的；Play 開發者帳號一次性 US$25 |
| Apple App Store | 用 **Capacitor** 包成原生殼 | 蘋果審核（Guideline 4.2）常退「只是網頁包殼」的 App，通常要加原生功能（推播、相機拍題…）才容易過；Apple 開發者帳號 US$99／年 |

不論哪種，Gemini 金鑰都只放在伺服器（Vercel 環境變數），App 端呼叫 `/api/*`，**不能把金鑰打包進 App**。

建議順序：先用 PWA 上線（館內平板＋家長手機都夠用）→ 需要商店曝光再做 Google Play（TWA 成本最低）→ 最後才考慮 App Store。
