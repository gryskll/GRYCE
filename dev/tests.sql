-- Database tests for gryCE's access rules. Run with dev/test-db.sh, never on Supabase.
-- Each check() raises an error with its name when it fails, which stops the run.
-- All names and data here are made up.

create or replace function pg_temp.check(name text, ok boolean) returns void language plpgsql as $$
begin
  if ok is not true then raise exception 'FAILED: %', name; end if;
  raise notice 'ok  %', name;
end $$;
-- "Sign in" as an email (or nobody with null), then act as a signed-in user.
create or replace function pg_temp.login(email text) returns void language sql as $$
  select set_config('test.jwt', coalesce(json_build_object('email', email)::text, '{}'), false)
$$;
set client_min_messages = notice;
\o /dev/null

-- Sample data, loaded as the database owner (like the sync does).
insert into public.artists (id, name, email, leadership, isrc_admin, support, synced_at) values
  ('00000000-0000-0000-0000-0000000000a1', 'Lead Support', 'lead@test', true,  true,  true,  now()),
  ('00000000-0000-0000-0000-0000000000a2', 'Member One',   'one@test',  false, false, false, now()),
  ('00000000-0000-0000-0000-0000000000a3', 'Member Two',   'two@test',  false, false, false, now()),
  ('00000000-0000-0000-0000-0000000000a4', 'No Login',     null,        false, false, false, now());
insert into public.songs (id, name, synced_at) values
  ('00000000-0000-0000-0000-0000000000b1', 'Song One', now()),
  ('00000000-0000-0000-0000-0000000000b2', 'Song Two', now());
insert into public.takes (id, name, status, song_id, artist_ids, synced_at) values
  ('00000000-0000-0000-0000-0000000000c1', 'Verse', 'Owed',     '00000000-0000-0000-0000-0000000000b1', array['00000000-0000-0000-0000-0000000000a2'::uuid], now()),
  ('00000000-0000-0000-0000-0000000000c2', 'Hook',  'Accepted', '00000000-0000-0000-0000-0000000000b1', array['00000000-0000-0000-0000-0000000000a2'::uuid], now()),
  ('00000000-0000-0000-0000-0000000000c3', 'Beat',  'Owed',     '00000000-0000-0000-0000-0000000000b2', array['00000000-0000-0000-0000-0000000000a3'::uuid], now());
insert into public.documents (id, number, name, status, synced_at) values
  ('00000000-0000-0000-0000-0000000000d1', 'GRY-DOC-001', 'Test doc', 'Draft', now());
insert into public.project_index (id, name, leadership_only, synced_at) values
  ('00000000-0000-0000-0000-0000000000e1', 'Open project', false, now()),
  ('00000000-0000-0000-0000-0000000000e2', 'Hidden project', true, now());

set role authenticated;

-- Signed out, or signed in but not linked: nothing at all.
select pg_temp.login(null);
select pg_temp.check('signed out sees no artists', (select count(*) from public.artists) = 0);
select pg_temp.check('signed out sees no projects', (select count(*) from public.project_index) = 0);
select pg_temp.login('stranger@test');
select pg_temp.check('unlinked login sees no deliverables', (select count(*) from public.takes) = 0);

-- A member sees only their own rows.
select pg_temp.login('one@test');
select pg_temp.check('member sees only their own artist row', (select array_agg(name) from public.artists) = array['Member One']);
select pg_temp.check('member sees only their own deliverables', (select count(*) from public.takes) = 2);
select pg_temp.check('member sees songs they owe on, not others', (select array_agg(name) from public.songs) = array['Song One']);
select pg_temp.check('member does not see the document registry', (select count(*) from public.documents) = 0);
select pg_temp.check('member sees open projects only', (select array_agg(name) from public.project_index) = array['Open project']);
select pg_temp.check('member cannot read the View as log', (select count(*) from public.view_as_sessions) = 0);

-- Member updates: own open deliverables only, never someone else's, never an accepted one.
insert into public.member_updates (item_type, item_id, new_status) values ('take', '00000000-0000-0000-0000-0000000000c1', 'Submitted');
select pg_temp.check('member can submit their own owed deliverable', (select count(*) from public.member_updates) = 1);
do $$ begin
  insert into public.member_updates (item_type, item_id, new_status) values ('take', '00000000-0000-0000-0000-0000000000c3', 'Submitted');
  raise exception 'FAILED: member submitted someone else''s deliverable';
