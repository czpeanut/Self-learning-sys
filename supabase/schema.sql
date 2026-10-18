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

-- ── 館方管理員（除了環境變數 NEXT_PUBLIC_ADMIN_EMAILS 白名單外，也可以加在這裡，不用重新部署） ──
create table if not exists staff (
  email        text primary key check (email = lower(email)),
  role         text not null check (role in ('admin')),
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
