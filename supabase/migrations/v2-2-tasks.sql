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
