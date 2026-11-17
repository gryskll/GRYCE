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
