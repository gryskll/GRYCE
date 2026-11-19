-- gryCE v0.3.2: Project updates, and Requests apart from Crew news.
-- Run in Supabase: SQL Editor > New query > paste > Run. Safe to re-run.
-- Run this before the next sync, or announcements stop updating until you do.

-- Request: something members owe, shown under What you owe. News: just to read.
alter table public.announcements add column if not exists type text not null default 'News';

-- Projects with Show in gryCE ticked in Music Projects.
-- songs holds each song's name and Development Stage, worked out by the sync.
-- Every linked member sees these.
create table if not exists public.projects (
  id            uuid primary key,              -- Notion page id
  name          text not null,
  status        text,
  release_date  date,
  summary       text,                          -- the gryCE Update field
  songs         jsonb not null default '[]',   -- [{ "name": ..., "stage": ... }]
  synced_at     timestamptz not null
);

alter table public.projects enable row level security;

drop policy if exists "linked members see projects" on public.projects;
create policy "linked members see projects" on public.projects
  for select to authenticated
  using (private.current_artist_id() is not null);

revoke all on public.projects from anon, authenticated;
grant select on public.projects to authenticated;
grant all on public.projects to service_role;
