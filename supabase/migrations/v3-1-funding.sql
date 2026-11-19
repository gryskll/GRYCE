-- gryCE V3, step 1: project funding on the member dashboard.
-- Run in Supabase: SQL Editor > New query > paste > Run. Safe to re-run.
--
-- Synced from three Notion databases on the gryCE page: Funding Stages,
-- Funding Items and Contributions. Every linked member sees every stage and
-- item, dollar amounts included. Contributions are private: each member sees
-- only their own.

create table if not exists public.funding_stages (
  id            uuid primary key,              -- Notion page id
  project_id    uuid,                          -- Music Projects page id
  project_name  text,
  stage_number  int,
  name          text not null,
  status        text,                          -- Not started, Underway, Complete
  raised        numeric not null default 0,
  synced_at     timestamptz not null
);

create table if not exists public.funding_items (
  id         uuid primary key,                 -- Notion page id
  stage_id   uuid,
  name       text not null,
  quote      numeric,                          -- null until there's a price
  status     text,                             -- Needs quote, Quoted, Paid
  notes      text,
  synced_at  timestamptz not null
);
create index if not exists funding_items_stage_idx on public.funding_items (stage_id);

create table if not exists public.contributions (
  id              uuid primary key,            -- Notion page id
  artist_id       uuid,                        -- null for family loans and anyone without an Artists record
  project_id      uuid,
  stage_id        uuid,
  amount          numeric,                     -- null until the amount is known
  type            text,                        -- Crew, Crewmunity, Family loan
  repayment       text,                        -- Owed, Repaid, Not repaid
  contributed_on  date,
  synced_at       timestamptz not null
);
create index if not exists contributions_artist_idx on public.contributions (artist_id);

alter table public.funding_stages enable row level security;
alter table public.funding_items  enable row level security;
alter table public.contributions  enable row level security;

drop policy if exists "linked members see stages" on public.funding_stages;
create policy "linked members see stages" on public.funding_stages
  for select to authenticated
  using (private.current_artist_id() is not null);

drop policy if exists "linked members see items" on public.funding_items;
create policy "linked members see items" on public.funding_items
  for select to authenticated
  using (private.current_artist_id() is not null);

drop policy if exists "own contributions" on public.contributions;
create policy "own contributions" on public.contributions
  for select to authenticated
  using (artist_id = private.current_artist_id());

revoke all on public.funding_stages, public.funding_items, public.contributions from anon, authenticated;
grant select on public.funding_stages, public.funding_items, public.contributions to authenticated;
grant all on public.funding_stages, public.funding_items, public.contributions to service_role;
