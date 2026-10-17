# 自習練功房（Self-learning-sys）

國中生自主學習系統雛形，設計給**無人化智慧 K書中心**使用（館內沒有輔導老師）：到館簽到、番茄鐘專注、自適應練習、**問 AI**（沿用 student-app 的 Gemini 解題與幾何輔助圖模組）、家長日報。

學生自己選練習範圍，系統出一波題目，**依錯題狀況產生下一波**，結束後產出**學習狀況評估報告**。

知識點目錄沿用 [student-app](https://github.com/czpeanut/student-app) 的 `lib/taxonomy.ts`（9 科：科目 → 大單元 → 知識點）。

完整規劃（功能清單、引擎設計、第二階段）見 **[docs/PLAN.md](docs/PLAN.md)**。

**段考衝刺**（`/exam`）：選段考範圍（沒選就依日期推算、帶主流範圍）→ 列出所有題型 → 量化還缺什麼 → 用 OLE-QS 真實段考題練習，見 **[docs/EXAM.md](docs/EXAM.md)**。

## 快速開始

```bash
npm install
cp .env.example .env.local   # 填 GEMINI_API_KEY：AI 出題、AI 詳解（問 AI）都需要
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
| `npm test` | 引擎、出題器、家長日報、段考推算與準備度的自我檢測 |
| `python3 scripts/build_exam_scopes.py <OLE-QS>` | 重新統計主流段考範圍（OLE-QS 唯讀） |
| `python3 scripts/build_exam_pool.py <OLE-QS>` | 重建數學題目池與題型目錄（OLE-QS 唯讀） |

## 部署（Vercel）

匯入此 repo 後設定環境變數 `GEMINI_API_KEY`（及可選的 `GEMINI_MODEL`）即可。雛形沒有資料庫，資料存在學生瀏覽器。

## 安裝成 App

已是 PWA：部署後在手機／平板點「📲 安裝 App」即可加到主畫面（iPhone 會顯示圖解）。上架商店與館內平板鎖定見 [docs/APP.md](docs/APP.md)。
