-- gryCE v0.4.25: edit the Mix queue from gryCE, and share demos with the crew.
-- Run in Supabase: SQL Editor > New query > paste > Run. Safe to re-run.
--
-- Mix edits follow the same outbox pattern as member updates: gryCE writes a row,
-- the sync carries it to Notion (the record) and leaves a comment saying who did it.
-- Demos start in gryCE. The sync creates their Notion page in the Demos database,
-- copies reactions there as comments, and reads Status and Hidden back.
-- Nothing here can be written while a Support member is using View as.

-- Mix edits ------------------------------------------------------------------

-- Stages someone can move a song to from the Mix queue. Release Ready takes it out of the queue.
create or replace function private.mix_edit_stages()
returns text[] language sql immutable set search_path = '' as $$
  select array['Awaiting Mix Funding', 'Mixing Prep', 'Mixing', 'Mastering', 'Re-Mastering', 'Release Ready']
$$;

create table if not exists public.song_updates (
  id            bigint generated always as identity primary key,
  song_id       uuid not null,
  artist_id     uuid not null default private.current_artist_id() references public.artists (id) on delete cascade,
  new_stage     text,
  mixer_ids     uuid[],          -- null means leave as is; an empty list clears it
  mastering_ids uuid[],
  created_at    timestamptz not null default now(),
  processed_at  timestamptz,
  attempts      int not null default 0,
  error         text,
  constraint song_updates_something check (new_stage is not null or mixer_ids is not null or mastering_ids is not null)
);
create index if not exists song_updates_open on public.song_updates (song_id) where processed_at is null;
alter table public.song_updates enable row level security;
comment on table public.song_updates is
  'Outbox for Mix queue edits: stage, mixer, mastering engineer. Mix Queue members write here from gryCE; the sync updates the song in Notion, leaves a comment, then sets processed_at. Gives up after 5 attempts.';

drop policy if exists "mix queue sees song updates" on public.song_updates;
create policy "mix queue sees song updates" on public.song_updates for select to authenticated
  using (private.is_mix_queue());

drop policy if exists "mix queue edits queued songs" on public.song_updates;
create policy "mix queue edits queued songs" on public.song_updates for insert to authenticated
  with check (
    private.viewing_as() is null
    and private.is_mix_queue()
    and artist_id = private.current_artist_id()
    and (new_stage is null or new_stage = any (private.mix_edit_stages()))
    and exists (
      select 1 from public.songs s
      where s.id = song_updates.song_id
        and s.development_stage in ('Mixing', 'Mixing Prep', 'Mastering', 'Re-Mastering', 'Awaiting Mix Funding')
        and coalesce(s.status, '') <> 'Released'));

grant select on public.song_updates to authenticated;
grant insert (song_id, new_stage, mixer_ids, mastering_ids) on public.song_updates to authenticated;
grant all on public.song_updates to service_role;

-- People who can be picked as mixer or mastering engineer: Artists with that Role,
-- anyone already credited that way, and the Mix Queue members themselves.
create or replace function public.mix_people()
returns table (id uuid, name text, mixes boolean, masters boolean)
language sql stable security definer set search_path = '' as $$
  select a.id, a.name,
    'Mixing Engineer' = any (coalesce(a.roles, '{}')) or a.mix_queue
      or exists (select 1 from public.song_credits c where c.artist_id = a.id and c.role = 'Mixing'),
    'Mastering Engineer' = any (coalesce(a.roles, '{}'))
      or exists (select 1 from public.song_credits c where c.artist_id = a.id and c.role = 'Mastering')
  from public.artists a
  where private.is_mix_queue()
    and ('Mixing Engineer' = any (coalesce(a.roles, '{}')) or 'Mastering Engineer' = any (coalesce(a.roles, '{}')) or a.mix_queue
      or exists (select 1 from public.song_credits c where c.artist_id = a.id and c.role in ('Mixing', 'Mastering')))
  order by a.name
