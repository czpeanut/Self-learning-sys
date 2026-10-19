# 雲端帳號與紀錄（Supabase）

做法參照 czpeanut/student-app（CODEX STUDY）：**學生用館方發的「帳號＋密碼」登入，館方管理員用 Google 登入**。
學習紀錄存在雲端，換平板、換裝置都看得到。這是本系統**自己的 Supabase 專案**，不和 student-app 共用資料庫，也完全不需要動 student-app。

沒設定 Supabase 時，系統維持雛形的「裝置帳號」（姓名＋4 位數密碼、紀錄只在那台裝置），方便本機開發與試用。

## 身分

| 身分 | 登入方式 | 判斷 | 能做什麼 |
|---|---|---|---|
| 學生 | 帳號＋密碼（內部合成 email `<帳號>@student.local`） | `students` 表有這個帳號、沒被停用 | 全部學生功能；紀錄同步到雲端 |
| 管理員 | Google | `NEXT_PUBLIC_ADMIN_EMAILS` 白名單，或 `staff` 表 `role = 'admin'` | `/admin`：建立／批次建立學生帳號、重設密碼、停用、刪除、看近 7 天練習量 |
| 擋下 | — | 其他 Google 帳號、已停用的學生 | 只看到「沒有使用權限」 |

另有「後台老師」（`staff` 表 `role='teacher'`）：在後台出卷、看成績與成績單，不能管收費帳務、不能建立或刪除帳號——見 `docs/ERP.md`。館內仍是無人化，沒有現場老師。

## 設定步驟

1. **建立 Supabase 專案**（https://supabase.com → New project）。
2. **建資料表**：SQL Editor 貼上 `supabase/schema.sql` 全部內容執行（可重複執行）。
3. **Google 登入（管理員用）**：Authentication → Sign In / Providers → Google 開啟，填 Google Cloud 的 OAuth Client ID／Secret
   （Google Cloud Console 的「已授權的重新導向 URI」填 Supabase 頁面上顯示的 Callback URL）。
4. **導回網址**：Authentication → URL Configuration
   - Site URL：正式網址（例：`https://xxx.vercel.app`）
   - Redirect URLs：加上 `https://xxx.vercel.app/admin`（預覽網址也要用的話加 `https://*.vercel.app/admin`）、本機 `http://localhost:3000/admin`
5. **公開註冊**：學生帳號一律由管理員在 `/admin` 建立（不受這個設定影響）。管理員的 Google 帳號第一次登入時需要「建立使用者」，
   所以先保持 Authentication → Sign In / Providers →「Allow new users to sign up」開啟；等所有管理員都登入過一次後可以關掉。
   開著時就算有人自己註冊，也不在 `students` 表、不在白名單 → 只會看到「沒有使用權限」，RLS 也讓他讀不到任何紀錄。
6. **環境變數**（Vercel → Settings → Environment Variables，或本機 `.env.local`；**不要貼在對話裡、不要 commit**）：

   | 變數 | 從哪裡拿 |
   |---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | Project Settings → API → Project URL |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Project Settings → API → anon public key |
   | `SUPABASE_SERVICE_ROLE_KEY` | Project Settings → API → service_role key（只在伺服器用，絕對不能外流） |
   | `NEXT_PUBLIC_ADMIN_EMAILS` | 管理員的 Google email，逗號分隔 |

7. 重新部署（`NEXT_PUBLIC_*` 在建置時寫進前端，改了要重新部署）。
8. 管理員到 `/admin` 用 Google 登入 → 批次建立學生帳號（一行一位：`帳號,姓名,年級,密碼`，密碼可省略自動產生）→ 把帳號密碼發給學生。

## 紀錄怎麼同步（`lib/cloud-sync.ts`、`lib/sync-rows.ts`）

- 畫面一樣讀寫本機（localStorage），所以離線也能練習；本機是雲端紀錄的快取。
- 雲端 `student_store` 表：一位學生多列，**每次練習一列、每題錯題一列、每天到館紀錄一列、題庫作答每月一列**、每個知識點的掌握度一列……
  作答時只上傳有變的那幾列（寫入後 3 秒），不會每答一題就把整包紀錄重傳。
- 登入時下載雲端紀錄，和這台裝置的快取用「上次同步時的內容」做三方合併：
  另一台裝置新增的會下載、這台新增的會上傳、任一邊刪掉的兩邊都刪；兩台同時改同一次練習，取作答較多的那份。
- 登出（或閒置 20 分鐘自動登出）時先把未上傳的傳完，**再清掉這台裝置上的快取**（共用平板不留紀錄給下一位）。
  沒網路傳不上去時會保留在裝置上，下次登入自動補傳。
- 平板放到隔天、上一位沒登出：開啟時超過閒置時間就先自動登出。
- 右上角 ☁️＝已同步、⏳＝同步中、⚠️＝連不上雲端（紀錄先存在裝置）。

## 安全

- 學生密碼由 Supabase Auth 以 bcrypt 雜湊保存，系統不存明文；管理員建立帳號時密碼只顯示一次。
- `student_store`、`students` 開啟 RLS：學生只能讀寫自己的列，被停用的學生連自己的列也讀寫不了。
  `staff` 表沒有任何前端政策。帳號的新增、修改、刪除只透過伺服器 API（service role），且每次都驗證管理員身分。
- 雲端模式下，AI 出題（`/api/generate`）、AI 詳解（`/api/solve`）、AI 評語（`/api/report`）都要登入才能用，避免 AI 額度被外人消耗。
  整站通行碼 `SITE_ACCESS_CODE` 仍可另外搭配使用。

## 之後可以做

- **家長帳號**：家長用自己的帳號看孩子的日報（資料已在雲端，`student_store` 加一條「家長可讀綁定孩子的列」的 RLS 即可）、LINE 推播。
- **舊的裝置帳號紀錄搬到雲端帳號**：目前可用「學習歷程 → 備份／還原」手動搬。
- 若要和 CODEX STUDY 共用學生帳號，需要兩個系統用同一個 Supabase 專案——這會動到 student-app 的資料庫，要另外決定。
