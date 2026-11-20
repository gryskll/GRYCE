-- gryCE v0.4.19: View as, read only, for Support.
-- A Support member (Artists checkbox "Support" in Notion) can see gryCE exactly
-- as another member sees it, to help them. It's read only and every view is logged.
--
-- How it works: every access rule asks private.current_artist_id() whose rows to
-- show. While a Support member has an open view-as session, that function answers
-- with the member being viewed, so every existing rule applies unchanged.
-- Writes (updates, acknowledgements, ISRC codes) are refused while viewing.
-- A session ends when the Support member taps Exit, or after 30 minutes.
--
-- Run in Supabase: SQL Editor > New query > paste > Run. Safe to re-run.

alter table public.artists add column if not exists support boolean not null default false;
comment on column public.artists.support is 'Notion checkbox "Support". Can use View as to see gryCE as another member, read only.';

-- Who is actually signed in, ignoring View as. Same match current_artist_id() used before.
create or replace function private.signed_in_artist_id()
returns uuid language sql stable security definer set search_path = '' as $$
  select a.id
  from public.artists a
  where a.email is not null
    and lower(a.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  limit 1
$$;

-- The log, and the open session if there is one.
create table if not exists public.view_as_sessions (
  id         bigint generated always as identity primary key,
  viewer_id  uuid not null references public.artists (id) on delete cascade,
  target_id  uuid not null references public.artists (id) on delete cascade,
  started_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '30 minutes',
  ended_at   timestamptz
);
create index if not exists view_as_sessions_open on public.view_as_sessions (viewer_id) where ended_at is null;
alter table public.view_as_sessions enable row level security;
comment on table public.view_as_sessions is
  'Every View as session: which Support member looked at whose gryCE, and when. Written only by start_view_as() and stop_view_as(). Leadership can read it.';

-- The member being viewed, or null. Only for Support members with an open, unexpired session.
create or replace function private.viewing_as()
returns uuid language sql stable security definer set search_path = '' as $$
  select s.target_id
  from public.view_as_sessions s
  join public.artists v on v.id = s.viewer_id
  where s.viewer_id = private.signed_in_artist_id()
    and v.support
    and s.ended_at is null
    and s.expires_at > now()
  order by s.started_at desc
  limit 1
$$;

-- Whose rows to show. Every access rule uses this.
create or replace function private.current_artist_id()
returns uuid language sql stable security definer set search_path = '' as $$
  select coalesce(private.viewing_as(), private.signed_in_artist_id())
$$;

-- Leadership reads the log as themselves, even mid View as.
create or replace function private.signed_in_is_leadership()
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select a.leadership from public.artists a where a.id = private.signed_in_artist_id()), false)
$$;

drop policy if exists "leadership reads view-as log" on public.view_as_sessions;
create policy "leadership reads view-as log" on public.view_as_sessions for select to authenticated
  using (private.signed_in_is_leadership());
grant select on public.view_as_sessions to authenticated;

-- Writes are refused while viewing as someone.
drop policy if exists "update my open items" on public.member_updates;
create policy "update my open items" on public.member_updates for insert to authenticated
  with check (
    private.viewing_as() is null
    and artist_id = private.current_artist_id()
    and (
      (item_type = 'take' and exists (
        select 1 from public.takes t
        where t.id = member_updates.item_id
          and private.current_artist_id() = any (t.artist_ids)
          and coalesce(t.status, 'Owed') = any (array['Owed', 'Needs Decision'])))
      or (item_type = 'task' and exists (
        select 1 from public.tasks k
        where k.id = member_updates.item_id
          and private.current_artist_id() = any (k.assignee_ids)))
    ));

drop policy if exists "ack what I can see" on public.announcement_acks;
create policy "ack what I can see" on public.announcement_acks for insert to authenticated
  with check (
    private.viewing_as() is null
    and artist_id = private.current_artist_id()
    and exists (select 1 from public.announcements a where a.id = announcement_acks.announcement_id));

create or replace function public.issue_isrc(p_song_id uuid, p_kind text default 'Original')
returns text language plpgsql security definer set search_path = '' as $function$
declare
  me     uuid := private.current_artist_id();
  yy     text := to_char(now() at time zone 'America/New_York', 'YY');
  next_n int;
  new_code text;
