-- gryCE v0.4.13: every project, for Leadership's Projects page.
-- Run in Supabase: SQL Editor > New query > paste > Run. Safe to re-run.
-- Members still see only Show in gryCE projects, through public.projects.

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
create policy "leadership sees all projects" on public.project_index
  for select to authenticated
  using (private.is_leadership());

revoke all on public.project_index from anon, authenticated;
grant select on public.project_index to authenticated;
grant all on public.project_index to service_role;
