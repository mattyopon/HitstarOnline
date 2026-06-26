-- ───────────────────────────────────────────────────────────────────────────
-- Hitstar Online — Realtime Authorization for private room channels
--
-- Adds RLS policies on `realtime.messages` so that Broadcast/Presence on
-- PRIVATE channels (config: { private: true }) is restricted to members of the
-- room the channel belongs to. Used by in-room chat / emotes (and later voice
-- signaling). Public channels (e.g. the existing postgres_changes `room-<code>`
-- subscription) are unaffected — Realtime only consults these policies for
-- channels that opt into `private: true`.
--
-- Topic naming convention: "<kind>:<ROOMCODE>", e.g. "chat:AB23CD".
--   kinds: chat | voice | presence
-- The room code is the public 6-char room.code; we resolve it to the room id
-- and reuse the same membership check as table RLS.
-- ───────────────────────────────────────────────────────────────────────────

-- Resolve a realtime topic of the form "<kind>:<ROOMCODE>" to a membership
-- check for the current user. SECURITY DEFINER so it can read rooms/members
-- regardless of the caller's own RLS visibility (it only returns a boolean).
create or replace function public.realtime_room_topic_member(p_topic text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_kind text;
  v_code text;
  v_room uuid;
begin
  if p_topic is null then
    return false;
  end if;
  v_kind := split_part(p_topic, ':', 1);
  v_code := split_part(p_topic, ':', 2);
  -- Only the room-scoped kinds are governed here.
  if v_kind not in ('chat', 'voice', 'presence') then
    return false;
  end if;
  if v_code is null or v_code = '' then
    return false;
  end if;
  select id into v_room from public.rooms where code = v_code;
  if v_room is null then
    return false;
  end if;
  return exists (
    select 1 from public.room_members m
    where m.room_id = v_room and m.user_id = auth.uid()
  );
end;
$$;

grant execute on function public.realtime_room_topic_member(text) to authenticated;

-- Realtime stores RLS on the `realtime.messages` table. RLS is already enabled
-- on it by Supabase; we just add (idempotently) the read/write policies.
do $$
begin
  -- Receive broadcast/presence on a private room channel.
  if not exists (
    select 1 from pg_policies
    where schemaname = 'realtime' and tablename = 'messages'
      and policyname = 'room members can read room realtime'
  ) then
    create policy "room members can read room realtime"
      on realtime.messages for select
      to authenticated
      using ( public.realtime_room_topic_member((select realtime.topic())) );
  end if;

  -- Send broadcast/presence on a private room channel.
  if not exists (
    select 1 from pg_policies
    where schemaname = 'realtime' and tablename = 'messages'
      and policyname = 'room members can send room realtime'
  ) then
    create policy "room members can send room realtime"
      on realtime.messages for insert
      to authenticated
      with check ( public.realtime_room_topic_member((select realtime.topic())) );
  end if;
end $$;