$$;

-- The queue now also returns who is credited (ids, for the edit form) and any
-- change still on its way to Notion.
drop function if exists public.mix_queue();
create function public.mix_queue()
returns table (
  song_id uuid, song text, stage text, queue_order int, project text,
  mixers text, mastering text, mixer_ids uuid[], mastering_ids uuid[],
  target_release_date date, owed jsonb, pending jsonb
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
    coalesce((select array_agg(c.artist_id) from public.song_credits c where c.song_id = s.id and c.role = 'Mixing'), '{}'),
    coalesce((select array_agg(c.artist_id) from public.song_credits c where c.song_id = s.id and c.role = 'Mastering'), '{}'),
    s.target_release_date,
    coalesce((
      select jsonb_agg(jsonb_build_object('who', coalesce(a.name, 'Someone'), 'type', t.type, 'status', t.status) order by a.name)
      from public.takes t
      left join lateral unnest(t.artist_ids) x(id) on true
      left join public.artists a on a.id = x.id
      where t.song_id = s.id and coalesce(t.status, 'Owed') in ('Owed', 'Needs Decision', 'Submitted')
    ), '[]'::jsonb),
    (select jsonb_build_object('stage', u.new_stage, 'mixer_ids', u.mixer_ids, 'mastering_ids', u.mastering_ids,
              'by', (select a.name from public.artists a where a.id = u.artist_id), 'at', u.created_at, 'attempts', u.attempts)
       from public.song_updates u where u.song_id = s.id and u.processed_at is null
       order by u.created_at desc limit 1)
  from public.songs s
  left join public.project_index p on p.id = s.project_id
  where private.is_mix_queue()
    and s.development_stage in ('Mixing', 'Mixing Prep', 'Mastering', 'Re-Mastering', 'Awaiting Mix Funding')
    and coalesce(s.status, '') <> 'Released'
  order by 4, p.name nulls last, s.name
$$;

revoke all on function public.mix_queue(), public.mix_people() from public, anon;
grant execute on function public.mix_queue(), public.mix_people() to authenticated;
comment on function public.mix_queue() is 'Mix Queue members only. Every unreleased song in a mix stage, in work order, with project, mixer, mastering engineer, anything still owed, and any edit still on its way to Notion.';
comment on function public.mix_people() is 'Mix Queue members only. Who can be picked as mixer or mastering engineer.';

-- Demos ----------------------------------------------------------------------

create table if not exists public.demos (
  id             uuid primary key default gen_random_uuid(),
  artist_id      uuid not null default private.current_artist_id() references public.artists (id) on delete cascade,
  title          text not null check (char_length(title) between 1 and 120),
  link           text not null check (link ~* '^https://' and char_length(link) <= 500),
  note           text check (char_length(note) <= 1000),
  created_at     timestamptz not null default now(),
  status         text not null default 'New',
  hidden         boolean not null default false,
  notion_page_id uuid,
  pushed_at      timestamptz,
  push_attempts  int not null default 0,
  push_error     text
);
alter table public.demos enable row level security;
comment on table public.demos is
  'Demos members share in gryCE for crew consideration. Shown in Crew news. The sync creates each one''s page in the Notion Demos database and reads Status and Hidden back from it.';

drop policy if exists "crew sees demos" on public.demos;
create policy "crew sees demos" on public.demos for select to authenticated
  using (private.current_artist_id() is not null
         and (not hidden or artist_id = private.current_artist_id() or private.is_leadership()));

drop policy if exists "members share demos" on public.demos;
create policy "members share demos" on public.demos for insert to authenticated
  with check (private.viewing_as() is null and artist_id = private.current_artist_id());

grant select on public.demos to authenticated;
grant insert (title, link, note) on public.demos to authenticated;
grant all on public.demos to service_role;

create table if not exists public.demo_reactions (
  demo_id    uuid not null references public.demos (id) on delete cascade,
  artist_id  uuid not null default private.current_artist_id() references public.artists (id) on delete cascade,
  reaction   text not null check (reaction in ('feeling', 'want_on', 'not_for_me')),
  comment    text check (char_length(comment) <= 280),
  updated_at timestamptz not null default now(),
  pushed_at  timestamptz,
  primary key (demo_id, artist_id)
);
alter table public.demo_reactions enable row level security;
comment on table public.demo_reactions is
  'One reaction per member per demo, with an optional short comment. Everyone sees the counts (demo_summary). A comment is seen by the member who wrote it, the demo''s owner and Leadership, and goes to Notion as a comment.';

-- Changing a reaction sends it to Notion again.
create or replace function private.demo_reaction_touch()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  new.pushed_at := null;
  return new;
end $$;
drop trigger if exists demo_reaction_touch on public.demo_reactions;
create trigger demo_reaction_touch before update of reaction, comment on public.demo_reactions
  for each row execute function private.demo_reaction_touch();

drop policy if exists "see reactions you may see" on public.demo_reactions;
create policy "see reactions you may see" on public.demo_reactions for select to authenticated
  using (artist_id = private.current_artist_id()
         or private.is_leadership()
         or exists (select 1 from public.demos d where d.id = demo_reactions.demo_id and d.artist_id = private.current_artist_id()));

drop policy if exists "react to others' demos" on public.demo_reactions;
create policy "react to others' demos" on public.demo_reactions for insert to authenticated
  with check (private.viewing_as() is null
              and artist_id = private.current_artist_id()
              and exists (select 1 from public.demos d where d.id = demo_reactions.demo_id and d.artist_id <> private.current_artist_id() and not d.hidden));

drop policy if exists "change your reaction" on public.demo_reactions;
create policy "change your reaction" on public.demo_reactions for update to authenticated
  using (artist_id = private.current_artist_id())
  with check (private.viewing_as() is null and artist_id = private.current_artist_id());

grant select on public.demo_reactions to authenticated;
grant insert (demo_id, reaction, comment) on public.demo_reactions to authenticated;
grant update (reaction, comment) on public.demo_reactions to authenticated;
grant all on public.demo_reactions to service_role;

drop function if exists public.demo_summary();
create function public.demo_summary()
returns table (demo_id uuid, artist_name text, feeling int, want_on int, not_for_me int, comments int)
language sql stable security definer set search_path = '' as $$
  select d.id, a.name,
    count(r.reaction) filter (where r.reaction = 'feeling')::int,
    count(r.reaction) filter (where r.reaction = 'want_on')::int,
    count(r.reaction) filter (where r.reaction = 'not_for_me')::int,
    count(r.comment)::int
  from public.demos d
  join public.artists a on a.id = d.artist_id
  left join public.demo_reactions r on r.demo_id = d.id
  where private.current_artist_id() is not null
    and (not d.hidden or d.artist_id = private.current_artist_id() or private.is_leadership())
  group by d.id, a.name
$$;

-- Comments with names, for the people allowed to read them: the demo's owner and Leadership.
create or replace function public.demo_comments()
returns table (demo_id uuid, who text, reaction text, comment text, updated_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select r.demo_id, a.name, r.reaction, r.comment, r.updated_at
  from public.demo_reactions r
  join public.demos d on d.id = r.demo_id
  join public.artists a on a.id = r.artist_id
  where r.comment is not null
    and (d.artist_id = private.current_artist_id() or private.is_leadership())
  order by r.updated_at desc
$$;

revoke all on function public.demo_summary(), public.demo_comments() from public, anon;
grant execute on function public.demo_summary(), public.demo_comments() to authenticated;
comment on function public.demo_summary() is 'Signed-in members. Who shared each demo they can see, and its reaction counts.';
comment on function public.demo_comments() is 'Demo owners and Leadership. Comments on demos, with names.';