begin
  if private.viewing_as() is not null then
    raise exception 'You''re viewing as someone else. Exit View as to issue codes.';
  end if;
  if me is null or not private.is_isrc_admin() then
    raise exception 'Only ISRC Admins can issue codes.';
  end if;
  if p_kind not in ('Original', 'Reissue') then
    raise exception 'Kind must be Original or Reissue.';
  end if;
  if not exists (select 1 from public.songs s where s.id = p_song_id) then
    raise exception 'That song isn''t in gryCE yet. Add it in Notion and wait for the next sync.';
  end if;

  perform pg_advisory_xact_lock(hashtext('gryce_isrc'));

  if exists (select 1 from public.isrc_codes c where c.song_id = p_song_id and c.kind = p_kind)
     or exists (select 1 from public.songs s where s.id = p_song_id
                and case when p_kind = 'Original' then s.isrc else s.isrc_reissue end is not null) then
    raise exception 'This song already has an % code.', lower(p_kind);
  end if;

  select coalesce(max(substr(x.code, 11, 5)::int), 0) + 1 into next_n
  from (
    select c.code from public.isrc_codes c
    union all select s.isrc from public.songs s where s.isrc is not null
    union all select s.isrc_reissue from public.songs s where s.isrc_reissue is not null
  ) x
  where x.code ~ '^QT-3ZB-[0-9]{2}-[0-9]{5}$' and substr(x.code, 8, 2) = yy;

  if next_n > 99999 then
    raise exception 'No codes left for 20%.', yy;
  end if;

  new_code := 'QT-3ZB-' || yy || '-' || lpad(next_n::text, 5, '0');
  insert into public.isrc_codes (code, song_id, kind, issued_by) values (new_code, p_song_id, p_kind, me);
  return new_code;
end;
$function$;

-- For the site: am I Support, and who am I viewing as right now?
create or replace function public.support_status()
returns table (is_support boolean, viewing_id uuid, viewing_name text, expires_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select coalesce(v.support, false), t.id, t.name, s.expires_at
  from (select private.signed_in_artist_id() as me) x
  left join public.artists v on v.id = x.me
  left join lateral (
    select s.* from public.view_as_sessions s
    where s.viewer_id = x.me and s.ended_at is null and s.expires_at > now()
    order by s.started_at desc limit 1) s on v.support
  left join public.artists t on t.id = s.target_id
$$;

-- Support only: the linked members you can view as.
create or replace function public.support_members()
returns table (id uuid, name text)
language sql stable security definer set search_path = '' as $$
  select a.id, a.name from public.artists a
  where a.email is not null
    and a.id <> private.signed_in_artist_id()
    and exists (select 1 from public.artists v where v.id = private.signed_in_artist_id() and v.support)
  order by a.name
$$;

create or replace function public.start_view_as(p_artist_id uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare
  me uuid := private.signed_in_artist_id();
  who text;
begin
  if me is null or not exists (select 1 from public.artists a where a.id = me and a.support) then
    raise exception 'Only Support can use View as.';
  end if;
  if p_artist_id = me then
    raise exception 'That''s you. Exit View as to see your own page.';
  end if;
  select a.name into who from public.artists a where a.id = p_artist_id and a.email is not null;
  if who is null then
    raise exception 'That member isn''t linked to gryCE.';
  end if;
  update public.view_as_sessions set ended_at = now() where viewer_id = me and ended_at is null;
  insert into public.view_as_sessions (viewer_id, target_id) values (me, p_artist_id);
  return who;
end;
$$;

create or replace function public.stop_view_as()
returns void language sql security definer set search_path = '' as $$
  update public.view_as_sessions set ended_at = now()
  where viewer_id = private.signed_in_artist_id() and ended_at is null
$$;

revoke all on function public.support_status(), public.support_members(), public.start_view_as(uuid), public.stop_view_as() from public, anon;
grant execute on function public.support_status(), public.support_members(), public.start_view_as(uuid), public.stop_view_as() to authenticated;

comment on function public.start_view_as(uuid) is 'Support only. Starts a 30-minute read-only View as session for a linked member and logs it.';
comment on function public.stop_view_as() is 'Ends your View as session.';
comment on function public.support_status() is 'Whether you are Support, and who you are viewing as right now.';
comment on function public.support_members() is 'Support only. Linked members you can view as.';
