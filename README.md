# 自習練功房（Self-learning-sys）

國中生自主學習系統雛形，設計給**智慧 K書中心**使用：到館簽到、番茄鐘專注、自適應練習、問老師、家長日報。

學生自己選練習範圍，系統出一波題目，**依錯題狀況產生下一波**，結束後產出**學習狀況評估報告**。

知識點目錄沿用 [student-app](https://github.com/czpeanut/student-app) 的 `lib/taxonomy.ts`（9 科：科目 → 大單元 → 知識點）。

完整規劃（功能清單、引擎設計、第二階段）見 **[docs/PLAN.md](docs/PLAN.md)**。

## 快速開始

```bash
npm install
cp .env.example .env.local   # 可選：填 GEMINI_API_KEY 才能讓所有科目出 AI 題
npm run dev                  # http://localhost:3000
```

**不設 API Key 也能完整體驗**：27 個數學計算型知識點（整數運算、方程式、畢氏定理、乘法公式、數列、機率、統計…）
由程式出題，答案保證正確；其他知識點會出清楚標示的「示範題」，只用來體驗流程。

## 指令

| 指令 | 說明 |
|---|---|
| `npm run dev` | 開發伺服器 |
| `npm run build` | 正式建置（含 ESLint＋型別檢查） |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | 引擎與離線出題器自我檢測（24,300 題結構檢查＋模擬學生多波練習） |

## 部署（Vercel）

匯入此 repo 後設定環境變數 `GEMINI_API_KEY`（及可選的 `GEMINI_MODEL`）即可。雛形沒有資料庫，資料存在學生瀏覽器。
