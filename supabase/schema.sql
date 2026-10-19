-- 自習練功房：雲端帳號與學習紀錄（在 Supabase → SQL Editor 執行一次；可重複執行）
-- 說明見 docs/AUTH.md。這是本系統自己的 Supabase 專案，不和 student-app 共用、也不需要動 student-app 的資料庫。
--
-- 帳號：Supabase Auth。學生用「帳號＋密碼」（內部合成 email：<帳號>@student.local），館方管理員用 Google。
-- 紀錄：student_store，一位學生多列（key＝紀錄種類/編號，value＝JSON），前端直接讀寫自己的列（RLS 限本人）。

-- ── 學生檔案（館方在 /admin 建立） ──
create table if not exists students (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null unique references auth.users(id) on delete cascade,
  username     text not null unique check (username ~ '^[a-z0-9._-]{3,30}$'),
  display_name text not null,
  grade        text,
  disabled     boolean not null default false,
  created_at   timestamptz not null default now()
);
alter table students enable row level security;
drop policy if exists "學生讀自己的檔案" on students;
create policy "學生讀自己的檔案" on students for select using (user_id = auth.uid());
-- 新增／修改／刪除只透過伺服器（service role，/api/admin/students），沒有開放給前端的寫入政策

-- ── 館方人員（Google 登入）：admin＝全部功能（含收費帳務）；teacher＝學生、檢測、成績單（後台老師，不是現場老師）
--    環境變數 NEXT_PUBLIC_ADMIN_EMAILS 白名單一律是 admin；其他人員加在這裡，不用重新部署 ──
create table if not exists staff (
  email        text primary key check (email = lower(email)),
  role         text not null check (role in ('admin', 'teacher')),
  display_name text,
  created_at   timestamptz not null default now()
);
alter table staff enable row level security;   -- 沒有任何政策：只有伺服器讀得到

-- ── 學習紀錄（lib/cloud-sync.ts、lib/sync-rows.ts） ──
-- key 例：profile、exam、activity、mastery/<知識點>、sessions/<練習 id>、wrongbook/<題目 id>、asks/<題目 id>、studydays/<日期>、attempts/<年-月>
create table if not exists student_store (
  user_id    uuid not null references auth.users(id) on delete cascade,
  key        text not null,
  value      jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, key)
);
create index if not exists student_store_key on student_store (key);
alter table student_store enable row level security;
drop policy if exists "學生讀寫自己的紀錄" on student_store;
create policy "學生讀寫自己的紀錄" on student_store for all
  using (user_id = auth.uid() and exists (select 1 from students s where s.user_id = auth.uid() and not s.disabled))
  with check (user_id = auth.uid() and exists (select 1 from students s where s.user_id = auth.uid() and not s.disabled));

create or replace function touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;
drop trigger if exists student_store_touch on student_store;
create trigger student_store_touch before update on student_store for each row execute function touch_updated_at();

-- 既有專案升級：staff 角色加入 teacher
alter table staff drop constraint if exists staff_role_check;
alter table staff add constraint staff_role_check check (role in ('admin', 'teacher'));

-- ══════════════════════════ ERP（docs/ERP.md） ══════════════════════════
-- 以下資料表都只透過伺服器 API（service role）讀寫，每次驗證館方人員身分；沒有開放任何前端政策。

-- ── 收費方案 ──
create table if not exists plans (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  price       integer not null check (price >= 0),        -- 新台幣（元）
  cycle       text not null default 'monthly' check (cycle in ('monthly', 'once')),
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);
alter table plans enable row level security;

alter table students add column if not exists plan_id uuid references plans(id) on delete set null;
alter table students add column if not exists school text;
alter table students add column if not exists note text;

-- ── 家長（聯絡人）與通知設定 ──
create table if not exists guardians (
  id            uuid primary key default gen_random_uuid(),
  student_id    uuid not null references students(id) on delete cascade,
  name          text not null,
  relation      text,                                     -- 媽媽、爸爸…
  email         text,
  phone         text,
  line_user_id  text,                                     -- 家長加 LINE 官方帳號並輸入綁定碼後寫入
  link_code     text unique,                              -- LINE 綁定碼（6 位數）
  notify_attendance boolean not null default true,        -- 到館／離館通知
  notify_reports    boolean not null default true,        -- 檢測成績、繳費通知
  created_at    timestamptz not null default now()
);
create index if not exists guardians_student on guardians (student_id);
alter table guardians enable row level security;

