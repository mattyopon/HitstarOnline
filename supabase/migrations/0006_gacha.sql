-- ───────────────────────────────────────────────────────────────────────────
-- Hitstar Online — BILIBILI kawaii gacha layer (migration 0006)
--
--   * player_gems       : per-user currencies (💎 gems / 🎵 notes / 🪙 tokens),
--                          daily free-pull gate, and the gacha pity counter.
--   * player_characters : owned muse roster (dupe count = 凸, per-user).
--   * player_party      : current 5-slot battle lineup (character ids only).
--   * gacha_pulls        : append-only roll history (analytics + pity audit).
--
-- Same philosophy as 0004_stats.sql / 0005_ranked.sql: RLS is enabled with
-- SELECT-own policies only. There are NO client INSERT/UPDATE/DELETE policies
-- anywhere in this file — all writes happen via the service-role admin client
-- from /api/gacha/*, /api/party/*, /api/character/* route handlers, which are
-- server-authoritative (mirrors how room_secrets/matches/rankings are never
-- client-writable). seed_new_player() is the sole exception: a SECURITY
-- DEFINER RPC callable by `authenticated` so a brand-new session can bootstrap
-- its own starter row/characters/party without a service-role round trip.
-- ───────────────────────────────────────────────────────────────────────────

create table if not exists public.player_gems (
  user_id       uuid primary key references auth.users (id) on delete cascade,
  gems          integer not null default 500,   -- 💎 premium currency (gacha)
  notes         integer not null default 3000,  -- 🎵 soft currency (upgrades)
  tokens        integer not null default 0,     -- 🪙 battle tokens (gacha login reward, separate from in-match tokens)
  daily_pull_at timestamptz,                    -- last free daily-pull timestamp
  pity_count    integer not null default 0,     -- gacha pity counter (0..90)
  updated_at    timestamptz not null default now()
);

create table if not exists public.player_characters (
  user_id       uuid not null references auth.users (id) on delete cascade,
  character_id  text not null,                  -- matches gachaChars.ts ids (e.g. 'synthea')
  level         integer not null default 1,
  dupes         integer not null default 0,     -- duplicate-pull count (凸)
  acquired_at   timestamptz not null default now(),
  primary key (user_id, character_id)
);
create index if not exists player_characters_user_idx on public.player_characters (user_id);

create table if not exists public.player_party (
  user_id       uuid not null references auth.users (id) on delete cascade,
  slot          integer not null check (slot between 0 and 4),
  character_id  text not null,
  primary key (user_id, slot)
);

create table if not exists public.gacha_pulls (
  id            bigserial primary key,
  user_id       uuid not null references auth.users (id) on delete cascade,
  banner_id     text not null,                  -- e.g. 'showa_genesis'
  character_id  text not null,
  rarity        text not null check (rarity in ('SSR','SR','R')),
  pity_at       integer not null,               -- pity counter value at roll time
  pulled_at     timestamptz not null default now()
);
create index if not exists gacha_pulls_user_idx on public.gacha_pulls (user_id, pulled_at desc);

alter table public.player_gems enable row level security;
alter table public.player_characters enable row level security;
alter table public.player_party enable row level security;
alter table public.gacha_pulls enable row level security;

create policy "player reads own gems" on public.player_gems
  for select using (auth.uid() = user_id);
create policy "player reads own chars" on public.player_characters
  for select using (auth.uid() = user_id);
create policy "player reads own party" on public.player_party
  for select using (auth.uid() = user_id);
create policy "player reads own pulls" on public.gacha_pulls
  for select using (auth.uid() = user_id);
-- No INSERT/UPDATE/DELETE policies for authenticated/anon on any of the four
-- tables above → all writes require the service role (API routes), exactly
-- like matches/category_stats/rankings in 0004/0005.

-- Bootstrap a brand-new player: starter gem/note/token balance, the 3 starter
-- muses, and a default party. SECURITY DEFINER so it can write despite RLS;
-- every insert is ON CONFLICT DO NOTHING so it is safe (and cheap/idempotent)
-- to call on every login, not just the very first one.
create or replace function public.seed_new_player()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.player_gems (user_id)
  values (auth.uid())
  on conflict (user_id) do nothing;

  insert into public.player_characters (user_id, character_id)
  values
    (auth.uid(), 'synthea'),
    (auth.uid(), 'popciel'),
    (auth.uid(), 'lofi')
  on conflict (user_id, character_id) do nothing;

  insert into public.player_party (user_id, slot, character_id)
  values
    (auth.uid(), 0, 'synthea'),
    (auth.uid(), 1, 'popciel'),
    (auth.uid(), 2, 'lofi')
  on conflict (user_id, slot) do nothing;
end;
$$;

revoke all on function public.seed_new_player() from public, anon;
grant execute on function public.seed_new_player() to authenticated;

-- Atomic gem debit for a paid gacha roll. A single UPDATE guarded by a
-- sufficient-balance WHERE clause: under concurrent requests for a balance
-- that can only cover one of them, only one UPDATE matches a row — the loser
-- affects zero rows and the API route surfaces "insufficient gems" (no CAS
-- retry needed, unlike apply_room_state, because there's no expected-version
-- to race against — the balance check IS the guard). Returns the pre-debit
-- pity_count (for rollMany's threading) and the post-debit gems balance in
-- one round trip; returns no rows on insufficient balance or a missing row
-- (a missing player_gems row means seed_new_player() never ran — treated the
-- same as insufficient funds by the caller).
create or replace function public.debit_gems_for_roll(
  p_user_id uuid,
  p_cost    integer
)
returns table(gems integer, pity_count integer)
language sql
security definer
set search_path = public
as $$
  update public.player_gems
     set gems = public.player_gems.gems - p_cost,
         updated_at = now()
   where user_id = p_user_id
     and public.player_gems.gems >= p_cost
  returning public.player_gems.gems, public.player_gems.pity_count;
$$;

revoke all on function public.debit_gems_for_roll(uuid, integer) from public, anon, authenticated;
grant execute on function public.debit_gems_for_roll(uuid, integer) to service_role;

-- Atomic 24h daily-pull gate: a single UPDATE guarded by
-- "daily_pull_at is null or older than 24h", so two concurrent daily-pull
-- requests can't both win — only one UPDATE matches the row (the other sees
-- the just-written fresh daily_pull_at and matches zero rows). Returns the
-- pre-claim pity_count on success; no rows means still on cooldown (or the
-- player_gems row doesn't exist yet).
create or replace function public.claim_daily_pull(
  p_user_id uuid
)
returns table(pity_count integer)
language sql
security definer
set search_path = public
as $$
  update public.player_gems
     set daily_pull_at = now(),
         updated_at = now()
   where user_id = p_user_id
     and (public.player_gems.daily_pull_at is null
          or public.player_gems.daily_pull_at <= now() - interval '24 hours')
  returning public.player_gems.pity_count;
$$;

revoke all on function public.claim_daily_pull(uuid) from public, anon, authenticated;
grant execute on function public.claim_daily_pull(uuid) to service_role;

-- Atomically persist an entire roll batch: per-character dupe-count upserts
-- (via a single INSERT ... ON CONFLICT DO UPDATE over jsonb_to_recordset, so
-- a x10 batch pulling the same new character twice increments dupes
-- correctly instead of racing a select-then-update per row) plus the
-- batch's ending pity_count, all in one statement/transaction. This closes
-- the lost-update window that existed when the caller did a separate
-- select+update per outcome and a separate pity_count UPDATE afterward:
-- two concurrent roll requests for the same user could both read the same
-- starting dupes/pity_count and clobber each other's write. p_character_ids
-- is the roll batch in order (duplicates allowed); each occurrence adds 1 to
-- that character's dupes (0 on first-ever acquisition).
create or replace function public.apply_gacha_pull_batch(
  p_user_id       uuid,
  p_character_ids text[],
  p_pity_new      integer
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.player_characters (user_id, character_id, dupes)
  select p_user_id, c.character_id, count(*) - 1
  from unnest(p_character_ids) as c(character_id)
  group by c.character_id
  on conflict (user_id, character_id) do update
    set dupes = public.player_characters.dupes + excluded.dupes + 1;

  update public.player_gems
     set pity_count = p_pity_new,
         updated_at = now()
   where user_id = p_user_id;
end;
$$;

revoke all on function public.apply_gacha_pull_batch(uuid, text[], integer) from public, anon, authenticated;
grant execute on function public.apply_gacha_pull_batch(uuid, text[], integer) to service_role;