exception when insufficient_privilege then raise notice 'ok  member cannot submit someone else''s deliverable';
end $$;
do $$ begin
  insert into public.member_updates (item_type, item_id, new_status) values ('take', '00000000-0000-0000-0000-0000000000c2', 'Submitted');
  raise exception 'FAILED: member updated an accepted deliverable';
exception when insufficient_privilege then raise notice 'ok  member cannot update an accepted deliverable';
end $$;

-- ISRC codes: admins only, numbered in order, never twice.
do $$ begin
  perform public.issue_isrc('00000000-0000-0000-0000-0000000000b1');
  raise exception 'FAILED: a non-admin issued an ISRC code';
exception when raise_exception then
  if sqlerrm like 'FAILED%' then raise; end if;
  raise notice 'ok  non-admin cannot issue ISRC codes';
end $$;

select pg_temp.login('lead@test');
select pg_temp.check('leadership sees the document registry', (select count(*) from public.documents) = 1);
select pg_temp.check('leadership sees Leadership Only projects', (select count(*) from public.project_index) = 2);
select pg_temp.check('ISRC admin sees every song', (select count(*) from public.songs) = 2);
select pg_temp.check('first ISRC code ends 00001',
  public.issue_isrc('00000000-0000-0000-0000-0000000000b1') like 'QT-3ZB-__-00001');
select pg_temp.check('next ISRC code ends 00002',
  public.issue_isrc('00000000-0000-0000-0000-0000000000b2') like 'QT-3ZB-__-00002');
do $$ begin
  perform public.issue_isrc('00000000-0000-0000-0000-0000000000b1');
  raise exception 'FAILED: a song got a second original code';
exception when raise_exception then
  if sqlerrm like 'FAILED%' then raise; end if;
  raise notice 'ok  a song cannot get a second original code';
end $$;

-- View as: Support sees exactly what the member sees, read only, and it's logged.
select pg_temp.check('support sees the member list',
  (select array_agg(name order by name) from public.support_members()) = array['Member One', 'Member Two']);
select public.start_view_as('00000000-0000-0000-0000-0000000000a3');
select pg_temp.check('viewing as shows the member''s artist row', (select array_agg(name) from public.artists) = array['Member Two']);
select pg_temp.check('viewing as shows only the member''s deliverables', (select array_agg(name) from public.takes) = array['Beat']);
select pg_temp.check('viewing as hides what the member can''t see', (select count(*) from public.documents) = 0);
select pg_temp.check('support_status reports the view', (select viewing_name from public.support_status()) = 'Member Two');
select pg_temp.check('leadership can still read the log mid view', (select count(*) from public.view_as_sessions) = 1);
do $$ begin
  insert into public.member_updates (item_type, item_id, new_status) values ('take', '00000000-0000-0000-0000-0000000000c3', 'Submitted');
  raise exception 'FAILED: an update was sent while viewing as someone';
exception when insufficient_privilege then raise notice 'ok  no updates while viewing as someone';
end $$;
do $$ begin
  perform public.issue_isrc('00000000-0000-0000-0000-0000000000b2', 'Reissue');
  raise exception 'FAILED: an ISRC code was issued while viewing as someone';
exception when raise_exception then
  if sqlerrm like 'FAILED%' then raise; end if;
  raise notice 'ok  no ISRC codes while viewing as someone';
end $$;
select public.stop_view_as();
select pg_temp.check('exit returns to your own page', (select array_agg(name) from public.artists) = array['Lead Support']);
select pg_temp.check('the log keeps the ended session', (select count(*) from public.view_as_sessions where ended_at is not null) = 1);

do $$ begin
  perform public.start_view_as('00000000-0000-0000-0000-0000000000a4');
  raise exception 'FAILED: viewed as a member with no login';
exception when raise_exception then
  if sqlerrm like 'FAILED%' then raise; end if;
  raise notice 'ok  cannot view as someone who isn''t linked';
end $$;

-- An expired session no longer applies.
reset role;
insert into public.view_as_sessions (viewer_id, target_id, started_at, expires_at) values
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000a2', now() - interval '1 hour', now() - interval '30 minutes');
set role authenticated;
select pg_temp.check('an expired view no longer applies', (select array_agg(name) from public.artists) = array['Lead Support']);

-- Only Support can start a view.
select pg_temp.login('two@test');
do $$ begin
  perform public.start_view_as('00000000-0000-0000-0000-0000000000a2');
  raise exception 'FAILED: a member without Support started a view';
exception when raise_exception then
  if sqlerrm like 'FAILED%' then raise; end if;
  raise notice 'ok  only Support can start a view';
end $$;
select pg_temp.check('non-support gets an empty member list', (select count(*) from public.support_members()) = 0);
