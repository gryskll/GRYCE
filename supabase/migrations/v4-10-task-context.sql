-- gryCE v0.4.28: context on your own tasks.
-- Project, Priority and Waiting on come over from GRYSKLL Tasks so a long task
-- list can be grouped by project and ordered by priority. Notes still never sync.
-- Run in Supabase: SQL Editor > New query > paste > Run. Safe to re-run.

alter table public.tasks add column if not exists project text;
alter table public.tasks add column if not exists priority text;
alter table public.tasks add column if not exists waiting_on text;
comment on column public.tasks.project is 'Notion select "Project". gryCE groups your tasks by it.';
comment on column public.tasks.priority is 'Notion select "Priority": Now, This week or Later.';
comment on column public.tasks.waiting_on is 'Notion text "Waiting on": who or what the task is waiting for.';
