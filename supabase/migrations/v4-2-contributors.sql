-- gryCE v0.4.9: every contribution names who gave it.
-- Run in Supabase: SQL Editor > New query > paste > Run. Safe to re-run. Needs v4-1 first.

-- The Contributor title from Notion, and the Supporters record it links to (if any).
-- Supporters' contact details stay in Notion. Only the name comes across.
alter table public.contributions add column if not exists contributor_name text;
alter table public.contributions add column if not exists supporter_id     uuid;

-- The return columns change, so the function is replaced, not altered.
drop function if exists public.leadership_contributions();
create function public.leadership_contributions()
returns table (
  id uuid, artist_name text, contributor_name text, linked boolean,
  project_name text, stage_name text,
  amount numeric, type text, repayment text, contributed_on date
)
language sql
stable
security definer
set search_path = ''
as $$
  select c.id, a.name, coalesce(a.name, c.contributor_name),
         (c.artist_id is not null or c.supporter_id is not null),
         coalesce(s.project_name, p.name), s.name,
         c.amount, c.type, c.repayment, c.contributed_on
  from public.contributions c
  left join public.artists a on a.id = c.artist_id
  left join public.funding_stages s on s.id = c.stage_id
  left join public.projects p on p.id = c.project_id
  where private.is_leadership()
  order by c.contributed_on desc nulls last, coalesce(a.name, c.contributor_name)
$$;

revoke all on function public.leadership_contributions() from public, anon;
grant execute on function public.leadership_contributions() to authenticated;

-- v0.4.10: gryCE Sync can't see Supporters (on purpose), so it reads the
-- Linked to Person formula on Contributions instead.
alter table public.contributions add column if not exists person_linked boolean;

create or replace function public.leadership_contributions()
returns table (
  id uuid, artist_name text, contributor_name text, linked boolean,
  project_name text, stage_name text,
  amount numeric, type text, repayment text, contributed_on date
)
language sql
stable
security definer
set search_path = ''
as $$
  select c.id, a.name, coalesce(a.name, c.contributor_name),
         coalesce(c.person_linked, c.artist_id is not null or c.supporter_id is not null),
         coalesce(s.project_name, p.name), s.name,
         c.amount, c.type, c.repayment, c.contributed_on
  from public.contributions c
  left join public.artists a on a.id = c.artist_id
  left join public.funding_stages s on s.id = c.stage_id
  left join public.projects p on p.id = c.project_id
  where private.is_leadership()
  order by c.contributed_on desc nulls last, coalesce(a.name, c.contributor_name)
$$;
