-- Atomic room-state apply with optimistic version CAS.
--
-- Replaces the previous two non-transactional writes (rooms UPDATE then
-- room_secrets upsert) with a single transactional RPC, so the public state and
-- the secret state can never be left half-updated. Returns true if the CAS won.

create or replace function public.apply_room_state(
  p_id uuid,
  p_expected_version integer,
  p_state jsonb,
  p_version integer,
  p_status text,
  p_secret jsonb
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  updated integer;
begin
  update public.rooms
     set state = p_state,
         version = p_version,
         status = p_status,
         updated_at = now()
   where id = p_id
     and version = p_expected_version;
  get diagnostics updated = row_count;
  if updated = 0 then
    return false; -- another writer won the optimistic lock
  end if;

  insert into public.room_secrets (room_id, secret)
  values (p_id, p_secret)
  on conflict (room_id) do update set secret = excluded.secret;

  return true;
end;
$$;

-- Server-role only (API routes use the service role). Never client-callable.
revoke all on function public.apply_room_state(uuid, integer, jsonb, integer, text, jsonb) from public;
revoke all on function public.apply_room_state(uuid, integer, jsonb, integer, text, jsonb) from anon, authenticated;
grant execute on function public.apply_room_state(uuid, integer, jsonb, integer, text, jsonb) to service_role;
