-- gryCE v0.4.1: ISRC codes and the Leadership section.
-- Run in Supabase: SQL Editor > New query > paste > Run. Safe to re-run.
-- Needs V1 to V3 first.

-- Artists: who is on Leadership, who can issue ISRC codes, and past names.
-- Legal name, IPI, PRO, publisher and contact email stay in Notion. They are never copied here.
alter table public.artists add column if not exists leadership    boolean not null default false;
alter table public.artists add column if not exists isrc_admin    boolean not null default false;
alter table public.artists add column if not exists also_known_as text;

grant select (id, name, relation, roles, leadership, isrc_admin, also_known_as) on public.artists to authenticated;

-- Songs: both ISRC fields from Notion.
alter table public.songs add column if not exists isrc         text;
alter table public.songs add column if not exists isrc_reissue text;

-- Who is signed in, part two ---------------------------------------------

create or replace function private.is_leadership()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select a.leadership from public.artists a where a.id = private.current_artist_id()), false)
$$;

create or replace function private.is_isrc_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select a.isrc_admin from public.artists a where a.id = private.current_artist_id()), false)
$$;

revoke all on function private.is_leadership(), private.is_isrc_admin() from public, anon;
grant execute on function private.is_leadership(), private.is_isrc_admin() to authenticated;

-- ISRC Admins see every song, so they can give any song a code.
drop policy if exists "isrc admins see songs" on public.songs;
create policy "isrc admins see songs" on public.songs
  for select to authenticated
  using (private.is_isrc_admin());

-- ISRC codes ----------------------------------------------------------------
-- One row per code. The sync loads every code already in Notion, so numbering
-- carries on from the last one. New codes come only from public.issue_isrc(),
-- which refuses duplicates and hands out the next number even if two admins
-- click at the same moment. The sync writes new codes to the song in Notion.

create table if not exists public.isrc_codes (
  code          text primary key check (code ~ '^QT-3ZB-[0-9]{2}-[0-9]{5}$'),
  song_id       uuid not null,
  kind          text not null default 'Original' check (kind in ('Original', 'Reissue')),
  issued_by     uuid,                     -- artist id. Null for codes loaded from Notion.
  issued_at     timestamptz not null default now(),
  pushed_at     timestamptz,              -- when the sync wrote it to Notion
  push_attempts int not null default 0,
  push_error    text
);
create index if not exists isrc_codes_song_idx on public.isrc_codes (song_id);
create index if not exists isrc_codes_pending_idx on public.isrc_codes (issued_at) where pushed_at is null and issued_by is not null;

alter table public.isrc_codes enable row level security;

drop policy if exists "isrc admins see codes" on public.isrc_codes;
create policy "isrc admins see codes" on public.isrc_codes
  for select to authenticated
  using (private.is_isrc_admin());

revoke all on public.isrc_codes from anon, authenticated;
grant select on public.isrc_codes to authenticated;
grant all on public.isrc_codes to service_role;

create or replace function public.issue_isrc(p_song_id uuid, p_kind text default 'Original')
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  me     uuid := private.current_artist_id();
  yy     text := to_char(now() at time zone 'America/New_York', 'YY');
  next_n int;
  new_code text;
begin
  if me is null or not private.is_isrc_admin() then
    raise exception 'Only ISRC Admins can issue codes.';
  end if;
  if p_kind not in ('Original', 'Reissue') then
    raise exception 'Kind must be Original or Reissue.';
  end if;
  if not exists (select 1 from public.songs s where s.id = p_song_id) then
    raise exception 'That song isn''t in gryCE yet. Add it in Notion and wait for the next sync.';
  end if;

  -- One issuer at a time, so two clicks can't get the same number.
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
$$;

revoke all on function public.issue_isrc(uuid, text) from public, anon;
grant execute on function public.issue_isrc(uuid, text) to authenticated;

-- Leadership ------------------------------------------------------------------

-- The GRYSCO Document Number Registry. Leadership only.
create table if not exists public.documents (
  id              uuid primary key,       -- Notion page id
  number          text not null,          -- GRY-DOC-001
  name            text,
  status          text,                   -- Reserved, Draft, Submitted, Approved, Retired
  date_submitted  date,
  date_approved   date,
  link            text,
  notes           text,
  synced_at       timestamptz not null
);

alter table public.documents enable row level security;

drop policy if exists "leadership sees documents" on public.documents;
create policy "leadership sees documents" on public.documents
  for select to authenticated
  using (private.is_leadership());

revoke all on public.documents from anon, authenticated;
grant select on public.documents to authenticated;
grant all on public.documents to service_role;

-- Leadership sees every contribution, with who and which project.
-- Everyone else still sees only their own through the contributions table.
create or replace function public.leadership_contributions()
returns table (
  id uuid, artist_name text, project_name text, stage_name text,
  amount numeric, type text, repayment text, contributed_on date
)
language sql
stable
security definer
set search_path = ''
as $$
  select c.id, a.name, coalesce(s.project_name, p.name), s.name,
         c.amount, c.type, c.repayment, c.contributed_on
  from public.contributions c
  left join public.artists a on a.id = c.artist_id
  left join public.funding_stages s on s.id = c.stage_id
  left join public.projects p on p.id = c.project_id
  where private.is_leadership()
  order by c.contributed_on desc nulls last, a.name
$$;

revoke all on function public.leadership_contributions() from public, anon;
grant execute on function public.leadership_contributions() to authenticated;

-- Housekeeping ---------------------------------------------------------------
-- Supabase's auto-enable RLS helper only needs to run as an event trigger.
-- Nobody should be able to call it through the API.
do $$
begin
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
             where n.nspname = 'public' and p.proname = 'rls_auto_enable') then
    revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
  end if;
end $$;
