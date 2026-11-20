-- gryCE v0.4.13: every GRYSKLL project, so the whole crew sees what's in the pipeline.
-- Run in Supabase: SQL Editor > New query > paste > Run. Safe to re-run.
-- Names, status, type, dates and song counts only. Every signed-in member sees it.
-- The full project card (songs, outstanding, funding) still comes from public.projects.

create table if not exists public.project_index (
  id             uuid primary key,       -- Notion page id
  name           text not null,
  status         text,                   -- Concept, Planning, In Production, Mixing & Mastering, Released
  type           text,                   -- Album, EP, Single, Mixtape...
  release_date   date,
  show_in_gryce  boolean not null default false,
  song_count     int not null default 0,
  released_count int not null default 0,
  synced_at      timestamptz not null
);

alter table public.project_index enable row level security;

drop policy if exists "leadership sees all projects" on public.project_index;
drop policy if exists "members see all projects" on public.project_index;
create policy "members see all projects" on public.project_index
  for select to authenticated
  using (private.current_artist_id() is not null);

revoke all on public.project_index from anon, authenticated;
grant select on public.project_index to authenticated;
grant all on public.project_index to service_role;

-- v0.4.14: Leadership Only. Projects still being sorted out show only to Leadership.
alter table public.project_index add column if not exists leadership_only boolean not null default false;

drop policy if exists "members see all projects" on public.project_index;
create policy "members see all projects" on public.project_index
  for select to authenticated
  using (private.current_artist_id() is not null and (not leadership_only or private.is_leadership()));

-- v0.4.15: project cards open to a page with the project's songs.
alter table public.project_index add column if not exists description text;
alter table public.project_index add column if not exists songs jsonb not null default '[]'::jsonb;  -- [{name, stage, released}]
