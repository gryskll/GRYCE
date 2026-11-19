-- gryCE schema (V1 + V2 + V3)
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

-- =======================================================================
-- V2. Same SQL as supabase/migrations/v2-*.sql, kept here so a fresh
-- project can run this one file.
-- =======================================================================

-- gryCE V2, step 2: Tasks on the member dashboard.
-- Run in Supabase: SQL Editor > New query > paste > Run. Safe to re-run.
-- Synced from GRYSKLL Tasks. Only tasks with an Assignee or Owner set to Crew leave Notion.

create table if not exists public.tasks (
  id            uuid primary key,              -- Notion page id
  name          text not null,
  status        text,
  due_date      date,
  assignee_ids  uuid[] not null default '{}',  -- Assignee relation to Artists
  is_crew       boolean not null default false, -- Owner is Crew: every linked member sees it
  synced_at     timestamptz not null
);
create index if not exists tasks_assignee_ids_idx on public.tasks using gin (assignee_ids);

alter table public.tasks enable row level security;

drop policy if exists "my tasks and crew tasks" on public.tasks;
create policy "my tasks and crew tasks" on public.tasks
  for select to authenticated
  using (
    private.current_artist_id() = any (assignee_ids)
    or (is_crew and private.current_artist_id() is not null)
  );

revoke all on public.tasks from anon, authenticated;
grant select on public.tasks to authenticated;
grant all on public.tasks to service_role;

-- gryCE V2, step 3: Announcements and Acknowledge.
-- Run in Supabase: SQL Editor > New query > paste > Run. Safe to re-run.

-- Synced from the Notion Announcements database. The sync works out who the
-- audience is (Project vocalists, Specific artists) and stores their artist ids.
create table if not exists public.announcements (
  id                   uuid primary key,              -- Notion page id
  title                text not null,
  body                 text,
  audience             text not null default 'Everyone',
  project_id           uuid,
  audience_artist_ids  uuid[] not null default '{}',
  publish_date         date,
  expires              date,
  synced_at            timestamptz not null
);
create index if not exists announcements_audience_idx on public.announcements using gin (audience_artist_ids);

-- Written by members, never by the sync, and never deleted by it.
-- No foreign key to announcements on purpose: the sync deletes stale
-- announcements, and a cascade would take the acknowledgements with them.
create table if not exists public.announcement_acks (
  announcement_id  uuid not null,
  artist_id        uuid not null default private.current_artist_id(),
  acknowledged_at  timestamptz not null default now(),
  primary key (announcement_id, artist_id)
);

alter table public.announcements     enable row level security;
alter table public.announcement_acks enable row level security;

-- Dates compare in UTC, so a day starts at 7 or 8 pm Eastern the night before.
drop policy if exists "announcements for me" on public.announcements;
create policy "announcements for me" on public.announcements
  for select to authenticated
  using (
    private.current_artist_id() is not null
    and (publish_date is null or publish_date <= current_date)
    and (expires is null or expires >= current_date)
    and (audience = 'Everyone' or private.current_artist_id() = any (audience_artist_ids))
  );

drop policy if exists "own acks" on public.announcement_acks;
create policy "own acks" on public.announcement_acks
  for select to authenticated
  using (artist_id = private.current_artist_id());

-- A member can only acknowledge an announcement they can see, and only as themselves.
drop policy if exists "ack what I can see" on public.announcement_acks;
create policy "ack what I can see" on public.announcement_acks
  for insert to authenticated
  with check (
    artist_id = private.current_artist_id()
    and exists (select 1 from public.announcements a where a.id = announcement_id)
  );

revoke all on public.announcements, public.announcement_acks from anon, authenticated;
grant select on public.announcements to authenticated;
grant select on public.announcement_acks to authenticated;
grant insert (announcement_id) on public.announcement_acks to authenticated;
grant all on public.announcements, public.announcement_acks to service_role;

-- gryCE V2, step 4: members update their own open takes and tasks.
-- Run in Supabase: SQL Editor > New query > paste > Run. Safe to re-run.
-- Needs step 2 (tasks) first.
--
-- Members never edit synced tables. They add a row here. The sync pushes it to
-- Notion on its next run, then pulls, so the change comes back the normal way.

