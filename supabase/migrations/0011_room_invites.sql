-- ───────────────────────────────────────────────────────────────────────────
-- Hitstar Online — In-app room invites (migration 0011)
--   * room_invites : "join my room" pings delivered to friends inside the app
--     (previously "invite" only copied the room code to the clipboard, so the
--     friend had to receive it out-of-band — a detected requirements gap).
--
-- Same philosophy as 0007: RLS enabled; clients get SELECT-own ONLY; all
-- mutations run through the service role in /api/friends/invite*. Invites are
-- ephemeral (the list API prunes rows older than 15 min).
-- ───────────────────────────────────────────────────────────────────────────

create table if not exists public.room_invites (
  id         uuid primary key default gen_random_uuid(),
  from_user  uuid not null references auth.users (id) on delete cascade,
  to_user    uuid not null references auth.users (id) on delete cascade,
  room_code  text not null,
  created_at timestamptz not null default now(),
  check (from_user <> to_user)
);

-- One live invite per ordered pair: re-inviting the same friend replaces the
-- previous ping (service role upserts on this index) instead of stacking spam.
create unique index if not exists room_invites_pair_uniq
  on public.room_invites (from_user, to_user);
create index if not exists room_invites_to_idx
  on public.room_invites (to_user, created_at);

alter table public.room_invites enable row level security;

-- Both parties may read (recipient renders the banner; sender could render
-- "invited ✓" state later). No client write policies → service-role only.
create policy "read own room invites" on public.room_invites
  for select using (auth.uid() = to_user or auth.uid() = from_user);

grant select on public.room_invites to authenticated;
