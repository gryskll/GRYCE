-- gryCE V1 schema
-- Run once in Supabase: SQL Editor > New query > paste > Run.
-- Safe to re-run. Notion is the source of truth; these tables are a synced copy.

create schema if not exists private;

-- Tables ---------------------------------------------------------------

create table if not exists public.artists (
  id          uuid primary key,              -- Notion page id
  name        text not null,
  relation    text,                          -- GRYSKLL Crew, Crewmunity, GCU Member, ...
  roles       text[] not null default '{}',
  email       text,                          -- Google sign-in email; this is the login key
  synced_at   timestamptz not null
);
create index if not exists artists_email_idx on public.artists (lower(email));

create table if not exists public.songs (
  id                  uuid primary key,
  name                text not null,
  development_stage   text,
  status              text,
  crew                text,
  release_date        date,
  target_release_date date,
  song_link           text,
  bandcamp_link       text,
  synced_at           timestamptz not null
);

create table if not exists public.song_credits (
  song_id    uuid not null references public.songs(id) on delete cascade,
  artist_id  uuid not null references public.artists(id) on delete cascade,
  role       text not null check (role in ('Vocals','Producer','Mixing','Mastering','Visual Art')),
  synced_at  timestamptz not null,
  primary key (song_id, artist_id, role)
);
create index if not exists song_credits_artist_idx on public.song_credits (artist_id);

create table if not exists public.takes (
  id          uuid primary key,
  name        text not null,
  song_id     uuid references public.songs(id) on delete set null,
  artist_ids  uuid[] not null default '{}',
  type        text,
  status      text,
  due_date    date,
  notes       text,
  synced_at   timestamptz not null
);
create index if not exists takes_artist_ids_idx on public.takes using gin (artist_ids);

-- Who is signed in ------------------------------------------------------
-- Matches the Google sign-in email to an Artists row. No match, no data.

create or replace function private.current_artist_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select a.id
  from public.artists a
  where a.email is not null
    and lower(a.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  limit 1
$$;

revoke all on function private.current_artist_id() from public, anon;
grant usage on schema private to authenticated;
grant execute on function private.current_artist_id() to authenticated;

-- Row level security ----------------------------------------------------

alter table public.artists      enable row level security;
alter table public.songs        enable row level security;
alter table public.song_credits enable row level security;
alter table public.takes        enable row level security;

drop policy if exists "own artist row" on public.artists;
create policy "own artist row" on public.artists
  for select to authenticated
  using (id = private.current_artist_id());

drop policy if exists "own credits" on public.song_credits;
create policy "own credits" on public.song_credits
  for select to authenticated
  using (artist_id = private.current_artist_id());

drop policy if exists "own takes" on public.takes;
create policy "own takes" on public.takes
  for select to authenticated
  using (private.current_artist_id() = any (artist_ids));

drop policy if exists "songs I'm on" on public.songs;
create policy "songs I'm on" on public.songs
  for select to authenticated
  using (
    exists (select 1 from public.song_credits c
            where c.song_id = songs.id and c.artist_id = private.current_artist_id())
    or exists (select 1 from public.takes t
               where t.song_id = songs.id and private.current_artist_id() = any (t.artist_ids))
  );

-- Grants ----------------------------------------------------------------
-- Nothing for anon. Signed-in members can read, never write.
-- Email is left out of the artists grant so it can't be read through the API.

revoke all on public.artists, public.songs, public.song_credits, public.takes from anon, authenticated;

grant select (id, name, relation, roles) on public.artists to authenticated;
grant select on public.songs, public.song_credits, public.takes to authenticated;

-- The sync job uses the secret key, which runs as service_role.
grant all on public.artists, public.songs, public.song_credits, public.takes to service_role;