create table if not exists public.member_updates (
  id            uuid primary key default gen_random_uuid(),
  artist_id     uuid not null default private.current_artist_id(),
  item_type     text not null check (item_type in ('take', 'task')),
  item_id       uuid not null,
  -- Takes can only go to Submitted, tasks only to Done. Accepted is never possible.
  new_status    text check (
                  new_status is null
                  or (item_type = 'take' and new_status = 'Submitted')
                  or (item_type = 'task' and new_status = 'Done')),
  note          text check (note is null or char_length(note) <= 1000),
  link          text check (link is null or (char_length(link) <= 500 and link ~* '^https?://')),
  created_at    timestamptz not null default now(),
  -- Set by the sync only.
  processed_at  timestamptz,
  attempts      int not null default 0,
  error         text,
  check (new_status is not null or note is not null or link is not null)
);
create index if not exists member_updates_pending_idx on public.member_updates (created_at) where processed_at is null;
create index if not exists member_updates_artist_idx on public.member_updates (artist_id);

alter table public.member_updates enable row level security;

drop policy if exists "own updates" on public.member_updates;
create policy "own updates" on public.member_updates
  for select to authenticated
  using (artist_id = private.current_artist_id());

-- Own items only. Takes must still be open. Tasks must be assigned to you
-- (Crew tasks without your name on them stay read only).
drop policy if exists "update my open items" on public.member_updates;
create policy "update my open items" on public.member_updates
  for insert to authenticated
  with check (
    artist_id = private.current_artist_id()
    and (
      (item_type = 'take' and exists (
        select 1 from public.takes t
        where t.id = item_id
          and private.current_artist_id() = any (t.artist_ids)
          and coalesce(t.status, 'Owed') in ('Owed', 'Needs Decision')))
      or
      (item_type = 'task' and exists (
        select 1 from public.tasks k
        where k.id = item_id
          and private.current_artist_id() = any (k.assignee_ids)))
    )
  );

revoke all on public.member_updates from anon, authenticated;
grant select (id, item_type, item_id, new_status, note, link, created_at, processed_at, attempts, error)
  on public.member_updates to authenticated;
grant insert (item_type, item_id, new_status, note, link) on public.member_updates to authenticated;
grant all on public.member_updates to service_role;

-- V3: project funding -------------------------------------------------

create table if not exists public.funding_stages (
  id            uuid primary key,              -- Notion page id
  project_id    uuid,                          -- Music Projects page id
  project_name  text,
  stage_number  int,
  name          text not null,
  status        text,                          -- Not started, Underway, Complete
  raised        numeric not null default 0,
  synced_at     timestamptz not null
);

create table if not exists public.funding_items (
  id         uuid primary key,                 -- Notion page id
  stage_id   uuid,
  name       text not null,
  quote      numeric,                          -- null until there's a price
  status     text,                             -- Needs quote, Quoted, Paid
  notes      text,
  synced_at  timestamptz not null
);
create index if not exists funding_items_stage_idx on public.funding_items (stage_id);

create table if not exists public.contributions (
  id              uuid primary key,            -- Notion page id
  artist_id       uuid,                        -- null for family loans and anyone without an Artists record
  project_id      uuid,
  stage_id        uuid,
  amount          numeric,                     -- null until the amount is known
  type            text,                        -- Crew, Crewmunity, Family loan
  repayment       text,                        -- Owed, Repaid, Not repaid
  contributed_on  date,
  synced_at       timestamptz not null
);
create index if not exists contributions_artist_idx on public.contributions (artist_id);

alter table public.funding_stages enable row level security;
alter table public.funding_items  enable row level security;
alter table public.contributions  enable row level security;

drop policy if exists "linked members see stages" on public.funding_stages;
create policy "linked members see stages" on public.funding_stages
  for select to authenticated
  using (private.current_artist_id() is not null);

drop policy if exists "linked members see items" on public.funding_items;
create policy "linked members see items" on public.funding_items
  for select to authenticated
  using (private.current_artist_id() is not null);

drop policy if exists "own contributions" on public.contributions;
create policy "own contributions" on public.contributions
  for select to authenticated
  using (artist_id = private.current_artist_id());

revoke all on public.funding_stages, public.funding_items, public.contributions from anon, authenticated;
grant select on public.funding_stages, public.funding_items, public.contributions to authenticated;
grant all on public.funding_stages, public.funding_items, public.contributions to service_role;
