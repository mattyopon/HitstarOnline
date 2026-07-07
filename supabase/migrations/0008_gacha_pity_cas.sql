-- 0008_gacha_pity_cas.sql
-- Fix: the gacha pity (天井) counter was read non-atomically. The gem debit /
-- daily-pull RPC RETURNs the current pity, then JS rolls, then a SEPARATE
-- last-writer-wins UPDATE stored the new pity. Concurrent rolls for the same
-- user all read the SAME starting pity → each could independently trigger the
-- guaranteed-SSR ceiling, minting multiple SSRs from one pity; and two rolls
-- could clobber each other's pity write, losing legitimate progression.
--
-- This adds a CAS-guarded variant of apply_gacha_pull_batch: the pity write only
-- lands if the row's pity_count still equals the value the caller rolled from.
-- On a 0-row mismatch the caller re-reads pity and re-rolls (bounded retry).
-- A NEW function name (…_v2) is used so old deployed code keeps working during
-- the deploy window; the code switches to _v2 in the same release.

create or replace function public.apply_gacha_pull_batch_v2(
  p_user_id       uuid,
  p_character_ids text[],
  p_pity_expected integer,
  p_pity_new      integer
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_matched integer;
begin
  -- CAS on pity FIRST: only proceed if nobody advanced pity since we read it.
  update public.player_gems
     set pity_count = p_pity_new,
         updated_at = now()
   where user_id = p_user_id
     and pity_count = p_pity_expected;
  get diagnostics v_matched = row_count;
  if v_matched = 0 then
    return false; -- stale pity; caller must re-read and re-roll.
  end if;

  -- Only NOW grant the characters, so a rejected (stale) roll grants nothing.
  insert into public.player_characters (user_id, character_id, dupes)
  select p_user_id, c.character_id, count(*) - 1
  from unnest(p_character_ids) as c(character_id)
  group by c.character_id
  on conflict (user_id, character_id) do update
    set dupes = public.player_characters.dupes + excluded.dupes + 1;

  return true;
end;
$$;

revoke all on function public.apply_gacha_pull_batch_v2(uuid, text[], integer, integer)
  from public, anon, authenticated;
grant execute on function public.apply_gacha_pull_batch_v2(uuid, text[], integer, integer)
  to service_role;
