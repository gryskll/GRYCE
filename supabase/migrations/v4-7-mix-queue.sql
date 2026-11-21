-- gryCE v0.4.24: Mix queue.
-- Every unreleased song in a mix stage, in the order the work happens, for the
-- people who run the queue (Artists checkbox "Mix Queue" in Notion: Q manages it,
-- Shaah backs him up). Shows each song's project, who's mixing and mastering it,
-- and any deliverables still holding it up.
-- Run in Supabase: SQL Editor > New query > paste > Run. Safe to re-run.

alter table public.artists add column if not exists mix_queue boolean not null default false;
comment on column public.artists.mix_queue is 'Notion checkbox "Mix Queue". Sees the Mix queue: every unreleased song in a mix stage.';

alter table public.songs add column if not exists project_id uuid;
comment on column public.songs.project_id is 'The song''s first Music Project in Notion. Used by the Mix queue.';

-- Follows View as like every other check: viewing a member shows what they see.
create or replace function private.is_mix_queue()
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select a.mix_queue from public.artists a where a.id = private.current_artist_id()), false)
$$;

create or replace function public.mix_queue()
returns table (
  song_id uuid, song text, stage text, queue_order int, project text,
  mixers text, mastering text, target_release_date date, owed jsonb
)
language sql stable security definer set search_path = '' as $$
  select
    s.id, s.name, s.development_stage,
    case s.development_stage
      when 'Mixing' then 1 when 'Mixing Prep' then 2 when 'Mastering' then 3
      when 'Re-Mastering' then 4 when 'Awaiting Mix Funding' then 5 end,
    p.name,
    (select string_agg(a.name, ', ' order by a.name) from public.song_credits c
       join public.artists a on a.id = c.artist_id where c.song_id = s.id and c.role = 'Mixing'),
    (select string_agg(a.name, ', ' order by a.name) from public.song_credits c
       join public.artists a on a.id = c.artist_id where c.song_id = s.id and c.role = 'Mastering'),
    s.target_release_date,
    coalesce((
      select jsonb_agg(jsonb_build_object('who', coalesce(a.name, 'Someone'), 'type', t.type, 'status', t.status) order by a.name)
      from public.takes t
      left join lateral unnest(t.artist_ids) x(id) on true
      left join public.artists a on a.id = x.id
      where t.song_id = s.id and coalesce(t.status, 'Owed') in ('Owed', 'Needs Decision', 'Submitted')
    ), '[]'::jsonb)
  from public.songs s
  left join public.project_index p on p.id = s.project_id
  where private.is_mix_queue()
    and s.development_stage in ('Mixing', 'Mixing Prep', 'Mastering', 'Re-Mastering', 'Awaiting Mix Funding')
    and coalesce(s.status, '') <> 'Released'
  order by 4, p.name nulls last, s.name
$$;

revoke all on function public.mix_queue() from public, anon;
grant execute on function public.mix_queue() to authenticated;
comment on function public.mix_queue() is 'Mix Queue members only. Every unreleased song in a mix stage, in work order, with project, mixer, mastering engineer and anything still owed.';
