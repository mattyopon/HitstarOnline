-- ───────────────────────────────────────────────────────────────────────────
-- Hitstar Online — Friends system (migration 0007)
--   * profiles.friend_code   : stable shareable handle for friend requests
--   * profiles.last_seen_at   : presence heartbeat ("online" = within 5 min)
--   * friend_requests         : directed pending/accepted/declined requests
--   * friendships             : symmetric accepted edge (canonical user_a<user_b)
--
-- Same philosophy as 0004/0006: RLS enabled; clients get SELECT-own policies
-- ONLY (no client INSERT/UPDATE/DELETE); all mutations run through the service
-- role in /api/friends/* OR through SECURITY DEFINER RPCs granted to
-- `authenticated` where an atomic multi-table op is required (accept) or a
-- self-scoped bump is needed (heartbeat).
-- ───────────────────────────────────────────────────────────────────────────

-- 1. Extend profiles: friend code + presence. -------------------------------
alter table public.profiles
  add column if not exists friend_code   text,
  add column if not exists last_seen_at  timestamptz;

-- Crockford base32-ish, no ambiguous chars (0/O/1/I/L), length 6, "HS-" prefix.
create or replace function public.gen_friend_code()
returns text
language sql
volatile
set search_path = public
as $$
  select 'HS-' || string_agg(
    substr('23456789ABCDEFGHJKMNPQRSTUVWXYZ',
           1 + floor(random() * 31)::int, 1), '')
  from generate_series(1, 6);
$$;

-- Assign codes to any profile missing one (idempotent; loops on rare collision).
do $$
declare r record; c text;
begin
  for r in select id from public.profiles where friend_code is null loop
    loop
      c := public.gen_friend_code();
      begin
        update public.profiles set friend_code = c where id = r.id;
        exit;
      exception when unique_violation then
        -- retry with a fresh code
      end;
    end loop;
  end loop;
end $$;

create unique index if not exists profiles_friend_code_key
  on public.profiles (friend_code);

-- New signups get a code via the existing handle_new_user() trigger path.
-- Amend that function (from 0001) to also set friend_code on insert. This is
-- additive (create or replace) — the trigger on_auth_user_created installed in
-- 0001 is reused as-is.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name, avatar_url, friend_code)
  values (
    new.id,
    coalesce(
      nullif(new.raw_user_meta_data ->> 'full_name', ''),
      nullif(new.raw_user_meta_data ->> 'name', ''),
      nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
      'Player'
    ),
    new.raw_user_meta_data ->> 'avatar_url',
    public.gen_friend_code()
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

-- 2. friend_requests (directed). --------------------------------------------
create table if not exists public.friend_requests (
  id           uuid primary key default gen_random_uuid(),
  from_user    uuid not null references auth.users (id) on delete cascade,
  to_user      uuid not null references auth.users (id) on delete cascade,
  status       text not null default 'pending'
               check (status in ('pending','accepted','declined')),
  created_at   timestamptz not null default now(),
  responded_at timestamptz,
  check (from_user <> to_user)
);
-- At most one *pending* request per ordered pair (partial unique index): stops
-- spam but still allows a fresh request after a prior one was declined.
create unique index if not exists friend_requests_pending_uniq
  on public.friend_requests (from_user, to_user)
  where status = 'pending';
create index if not exists friend_requests_to_idx   on public.friend_requests (to_user, status);
create index if not exists friend_requests_from_idx on public.friend_requests (from_user, status);

-- 3. friendships (symmetric, canonical user_a < user_b). --------------------
create table if not exists public.friendships (
  user_a     uuid not null references auth.users (id) on delete cascade,
  user_b     uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_a, user_b),
  check (user_a < user_b)
);
create index if not exists friendships_user_b_idx on public.friendships (user_b);

-- 4. RLS. --------------------------------------------------------------------
alter table public.friend_requests enable row level security;
alter table public.friendships     enable row level security;

-- A user may read requests they sent OR received (to render incoming/outgoing).
-- No client write policies → inserts/updates via the service role.
create policy "read own friend requests" on public.friend_requests
  for select using (auth.uid() = from_user or auth.uid() = to_user);

-- A user may read friendships they are part of.
create policy "read own friendships" on public.friendships
  for select using (auth.uid() = user_a or auth.uid() = user_b);

grant select on public.friend_requests to authenticated;
grant select on public.friendships     to authenticated;
-- No insert/update/delete grants/policies → mutations are service-role only,
-- except accept_friend_request() below (SECURITY DEFINER, granted execute).

-- 5. Presence heartbeat RPC (authenticated can bump only its own row). -------
create or replace function public.touch_last_seen()
returns void
language sql
security definer
set search_path = public
as $$
  update public.profiles set last_seen_at = now() where id = auth.uid();
$$;
revoke all on function public.touch_last_seen() from public, anon;
grant execute on function public.touch_last_seen() to authenticated;

-- 6. Atomic accept RPC: mark the request accepted AND create the canonical
--    friendship edge in one transaction. SECURITY DEFINER so it bypasses the
--    (write-less) RLS, but it is HARD-SCOPED to auth.uid() = to_user so a
--    caller can only accept a request addressed to THEM. Returns the friend's
--    id on success, null if no matching pending request is owned by the caller.
create or replace function public.accept_friend_request(p_request_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_from uuid;
  v_to   uuid;
  v_a    uuid;
  v_b    uuid;
begin
  update public.friend_requests
     set status = 'accepted', responded_at = now()
   where id = p_request_id
     and to_user = auth.uid()          -- caller must be the recipient
     and status = 'pending'
  returning from_user, to_user into v_from, v_to;

  if v_from is null then
    return null;                        -- not found / not yours / already handled
  end if;

  v_a := least(v_from, v_to);
  v_b := greatest(v_from, v_to);
  insert into public.friendships (user_a, user_b)
  values (v_a, v_b)
  on conflict (user_a, user_b) do nothing;

  return v_from;                        -- the new friend's id (for the response)
end;
$$;
revoke all on function public.accept_friend_request(uuid) from public, anon;
grant execute on function public.accept_friend_request(uuid) to authenticated;
