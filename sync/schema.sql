-- ═══════════════════════════════════════════════════════════════════
-- Todo — sync schema
-- Paste this whole file into Supabase → SQL Editor → New query → Run.
--
-- Design: one row per list, addressed by a long random secret key that
-- lives in the app's URL. There is no login. Security comes from two
-- things: the key is unguessable, and the table itself is unreachable —
-- the anon role can only call the two functions below, both of which
-- demand the key.
-- ═══════════════════════════════════════════════════════════════════

create table if not exists public.lists (
  key        text primary key check (char_length(key) between 32 and 64),
  data       jsonb       not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  -- a personal to-do list has no business being megabytes; this caps
  -- how much damage a stray client or a bad actor can do to one row
  constraint lists_data_size check (pg_column_size(data) < 512000)
);

-- RLS on with NO policies means: nobody reaches this table directly.
-- Not the anon key, not the browser. Only the definer functions below.
alter table public.lists enable row level security;

-- ── read ───────────────────────────────────────────────────────────
create or replace function public.pull_list(k text)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select coalesce((select data from public.lists where key = k), '{}'::jsonb);
$$;

-- ── write ──────────────────────────────────────────────────────────
create or replace function public.push_list(k text, d jsonb)
returns timestamptz
language sql
security definer
set search_path = public
as $$
  insert into public.lists (key, data, updated_at)
  values (k, d, now())
  on conflict (key) do update
    set data = excluded.data, updated_at = now()
  returning updated_at;
$$;

-- ── expose exactly these two, to the anonymous role only ───────────
revoke all on function public.pull_list(text)         from public;
revoke all on function public.push_list(text, jsonb)  from public;
grant execute on function public.pull_list(text)        to anon;
grant execute on function public.push_list(text, jsonb) to anon;
