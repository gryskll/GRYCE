-- gryCE v0.4.26: demos that become GRYSKLL songs.
-- The member picks how they'd be credited when they share a demo. When Leadership
-- sets the demo to Picked up in Notion, the sync creates the song in Songs
-- (Idea/Concept, credited by that role), links it to the demo, and gryCE shows it.
-- Also fixes v0.4.24: members need to read their own Mix Queue checkbox. Without
-- this grant the profile query fails with "permission denied for table artists".
-- Run in Supabase: SQL Editor > New query > paste > Run. Safe to re-run.

grant select (mix_queue) on public.artists to authenticated;

alter table public.demos add column if not exists credit_role text;
alter table public.demos drop constraint if exists demos_credit_role;
alter table public.demos add constraint demos_credit_role
  check (credit_role is null or credit_role in ('Producer', 'Vocals', 'Producer and vocals'));
alter table public.demos add column if not exists song_id uuid;
comment on column public.demos.credit_role is 'How the member wants to be credited if the demo becomes a song: Producer, Vocals, or Producer and vocals.';
comment on column public.demos.song_id is 'The Songs page this demo became, read back from the Demos database in Notion.';

grant insert (title, link, note, credit_role) on public.demos to authenticated;

-- Adds the song's name, so gryCE can say what the demo became.
drop function if exists public.demo_summary();
create function public.demo_summary()
returns table (demo_id uuid, artist_name text, feeling int, want_on int, not_for_me int, comments int, song_name text)
language sql stable security definer set search_path = '' as $$
  select d.id, a.name,
    count(r.reaction) filter (where r.reaction = 'feeling')::int,
    count(r.reaction) filter (where r.reaction = 'want_on')::int,
    count(r.reaction) filter (where r.reaction = 'not_for_me')::int,
    count(r.comment)::int,
    (select s.name from public.songs s where s.id = d.song_id)
  from public.demos d
  join public.artists a on a.id = d.artist_id
  left join public.demo_reactions r on r.demo_id = d.id
  where private.current_artist_id() is not null
    and (not d.hidden or d.artist_id = private.current_artist_id() or private.is_leadership())
  group by d.id, a.name
$$;
revoke all on function public.demo_summary() from public, anon;
grant execute on function public.demo_summary() to authenticated;
comment on function public.demo_summary() is 'Signed-in members. Who shared each demo they can see, its reaction counts, and the song it became.';
