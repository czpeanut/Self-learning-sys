-- 自習練功房：第二階段資料表草稿（雛形目前存在 localStorage，尚未使用）
-- 預計與 student-app 共用同一個 Supabase 專案，students 表沿用 student-app 既有的。

-- 一次自習（對應 lib/types.ts 的 Session）
create table if not exists self_sessions (
  id            uuid primary key default gen_random_uuid(),
  student_id    uuid not null references students(id) on delete cascade,
  mode          text not null check (mode in ('practice', 'review')),
  subject       text not null,
  scope         jsonb not null,          -- KPRef[]
  settings      jsonb not null,          -- SessionSettings
  goal          text,
  status        text not null default 'active' check (status in ('active', 'finished')),
  end_reason    text check (end_reason in ('all-passed', 'max-rounds', 'user-ended')),
  mastery_before jsonb not null default '{}',
  mastery_after  jsonb,
  assigned_by   uuid,                    -- 老師指派的自習（staff.id），自選為 null
  created_at    timestamptz not null default now(),
  finished_at   timestamptz
);
create index on self_sessions (student_id, created_at desc);

-- 題庫（AI／產生器產生的題目；可跨學生重用並依作答統計校正難度）
create table if not exists question_bank (
  id            uuid primary key default gen_random_uuid(),
  subject       text not null,
  chapter       text not null,
  kp            text not null,
  difficulty    smallint not null check (difficulty between 1 and 3),
  stem          text not null,
  options       jsonb not null,          -- string[4]
  answer_index  smallint not null,
  explanation   text not null,
  hint          text,
  source        text not null,           -- ai | generator | student-app
  model         text,
  times_answered int not null default 0,
  times_correct  int not null default 0,
  flagged       boolean not null default false,  -- 學生回報題目有誤
  created_at    timestamptz not null default now()
);
create index on question_bank (subject, chapter, kp, difficulty);

-- 每一題作答
create table if not exists self_answers (
  id            bigserial primary key,
  session_id    uuid not null references self_sessions(id) on delete cascade,
  student_id    uuid not null references students(id) on delete cascade,
  round_index   smallint not null,
  question_id   uuid not null references question_bank(id),
  variant_of    uuid references question_bank(id),
  chosen        smallint,                -- null = 跳過
  correct       boolean not null,
  confidence    text not null check (confidence in ('sure', 'unsure', 'guess')),
  used_hint     boolean not null default false,
  time_ms       int not null,
  error_type    text check (error_type in ('concept', 'unfamiliar', 'careless', 'guess')),
  error_cause   text,
  created_at    timestamptz not null default now()
);
create index on self_answers (student_id, created_at desc);

-- 知識點掌握度（跨 session 累積）
create table if not exists kp_mastery (
  student_id    uuid not null references students(id) on delete cascade,
  subject       text not null,
  chapter       text not null,
  kp            text not null,
  score         real not null default 50,
  attempts      int not null default 0,
  correct       int not null default 0,
  recent        jsonb not null default '[]',
  last_practiced_at timestamptz,
  primary key (student_id, subject, chapter, kp)
);

-- 錯題複習排程（Leitner）
create table if not exists review_items (
  student_id    uuid not null references students(id) on delete cascade,
  question_id   uuid not null references question_bank(id),
  wrong_count   int not null default 1,
  last_answer   smallint,
  error_type    text,
  box           smallint not null default 0,
  next_review_at timestamptz not null,
  resolved      boolean not null default false,
  primary key (student_id, question_id)
);
create index on review_items (student_id, resolved, next_review_at);

-- RLS：學生只能讀寫自己的資料（老師端透過 service role API 並以 class_students 過濾）
alter table self_sessions enable row level security;
alter table self_answers  enable row level security;
alter table kp_mastery    enable row level security;
alter table review_items  enable row level security;
-- 具體 policy 依 student-app 的 students.user_id 對應方式撰寫，例如：
-- create policy own_sessions on self_sessions for all
--   using (student_id in (select id from students where user_id = auth.uid()));

