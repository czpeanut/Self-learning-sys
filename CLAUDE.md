# CLAUDE.md — 自習練功房

國中生自習系統（部署於**無人化**智慧 K書中心，館內沒有老師，學生卡住時由 AI 講解）：選範圍 → 自適應多波練習 → 學習報告；另有到館簽到／番茄鐘（`/study`）、家長日報（`/parent`，邏輯在 `lib/daily-report.ts`）。規劃文件在 `docs/PLAN.md`，先讀它。

## 重點
- 技術棧：Next.js 14 App Router + TypeScript + Tailwind（與 student-app 一致）
- `lib/taxonomy.ts` 是 **czpeanut/student-app 的快照**，不要單邊修改知識點名稱；student-app 更新時整份重新複製
- student-app 只作參考，不要修改那個 repo
- 引擎（`lib/engine.ts`）、報告（`lib/report.ts`）是純函式；改邏輯後跑 `npm test`
- 資料層目前是 localStorage，全部集中在 `lib/storage.ts`；第二階段換 Supabase（草稿 `supabase/schema.sql`）
- 出題：`lib/question-gen.ts`，順序為 程式產生器 → Gemini → 示範題
- **AI 解題沿用 student-app 模組，不要自己改寫**：`lib/gemini.ts`、`components/SolutionView.tsx`、`components/GeometryFigure.tsx`、`components/MathText.tsx` 是逐字快照；`lib/solve.ts` 的提示詞由 student-app `app/api/solve/route.ts` 程式擷取。student-app 更新時整份重新同步
- 問 AI 介面：`components/AskAI.tsx` → `/api/solve`（action: solve／followup）；追問提示詞在 `lib/tutor.ts`
- 不要加回任何「現場老師」功能（問老師、巡堂等）——館內是無人化的
- 新增離線產生器：在 `lib/generators.ts` 的 `GENERATORS` 加上 key（必須是 taxonomy 中的數學知識點名稱），`npm test` 會自動檢查 300×3 題

## 驗證
- `npx tsc --noEmit`、`npx next lint`、`npm test`、`npm run build`
- Vercel build 會跑 ESLint，未使用的 import/變數會讓 build 失敗
