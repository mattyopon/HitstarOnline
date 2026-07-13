-- 0010_match_gems.sql
-- Match rewards close the gacha-economy dead end: gems previously had NO earn
-- path (only the signup grant), so the featured x10 roll was permanently
-- unreachable. grant_gems atomically credits a player's balance. The row is
-- ensured FIRST with column defaults (legacy users created before 0006 have no
-- row; inserting defaults preserves their initial 500-gem grant) and then the
-- reward is added. Called ONLY server-side from recordMatchEnd (service_role),
-- which already runs exactly once per room via the recorded_matches guard →
-- no double-grant.

create or replace function public.grant_gems(
  p_user_id uuid,
  p_amount  integer
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.player_gems (user_id)
  values (p_user_id)
  on conflict (user_id) do nothing;

  update public.player_gems
     set gems = gems + greatest(p_amount, 0),
         updated_at = now()
   where user_id = p_user_id;
end;
$$;

revoke all on function public.grant_gems(uuid, integer) from public, anon, authenticated;
grant execute on function public.grant_gems(uuid, integer) to service_role;
