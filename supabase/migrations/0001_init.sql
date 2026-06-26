-- ───────────────────────────────────────────────────────────────────────────
-- Hitstar Online — initial schema
--
-- Design:
--   * profiles       : public-ish user profile (display name, avatar), auto
--                      created on signup via a trigger on auth.users.
--   * rooms          : one row per game room. `state` (jsonb) is the SANITIZED
--                      public game state — never contains unrevealed answers.
--                      Clients SELECT it (if they are a member) and subscribe to
--                      it via Realtime. Only the service role writes it.
--   * room_members   : membership, used by RLS so only members can read a room.
--   * room_secrets   : server-only secret state (deck order, current answer).
--                      No client policies → clients can never read it.
--   * track_cache    : server-only cache mapping a song to a resolved YouTube id.
--
-- All game mutations go through Next.js API routes using the service role key,
-- which bypasses RLS. Clients only ever read.
-- ───────────────────────────────────────────────────────────────────────────

-- Profiles ────────────────────────────────────────────────────────────────--
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default 'Player',
  avatar_url text,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

drop policy if exists "profiles are readable by authenticated users" on public.profiles;
create policy "profiles are readable by authenticated users"
  on public.profiles for select
  to authenticated
  using (true);

drop policy if exists "users manage their own profile (insert)" on public.profiles;
create policy "users manage their own profile (insert)"
  on public.profiles for insert
  to authenticated
  with check (id = auth.uid());

drop policy if exists "users manage their own profile (update)" on public.profiles;
create policy "users manage their own profile (update)"
  on public.profiles for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

grant select, insert, update on public.profiles to authenticated;

-- Auto-create a profile whenever an auth user is created (incl. anonymous).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name, avatar_url)
  values (
    new.id,
    coalesce(
      nullif(new.raw_user_meta_data ->> 'full_name', ''),
      nullif(new.raw_user_meta_data ->> 'name', ''),
      nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
      'Player'
    ),
    new.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Rooms ──────────────────────────────────────────────────────────────────--
create table if not exists public.rooms (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  host_id uuid references auth.users (id) on delete set null,
  status text not null default 'lobby',
  version integer not null default 1,
  state jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists rooms_code_idx on public.rooms (code);

alter table public.rooms enable row level security;

-- Room members ───────────────────────────────────────────────────────────--
-- (Created before the membership helper below, since the function references it.)
create table if not exists public.room_members (
  room_id uuid not null references public.rooms (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (room_id, user_id)
);

alter table public.room_members enable row level security;

-- Membership helper (security definer avoids RLS recursion).
create or replace function public.is_room_member(p_room uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.room_members m
    where m.room_id = p_room and m.user_id = auth.uid()
  );
$$;

drop policy if exists "members can read their room" on public.rooms;
create policy "members can read their room"
  on public.rooms for select
  to authenticated
  using (public.is_room_member(id));

grant select on public.rooms to authenticated;
-- NOTE: no insert/update/delete policies → clients cannot write. The service
-- role (used by API routes) bypasses RLS.

drop policy if exists "members can see co-members" on public.room_members;
create policy "members can see co-members"
  on public.room_members for select
  to authenticated
  using (public.is_room_member(room_id));

grant select on public.room_members to authenticated;

-- Room secrets (server only) ─────────────────────────────────────────────--
create table if not exists public.room_secrets (
  room_id uuid primary key references public.rooms (id) on delete cascade,
  secret jsonb not null
);

alter table public.room_secrets enable row level security;
-- No policies, no grants → only the service role can touch it.

-- Track cache (server only) ──────────────────────────────────────────────--
create table if not exists public.track_cache (
  key text primary key,
  youtube_id text,
  updated_at timestamptz not null default now()
);

alter table public.track_cache enable row level security;
-- No policies, no grants → only the service role can touch it.

-- Realtime ───────────────────────────────────────────────────────────────--
-- Clients subscribe to changes on `rooms` to receive new sanitized game state.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'rooms'
  ) then
    alter publication supabase_realtime add table public.rooms;
  end if;
end $$;