-- ── 無人化 K書中心（到館、專注、問 AI、家長） ──────────────────────────
create table if not exists study_days (
  student_id    uuid not null references students(id) on delete cascade,
  date          date not null,
  branch_id     uuid references branches(id),
  seat          text,
  check_in_at   timestamptz not null,
  check_out_at  timestamptz,
  plan          jsonb not null,          -- DayPlan
  reflection    jsonb,                   -- { mood, learned, stuck, shareWithParent }
  primary key (student_id, date)
);

create table if not exists focus_blocks (
  id            bigserial primary key,
  student_id    uuid not null references students(id) on delete cascade,
  date          date not null,
  subject       text not null,
  kind          text not null check (kind in ('focus', 'break')),
  started_at    timestamptz not null,
  ended_at      timestamptz,
  planned_min   smallint not null,
  distractions  smallint not null default 0,
  completed     boolean not null default false
);
create index on focus_blocks (student_id, date);

-- 問 AI（取代現場老師）：一個學生對一題一筆
create table if not exists ai_asks (
  student_id    uuid not null references students(id) on delete cascade,
  question_id   uuid not null references question_bank(id),
  solution      text,                    -- AI 詳解（student-app 同款，含 ```figure```）
  ai_answer     text,
  followups     jsonb not null default '[]',   -- [{ q, a, at }]
  understood    boolean,                 -- null=未回答、false=看完仍不懂
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  primary key (student_id, question_id)
);

-- 詳解雲端快取：同一題所有學生共用，只付一次 AI 費用
create table if not exists solution_cache (
  question_id   uuid primary key references question_bank(id) on delete cascade,
  solution      text not null,
  ai_answer     text,
  model         text not null,
  created_at    timestamptz not null default now()
);

-- AI 答案與題目答案不一致 → 題目可能有誤，館方遠端審核
create table if not exists question_flags (
  id            bigserial primary key,
  question_id   uuid not null references question_bank(id) on delete cascade,
  reason        text not null check (reason in ('ai-answer-mismatch', 'student-report')),
  detail        text,
  status        text not null default 'open' check (status in ('open', 'fixed', 'dismissed')),
  created_at    timestamptz not null default now()
);

-- AI 用量（每人每日上限、成本監控）
create table if not exists ai_usage (
  student_id    uuid not null references students(id) on delete cascade,
  date          date not null,
  solves        int not null default 0,
  followups     int not null default 0,
  primary key (student_id, date)
);

create table if not exists parents (
  id            uuid primary key default gen_random_uuid(),
  display_name  text not null,
  line_user_id  text unique,             -- LINE 官方帳號綁定後取得
  email         text,
  created_at    timestamptz not null default now()
);

create table if not exists parent_student_links (
  parent_id     uuid not null references parents(id) on delete cascade,
  student_id    uuid not null references students(id) on delete cascade,
  relation      text,                    -- 父／母／監護人
  approved_by   uuid,                    -- 館方核可的 staff.id
  notify_arrival  boolean not null default true,
  notify_daily    boolean not null default true,
  notify_weekly   boolean not null default true,
  notify_alerts   boolean not null default true,
  primary key (parent_id, student_id)
);

create table if not exists parent_notes (
  id            bigserial primary key,
  parent_id     uuid not null references parents(id) on delete cascade,
  student_id    uuid not null references students(id) on delete cascade,
  text          text not null,
  created_at    timestamptz not null default now(),
  read_at       timestamptz
);

create table if not exists notifications (
  id            bigserial primary key,
  parent_id     uuid not null references parents(id) on delete cascade,
  student_id    uuid not null references students(id) on delete cascade,
  kind          text not null check (kind in ('arrival', 'departure', 'daily', 'weekly', 'alert')),
  channel       text not null check (channel in ('line', 'email')),
  payload       text not null,
  status        text not null default 'pending' check (status in ('pending', 'sent', 'failed')),
  attempts      smallint not null default 0,
  created_at    timestamptz not null default now(),
  sent_at       timestamptz
);
create index on notifications (status, created_at);
