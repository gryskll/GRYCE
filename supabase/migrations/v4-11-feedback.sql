-- gryCE v0.4.36: demo feedback that gets noticed and rewarded.
-- Feedback can be longer and carry quick tags (Hook, Bass, ...). The member who
-- shared the demo can mark a piece of feedback "This helped". That mark is what
-- counts for rewards: a thank-you notice for the giver, Crew Ear counts and
-- badges, and the monthly Crew Ears shout-out in Crew news.
-- Safe to run more than once.

alter table public.demo_reactions add column if not exists tags text[] not null default '{}';
alter table public.demo_reactions add column if not exists helpful_at timestamptz;
alter table public.demo_reactions add column if not exists helpful_seen_at timestamptz;
comment on column public.demo_reactions.tags is 'Quick tags on the feedback: what it''s about (Hook, Bass, Drums, Vocals, Mix, Arrangement, Vibe).';
comment on column public.demo_reactions.helpful_at is 'When the member who shared the demo marked this feedback helpful. Set only through mark_feedback_helpful().';
comment on column public.demo_reactions.helpful_seen_at is 'When the giver saw the thank-you notice on Home. Cleared when a new helpful mark lands.';

alter table public.demo_reactions drop constraint if exists demo_reactions_tags;
alter table public.demo_reactions add constraint demo_reactions_tags
  check (tags <@ array['Hook', 'Bass', 'Drums', 'Vocals', 'Mix', 'Arrangement', 'Vibe']::text[]);

-- Longer feedback: 280 characters was too tight for real notes.
do $$
declare c text;
begin
  for c in select conname from pg_constraint
    where conrelid = 'public.demo_reactions'::regclass and contype = 'c'
      and pg_get_constraintdef(oid) like '%char_length(comment)%'
  loop
    execute format('alter table public.demo_reactions drop constraint %I', c);
  end loop;
end $$;
alter table public.demo_reactions add constraint demo_reactions_comment_length check (char_length(comment) <= 1000);

drop trigger if exists demo_reaction_touch on public.demo_reactions;
create trigger demo_reaction_touch before update of reaction, comment, tags on public.demo_reactions
  for each row execute function private.demo_reaction_touch();

grant insert (demo_id, reaction, comment, tags) on public.demo_reactions to authenticated;
grant update (reaction, comment, tags) on public.demo_reactions to authenticated;

-- Comments now carry who wrote them, the tags and the helpful mark.
drop function if exists public.demo_comments();
create function public.demo_comments()
returns table (demo_id uuid, artist_id uuid, who text, reaction text, comment text, tags text[], helpful boolean, updated_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select r.demo_id, r.artist_id, a.name, r.reaction, r.comment, r.tags, r.helpful_at is not null, r.updated_at
  from public.demo_reactions r
  join public.demos d on d.id = r.demo_id
  join public.artists a on a.id = r.artist_id
  where (r.comment is not null or cardinality(r.tags) > 0)
    and (d.artist_id = private.current_artist_id() or private.is_leadership())
  order by r.updated_at desc
$$;

-- The member who shared the demo marks (or unmarks) a piece of feedback helpful.
create or replace function public.mark_feedback_helpful(p_demo uuid, p_artist uuid, p_helpful boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if private.viewing_as() is not null then
    raise exception 'Read only while viewing as someone.';
  end if;
  if not exists (select 1 from public.demos d where d.id = p_demo and d.artist_id = private.current_artist_id()) then
    raise exception 'Only the member who shared this demo can mark feedback helpful.';
  end if;
  update public.demo_reactions
     set helpful_at = case when p_helpful then coalesce(helpful_at, now()) end,
         helpful_seen_at = case when p_helpful then helpful_seen_at end
   where demo_id = p_demo and artist_id = p_artist and artist_id <> private.current_artist_id();
end $$;

-- Thank-you notices: your feedback someone marked helpful that you haven't seen.
create or replace function public.my_feedback_thanks()
returns table (demo_id uuid, title text, sharer text, helpful_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select d.id, d.title, a.name, r.helpful_at
  from public.demo_reactions r
  join public.demos d on d.id = r.demo_id
  join public.artists a on a.id = d.artist_id
  where r.artist_id = private.current_artist_id()
    and r.helpful_at is not null and r.helpful_seen_at is null
  order by r.helpful_at desc
$$;

create or replace function public.seen_feedback_thanks()
returns void language plpgsql security definer set search_path = '' as $$
begin
  if private.viewing_as() is not null then return; end if;
  update public.demo_reactions set helpful_seen_at = now()
   where artist_id = private.current_artist_id() and helpful_at is not null and helpful_seen_at is null;
end $$;

-- Crew Ears: who gives feedback and how often it helped. Everyone signed in sees it.
create or replace function public.crew_ears()
returns table (artist_id uuid, name text, feedback int, helpful int, helpful_this_month int, helpful_last_month int)
language sql stable security definer set search_path = '' as $$
  select r.artist_id, a.name,
    count(*) filter (where r.comment is not null or cardinality(r.tags) > 0)::int,
    count(r.helpful_at)::int,
    count(r.helpful_at) filter (where r.helpful_at >= date_trunc('month', now()))::int,
    count(r.helpful_at) filter (where r.helpful_at >= date_trunc('month', now()) - interval '1 month'
                                  and r.helpful_at < date_trunc('month', now()))::int
  from public.demo_reactions r
  join public.artists a on a.id = r.artist_id
  where private.current_artist_id() is not null
  group by r.artist_id, a.name
$$;

revoke all on function public.demo_comments(), public.mark_feedback_helpful(uuid, uuid, boolean),
  public.my_feedback_thanks(), public.seen_feedback_thanks(), public.crew_ears() from public, anon;
grant execute on function public.demo_comments(), public.mark_feedback_helpful(uuid, uuid, boolean),
  public.my_feedback_thanks(), public.seen_feedback_thanks(), public.crew_ears() to authenticated;

comment on function public.demo_comments() is 'Demo owners and Leadership. Feedback on demos, with names, tags and whether the owner marked it helpful.';
comment on function public.mark_feedback_helpful(uuid, uuid, boolean) is 'The member who shared a demo marks one member''s feedback helpful, or clears it. Blocked while viewing as someone.';
comment on function public.my_feedback_thanks() is 'Signed-in member. Their feedback that was marked helpful and not seen yet: the thank-you notices on Home.';
comment on function public.seen_feedback_thanks() is 'Signed-in member. Clears their thank-you notices. Does nothing while viewing as someone.';
comment on function public.crew_ears() is 'Signed-in members. Per member: feedback given, marked helpful in total, this month and last month. Drives Crew Ear badges and the monthly shout-out.';
