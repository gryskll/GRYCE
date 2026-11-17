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
