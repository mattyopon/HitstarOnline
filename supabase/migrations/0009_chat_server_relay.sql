-- 0009_chat_server_relay.sql
-- Close the chat impersonation vector. 0003 let ANY room member INSERT
-- (broadcast) to a "chat:<CODE>" topic with a self-asserted payload, so a member
-- could broadcast a message carrying another member's userId. Chat now goes
-- THROUGH the server (POST /api/chat/send), which stamps the sender id from the
-- authenticated session and relays via the service-role broadcast endpoint
-- (service_role bypasses RLS). To make that the ONLY write path, we remove the
-- authenticated INSERT grant for "chat:" topics while keeping it for
-- "voice:"/"presence:" (VC signaling still broadcasts client-to-client for
-- latency). Members can still SELECT (receive) chat — the read policy is
-- unchanged, so subscriptions keep working.

do $$
begin
  -- Replace the broad send policy (chat|voice|presence) with a voice/presence-
  -- only one. Chat inserts by `authenticated` are no longer permitted → only the
  -- service-role server relay can broadcast chat.
  drop policy if exists "room members can send room realtime" on realtime.messages;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'realtime' and tablename = 'messages'
      and policyname = 'room members can send voice realtime'
  ) then
    create policy "room members can send voice realtime"
      on realtime.messages for insert
      to authenticated
      with check (
        split_part((select realtime.topic()), ':', 1) in ('voice', 'presence')
        and public.realtime_room_topic_member((select realtime.topic()))
      );
  end if;
end $$;
