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
