-- ───────────────────────────────────────────────────────────────────────────
-- Hitstar Online — player stats & ranked records
--
--   * matches         : one row per finished game (mode, ranked flag, winner).
--   * match_players   : per-player result in a match (rank, cards, winner).
--   * category_stats  : per-user placement accuracy aggregated by category
--                       (attempts/correct) → "strong / weak" categories.
--   * reveal_events   : idempotency guard so a reveal is counted exactly once
--                       even though multiple clients race the advance call.
--   * recorded_matches: idempotency guard so a game is recorded once at gameover.
--
-- All writes go through the service role (API routes). RLS is enabled with NO
-- client policies → clients can never read/write these directly; the /api/stats
-- route reads them with the service role and filters by the session user.
-- (Bot players are never recorded — their ids are not real auth uuids.)
-- ───────────────────────────────────────────────────────────────────────────

create table if not exists public.matches (
  id uuid primary key default gen_random_uuid(),
  room_code text,
  mode text not null default 'original',
  ranked boolean not null default false,
  categories text[] not null default '{}',
  winner_id uuid,
  player_count integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.match_players (
  match_id uuid not null references public.matches (id) on delete cascade,
  user_id uuid not null,
  name text,
  rank integer not null default 0,
  cards_won integer not null default 0,
  is_winner boolean not null default false,
  primary key (match_id, user_id)
);
create index if not exists match_players_user_idx on public.match_players (user_id);

create table if not exists public.category_stats (
  user_id uuid not null,
  category text not null,
  attempts integer not null default 0,
  correct integer not null default 0,
  primary key (user_id, category)
);
create index if not exists category_stats_user_idx on public.category_stats (user_id);

create table if not exists public.reveal_events (
  room_id uuid not null,
  version integer not null,
  primary key (room_id, version)
);

create table if not exists public.recorded_matches (
  room_id uuid primary key,
  recorded_at timestamptz not null default now()
);

alter table public.matches enable row level security;
alter table public.match_players enable row level security;
alter table public.category_stats enable row level security;
alter table public.reveal_events enable row level security;
alter table public.recorded_matches enable row level security;
-- No policies / no grants → service role only.

-- Atomically bump a user's per-category accuracy counters (insert or add).
create or replace function public.bump_category_stat(
  p_user uuid, p_category text, p_attempts integer, p_correct integer
)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.category_stats (user_id, category, attempts, correct)
  values (p_user, p_category, p_attempts, p_correct)
  on conflict (user_id, category)
  do update set
    attempts = public.category_stats.attempts + excluded.attempts,
    correct  = public.category_stats.correct  + excluded.correct;
$$;
revoke all on function public.bump_category_stat(uuid, text, integer, integer) from public, anon, authenticated;
