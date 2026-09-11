-- ============================================================================
-- 雅思词汇站点 · 云端答题记录表（Supabase）
-- 用法：Supabase 后台 → SQL Editor → 粘贴本文件全部内容 → Run
-- 与 supabase-config.js / supabase-sync.js 中的字段、表名(answers) 保持一致
-- ============================================================================

-- 1) 建表
create table if not exists public.answers (
  id               bigint generated always as identity primary key,
  word_id          text        not null,                    -- 对应 words.js 中 w.id
  selected_option  text,                                   -- 用户所选 A/B/C/D；null 表示超时未作答
  is_correct       smallint    not null,                   -- 1 正确 / 0 错误
  response_time_ms integer,                                -- 答题耗时（毫秒）
  timestamp        timestamptz not null,                    -- 答题发生时间（ISO）
  device           text,                                    -- 来源设备标识（排查用）
  created_at       timestamptz default now()                -- 写入云端时间
);

-- 2) 索引：按单词/时间查询更快
create index if not exists idx_answers_word_id  on public.answers (word_id);
create index if not exists idx_answers_created  on public.answers (created_at desc);

-- 3) 开启行级安全（RLS）
alter table public.answers enable row level security;

-- 4) RLS 策略：个人背单词工具，放行 anon 全表操作
--    ⚠️ 安全说明：anon key 可公开嵌入前端，真实权限由本策略控制。
--       当前为“单人共享表”，任何拿到站点的人都能读写该表。对个人学习工具可接受；
--       若日后需多用户隔离，请改用 Supabase Auth（匿名登录）并按 auth.uid() 过滤。
drop policy if exists "anon_all_answers" on public.answers;
create policy "anon_all_answers"
  on public.answers
  for all
  to anon
  using (true)
  with check (true);

-- 5) 掌握度表（复习调度管家 / SM-2 遗忘曲线）
--    每词一行（word_id 唯一），记录掌握等级、间隔、下次到期时间
create table if not exists public.mastery (
  id             bigint generated always as identity primary key,
  word_id        text        not null unique,        -- 对应 words.js 中 w.id（每词一行）
  level          smallint    not null default 0,     -- 掌握等级 0~5（0 新词 / 5 精通）
  ease           real        not null default 2.5,   -- SM-2 容易度因子
  interval_days  integer     not null default 0,     -- 当前复习间隔（天）
  due_at         timestamptz not null default now(), -- 下次到期复习时间
  last_reviewed  timestamptz,                        -- 上次复习时间
  review_count   integer     not null default 0,     -- 累计复习次数
  correct_streak integer     not null default 0,     -- 连续答对
  wrong_streak   integer     not null default 0,     -- 连续答错
  updated_at     timestamptz default now(),
  device         text                                   -- 最后修改设备（排查用）
);

create index if not exists idx_mastery_due on public.mastery (due_at);
create index if not exists idx_mastery_level on public.mastery (level);

alter table public.mastery enable row level security;

drop policy if exists "anon_all_mastery" on public.mastery;
create policy "anon_all_mastery"
  on public.mastery
  for all
  to anon
  using (true)
  with check (true);

-- 6) 错题本表（留存答错/超时的词，跨设备同步；与 wrong_book 云端同步逻辑一致）
--    每词一行（word_id 唯一），冗余存储展示字段，避免管理端只依赖词库
create table if not exists public.wrong_book (
  id                bigint generated always as identity primary key,
  word_id           text        not null unique,        -- 对应 words.js 中 w.id（每词一行）
  word              text        not null,               -- 冗余存词面（展示用）
  phonetic          text,                                -- 音标
  correct_option    text,                                -- 正确选项 A/B/C/D
  cet_level         text,                                -- 等级（展示用）
  last_wrong_option text,                                -- 上次错选；null/空 表示超时未作答
  wrong_count       integer     not null default 1,     -- 累计错次
  first_ts          timestamptz not null,                -- 首次进入错题本时间
  last_ts           timestamptz not null,                -- 最近错题时间
  updated_at        timestamptz default now(),
  device            text                                   -- 最后修改设备（排查用）
);

create index if not exists idx_wrong_book_last on public.wrong_book (last_ts desc);
create index if not exists idx_wrong_book_level on public.wrong_book (cet_level);

alter table public.wrong_book enable row level security;

drop policy if exists "anon_all_wrong_book" on public.wrong_book;
create policy "anon_all_wrong_book"
  on public.wrong_book
  for all
  to anon
  using (true)
  with check (true);
