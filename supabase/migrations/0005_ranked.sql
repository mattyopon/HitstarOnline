-- ───────────────────────────────────────────────────────────────────────────
-- Hitstar Online — worldwide ranked competitive mode (migration 0005)
--
-- Tier ladder (ascending, NO gold):
--   wood < bronze < silver < platinum < diamond < grandmaster < challenger
-- Each tier holds LP 0–100. Win = +25 LP, Loss = −20 LP.
--   Promotion : LP >= 100 → next tier, LP reset to 0 (challenger: capped at 100).
--   Demotion  : LP <  0   → previous tier, LP set to 75.
--   Floor     : wood with LP that would go < 0 stays wood 0 (no demotion).
--   Apex      : challenger never promotes; LP capped at 100.
-- Everyone starts at bronze 0 (lazily, on first ranked match / first read).
--
--   rankings      : one row per user who has touched ranked (lazy-created).
--   rooms.ranked  : boolean flag for tier-bucketed matchmaking.
--   rooms.tier    : tier snapshot, fixed at room creation (immutable).
--
-- apply_rank_result(): atomic ±LP with promote/demote/floor/cap. service_role only.
-- The tier list here MUST stay in sync with TIER_LIST in src/lib/rank.ts.
-- ───────────────────────────────────────────────────────────────────────────

create table if not exists public.rankings (
  user_id       uuid primary key references auth.users (id) on delete cascade,
  tier          text    not null default 'bronze',
  lp            integer not null default 0,
  ranked_games  integer not null default 0,
  ranked_wins   integer not null default 0,
  updated_at    timestamptz not null default now()
);

create index if not exists rankings_tier_idx on public.rankings (tier);

alter table public.rankings enable row level security;
-- No client policies, no client grants → service role only (reads go through the
-- /api/rank/* routes; tier is plumbed into rooms.state which clients DO read).

-- Ranked metadata on rooms. Defaults keep all existing/casual rooms unaffected.
alter table public.rooms
  add column if not exists ranked boolean not null default false;
alter table public.rooms
  add column if not exists tier text; -- null for casual/solo; tier name for ranked.

-- Partial index for the matchmaking lookup (open ranked lobbies by tier).
create index if not exists rooms_ranked_tier_idx
  on public.rooms (tier, created_at)
  where ranked = true and status = 'lobby';

-- Atomic LP application for one player's match result.
create or replace function public.apply_rank_result(
  p_user_id uuid,
  p_is_win  boolean
)
returns table(new_tier text, new_lp integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tiers    text[] := array['wood','bronze','silver','platinum','diamond','grandmaster','challenger'];
  v_tier     text;
  v_lp       integer;
  v_idx      integer;
  v_new_lp   integer;
  v_new_tier text;
begin
  -- Lazy-init to bronze 0 on first ranked result.
  insert into public.rankings (user_id, tier, lp)
  values (p_user_id, 'bronze', 0)
  on conflict (user_id) do nothing;

  select tier, lp into v_tier, v_lp
  from public.rankings where user_id = p_user_id;

  v_idx := array_position(v_tiers, v_tier);
  if v_idx is null then
    v_idx := 2;            -- unknown tier → treat as bronze
    v_tier := 'bronze';
  end if;

  v_new_tier := v_tier;
  if p_is_win then
    v_new_lp := v_lp + 25;
  else
    v_new_lp := v_lp - 20;
  end if;

  -- Promotion.
  if v_new_lp >= 100 then
    if v_idx < array_length(v_tiers, 1) then
      v_new_tier := v_tiers[v_idx + 1];
      v_new_lp := 0;
    else
      v_new_lp := 100;     -- challenger apex cap
    end if;
  -- Demotion.
  elsif v_new_lp < 0 then
    if v_idx > 1 then
      v_new_tier := v_tiers[v_idx - 1];
      v_new_lp := 75;
    else
      v_new_lp := 0;       -- wood floor
    end if;
  end if;

  update public.rankings
  set tier = v_new_tier,
      lp   = v_new_lp,
      ranked_games = ranked_games + 1,
      ranked_wins  = ranked_wins + (case when p_is_win then 1 else 0 end),
      updated_at = now()
  where user_id = p_user_id;

  return query select v_new_tier, v_new_lp;
end;
$$;

revoke all on function public.apply_rank_result(uuid, boolean) from public, anon, authenticated;
grant execute on function public.apply_rank_result(uuid, boolean) to service_role;
