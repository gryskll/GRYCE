-- gryCE v0.4.17: group efforts. A crew task can link to the takes it depends on,
-- and everyone sees the progress: how many are in, who's in, who's still to go.
-- Run in Supabase: SQL Editor > New query > paste > Run. Safe to re-run.

alter table public.tasks add column if not exists linked_take_ids uuid[] not null default '{}';
alter table public.tasks add column if not exists gryce_note text;  -- crew-facing line. Notion Notes stays private.
alter table public.tasks add column if not exists link  text;

-- Takes stay private to the people on them. This shares only what a group effort
-- needs: who, which song, and where it stands. Only for takes linked to crew tasks.
create or replace function public.group_effort_takes()
returns table (task_id uuid, take_id uuid, who text, song text, type text, status text)
language sql
stable
security definer
set search_path = ''
as $$
  select k.id, t.id,
         (select string_agg(a.name, ' & ' order by a.name) from public.artists a where a.id = any(t.artist_ids)),
         s.name, t.type, t.status
  from public.tasks k
  join public.takes t on t.id = any(k.linked_take_ids)
  left join public.songs s on s.id = t.song_id
  where k.is_crew and private.current_artist_id() is not null
$$;

revoke all on function public.group_effort_takes() from public, anon;
grant execute on function public.group_effort_takes() to authenticated;