-- ── 到館紀錄（學生簽到／簽退時由 /api/attendance 寫入並通知家長） ──
create table if not exists attendance (
  id            uuid primary key default gen_random_uuid(),
  student_id    uuid not null references students(id) on delete cascade,
  date          date not null,
  check_in_at   timestamptz not null,
  check_out_at  timestamptz,
  seat          text,
  summary       jsonb,                                    -- 簽退時：專注分鐘、練習題數、正確率、心情
  unique (student_id, date)
);
create index if not exists attendance_date on attendance (date);
alter table attendance enable row level security;

-- ── 程度檢測 ──
create table if not exists tests (
  id            uuid primary key default gen_random_uuid(),
  title         text not null,
  subject       text not null,
  book          text not null,                            -- 7-1…
  units         jsonb not null,                           -- 單元代號
  questions     jsonb not null,                           -- 題目快照（含答案；只在伺服器讀）
  time_limit_min integer not null default 40,
  created_by    text,
  created_at    timestamptz not null default now()
);
alter table tests enable row level security;

create table if not exists test_assignments (
  id            uuid primary key default gen_random_uuid(),
  test_id       uuid not null references tests(id) on delete cascade,
  student_id    uuid not null references students(id) on delete cascade,
  status        text not null default 'assigned' check (status in ('assigned', 'started', 'submitted')),
  assigned_at   timestamptz not null default now(),
  due_date      date,
  started_at    timestamptz,
  submitted_at  timestamptz,
  answers       jsonb,                                    -- 題號 → 選項 index（null＝沒作答）
  score         real,                                     -- 0–100
  result        jsonb,                                    -- lib/placement.ts gradeTest 的結果
  unique (test_id, student_id)
);
create index if not exists test_assignments_student on test_assignments (student_id);
alter table test_assignments enable row level security;

-- ── 收費與帳務 ──
create table if not exists invoices (
  id          uuid primary key default gen_random_uuid(),
  student_id  uuid not null references students(id) on delete cascade,
  plan_id     uuid references plans(id) on delete set null,
  title       text not null,
  period      text,                                       -- 'YYYY-MM'（月費）；一次性為 null
  amount      integer not null check (amount >= 0),
  discount    integer not null default 0 check (discount >= 0),
  due_date    date,
  status      text not null default 'unpaid' check (status in ('unpaid', 'paid', 'void')),
  note        text,
  created_at  timestamptz not null default now(),
  unique (student_id, plan_id, period)
);
create index if not exists invoices_period on invoices (period);
alter table invoices enable row level security;

create table if not exists payments (
  id          uuid primary key default gen_random_uuid(),
  invoice_id  uuid references invoices(id) on delete set null,
  student_id  uuid not null references students(id) on delete cascade,
  amount      integer not null check (amount > 0),
  method      text not null check (method in ('cash', 'transfer', 'card', 'linepay', 'other')),
  paid_at     date not null default current_date,
  received_by text,
  note        text,
  created_at  timestamptz not null default now()
);
create index if not exists payments_paid_at on payments (paid_at);
alter table payments enable row level security;

-- 其他收入／支出（房租、水電、耗材…），月報表算淨額用
create table if not exists ledger (
  id          uuid primary key default gen_random_uuid(),
  date        date not null default current_date,
  kind        text not null check (kind in ('income', 'expense')),
  category    text not null,
  amount      integer not null check (amount > 0),
  note        text,
  created_by  text,
  created_at  timestamptz not null default now()
);
create index if not exists ledger_date on ledger (date);
alter table ledger enable row level security;

-- ── 家長通知紀錄 ──
create table if not exists notifications (
  id          bigserial primary key,
  student_id  uuid references students(id) on delete cascade,
  guardian_id uuid references guardians(id) on delete set null,
  channel     text not null check (channel in ('line', 'email')),
  kind        text not null,                              -- checkin、checkout、test、invoice、test-message
  status      text not null check (status in ('sent', 'failed', 'skipped')),
  detail      text,
  created_at  timestamptz not null default now()
);
create index if not exists notifications_created on notifications (created_at desc);
alter table notifications enable row level security;
