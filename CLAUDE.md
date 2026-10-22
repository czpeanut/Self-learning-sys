# CLAUDE.md — 自習練功房

國中生自習系統（部署於**無人化**智慧 K書中心，館內沒有老師，學生卡住時由 AI 講解）：選範圍 → 自適應多波練習 → 學習報告；另有到館簽到／番茄鐘（`/study`）、家長日報（`/parent`，邏輯在 `lib/daily-report.ts`）。規劃文件在 `docs/PLAN.md`，先讀它。

## 重點
- 技術棧：Next.js 14 App Router + TypeScript + Tailwind（與 student-app 一致）
- 視覺「霓虹方塊」（設計稿 G 淺色版）：市售學習 App 的版面與漸層（主色漸層區塊 `.hero-band`＋`HeroDecor`、彩色漸層功能入口 `.tile t-<顏色>`、白色卡片、浮起的手機底部導航＋菱形「開始自習」主鈕），加上計分板的稜角——**一律方框、不用圓角**（Tailwind 圓角類別都是 0，只留 rounded-full 給圓點），實心色塊右上角斜切 `.cut`／`.cut-sm`／`.cut-lg`（有邊框的方框不要切，會斷線），`.card`／`.stat` 右上角有漸層三角角標（`.leaf*` 是舊名，現在也是直角）。品牌漸層 `--brand-grad`（黃綠→薄荷→天藍），白底上的文字用 `brand-500`／`.grad-text`。平板／桌機是左側直欄（`--rail` 92px），手機是頂部身分列＋底部導航，由 `components/Shell.tsx` 決定（作答中、後台不顯示）。共用元件在 `components/brand.tsx`（`BrandMark`、`Icon`、`Tile`、`Entry`、`Gauge` 放射刻度環、`HexBadge`）。`.t-*` 顏色類別放在 `@layer` 外，因為類別名稱是程式組出來的；樣式集中在 `app/globals.css`，不要從 student-app 複製 `industry.css`
- 介面文字要短：標題＋必要數字即可，不要加解釋性長句（例：「這題是段考原題，沒有附詳解…」「答案經 AI 交叉驗證」這類都不要）
- **首頁練習狀況**（`components/PracticeStatus.tsx`，做法同 Prac-sys 練習進度）：有題庫的科目（`BANK_SUBJECTS`）依冊列出題庫**所有**單元與題型（含沒練過的），量化成已熟練／還沒練幾個，點題型或單元直接開練；沒有題庫的科目改用 taxonomy 知識點（AI 出題）。熟練規則與段考準備度共用 `lib/readiness.ts`
- `lib/taxonomy.ts` 是 **czpeanut/student-app 的快照**，不要單邊修改知識點名稱；student-app 更新時整份重新複製
- student-app 只作參考，不要修改那個 repo
- 引擎（`lib/engine.ts`）、報告（`lib/report.ts`）是純函式；改邏輯後跑 `npm test`
- 資料層：畫面一律讀寫 `lib/storage.ts`（localStorage）；設定 Supabase 後由 `lib/cloud-sync.ts` 同步到雲端 `student_store`（拆列與三方合併在 `lib/sync-rows.ts`，純函式）。新增要同步的 storage key 必須加進 `SYNC_KEYS` 並定義拆列方式
- 出題：`lib/question-gen.ts`，順序為 程式產生器 → Gemini；**不出示範題**（沒有 AI 時只能選有產生器的「免AI」知識點，其他數學題型用題庫）
- **AI 解題沿用 student-app 模組，不要自己改寫**：`lib/gemini.ts`、`components/SolutionView.tsx`、`components/GeometryFigure.tsx`、`components/MathText.tsx` 是逐字快照；`lib/solve.ts` 的提示詞由 student-app `app/api/solve/route.ts` 程式擷取。student-app 更新時整份重新同步
- 問 AI 介面：`components/AskAI.tsx` → `/api/solve`（action: solve／followup）；追問提示詞在 `lib/tutor.ts`
- **段考衝刺**（`/exam`，說明在 `docs/EXAM.md`）：`lib/exam.ts`（日期推算、主流範圍）、`lib/readiness.ts`（準備度，純函式）、`lib/pool.ts`（題目池，server）
- **學習習慣**（`/habits`，說明在 `docs/LEARNING-PROFILE.md`）：`lib/learning-profile.ts`（純函式，指標門檻都有研究出處，改了要同步更新文件）、`lib/profile-data.ts`（從 storage 組資料）；冷靜作答在 `app/practice/session/page.tsx`。用語只描述作答方式，不給人格／能力標籤
- **弱項特訓**（`/drill`）：`lib/drill.ts`（純函式：選題型、每波計畫、達標判定）；session `mode: 'drill'`，`PlanItem.retry` 的錯題本原題由 `lib/session-client.ts` 從本機取、不經 API
- **今日成果報告**（`/today`，學生版）：`lib/day-result.ts`（純函式）；家長版仍是 `lib/daily-report.ts`
- **OLE-QS、Prac-sys、student-app 都只讀、絕對不要修改或推送**
- 題庫資料：`node scripts/build-bank.mjs` 讀 OLE-QS 官方匯出檔（`data/export/`，見 OLE-QS `docs/USING_THE_BANK.md`）產生 `data/pool/`（**不進版控**）與 `lib/data/exam-scopes.json`（只有統計，進版控）；`npm run build` 會自動先建置
- `data/pool/`、`.cache/` 已 gitignore（建置時產生），不要 commit；整站通行碼 `SITE_ACCESS_CODE`（`middleware.ts`）為選用
- 發現題庫題有錯：記下題目 id 告訴使用者，不要改 OLE-QS
- 題庫題每題必須顯示出處（`Question.cite`，OLE-QS 授權條件，不可拿掉）
- 登入（說明在 `docs/AUTH.md`，做法同 student-app）：有設 Supabase → `components/CloudGate.tsx`（學生帳密＝合成 email `@student.local`、管理員 Google＋白名單、`/admin` 管理帳號、`/api/admin/students`）；沒設 → `lib/accounts.ts` 裝置帳號。`lib/storage.ts` 依 `currentUser()` 切換命名空間；資料表 `supabase/schema.sql`
- 雲端模式下 AI 相關 API 要登入（`lib/server-auth.ts` 的 `requireLogin`），前端呼叫要用 `authFetch`（`lib/supabase.ts`）
- 不要加回任何「現場老師」功能（問老師、巡堂等）——館內是無人化的；「後台老師」（staff role=teacher）只在 `/admin` 出卷、看成績
- **館方後台 ERP**（`/admin`，說明在 `docs/ERP.md`，只在雲端模式）：總覽 `lib/erp-stats.ts`、程度檢測 `lib/placement.ts`（出卷／批改，純函式；答案只在伺服器，學生端 `/tests`）、收費帳務 `lib/billing.ts`（純函式，只有 admin）、成績單 `/admin/report-card`；API 一律 `getStaffUser`／`getAdminUser`／`getStudentUser` 驗證
- **家長通知**：`lib/notify.ts`（LINE Messaging API push＋Resend Email，每則寫 `notifications`）；簽到／簽退 `/api/attendance`；LINE 綁定 `/api/line/webhook`（驗簽章）。LINE Notify 已停用，不要用
- 伺服器端 Supabase client 要用 `lib/server-auth.ts` 的 `createServiceClient`（fetch 設 no-store，否則 Next.js 會快取查詢結果）
- 新增離線產生器：在 `lib/generators.ts` 的 `GENERATORS` 加上 key（必須是 taxonomy 中的數學知識點名稱），`npm test` 會自動檢查 300×3 題

## 驗證
- `npx tsc --noEmit`、`npx next lint`、`npm test`、`npm run build`
- Vercel build 會跑 ESLint，未使用的 import/變數會讓 build 失敗
