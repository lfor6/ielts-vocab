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
