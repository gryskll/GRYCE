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

-- The profile the site loads at sign-in. Every column it asks for must be readable.
select pg_temp.login('one@test');
select pg_temp.check('members can read the profile columns the site loads',
  (select count(*) from (select id, name, leadership, isrc_admin, mix_queue from public.artists) x) = 1);

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

-- Mix queue: only Mix Queue members see it, and only songs in a mix stage.
reset role;
update public.artists set mix_queue = true where email = 'lead@test';
update public.songs set development_stage = 'Mixing' where id = '00000000-0000-0000-0000-0000000000b1';
update public.songs set development_stage = 'Recording' where id = '00000000-0000-0000-0000-0000000000b2';
set role authenticated;
select pg_temp.login('lead@test');
select pg_temp.check('mix queue member sees songs in a mix stage', (select array_agg(song) from public.mix_queue()) = array['Song One']);
select pg_temp.check('mix queue lists what is still owed', (select jsonb_array_length(owed) from public.mix_queue() where song = 'Song One') = 1);
select pg_temp.login('one@test');
select pg_temp.check('non-members get an empty mix queue', (select count(*) from public.mix_queue()) = 0);

-- Mix edits: Mix Queue members can queue an edit on a queued song; others can't.
select pg_temp.login('lead@test');
insert into public.song_updates (song_id, new_stage) values ('00000000-0000-0000-0000-0000000000b1', 'Mastering');
select pg_temp.check('mix queue member can queue a stage change', (select count(*) from public.song_updates) = 1);
select pg_temp.check('the queue shows the pending change', (select pending->>'stage' from public.mix_queue() where song = 'Song One') = 'Mastering');
do $$ begin
  insert into public.song_updates (song_id, new_stage) values ('00000000-0000-0000-0000-0000000000b1', 'Released');
  raise exception 'FAILED: a stage outside the mix list was accepted';
exception when insufficient_privilege then raise notice 'ok  only mix stages and Release Ready can be set';
end $$;
do $$ begin
  insert into public.song_updates (song_id, new_stage) values ('00000000-0000-0000-0000-0000000000b2', 'Mixing');
  raise exception 'FAILED: edited a song that is not in the queue';
exception when insufficient_privilege then raise notice 'ok  songs outside the queue cannot be edited';
end $$;
select pg_temp.login('one@test');
do $$ begin
  insert into public.song_updates (song_id, new_stage) values ('00000000-0000-0000-0000-0000000000b1', 'Mixing');
  raise exception 'FAILED: a non-member edited the mix queue';
exception when insufficient_privilege then raise notice 'ok  non-members cannot edit the mix queue';
end $$;
select pg_temp.check('non-members cannot see queued edits', (select count(*) from public.song_updates) = 0);

-- Demos: anyone can share; reactions are one per member; comments stay private to the owner and Leadership.
insert into public.demos (title, link, note) values ('Demo One', 'https://example.com/d1', 'rough');
select pg_temp.check('a member can share a demo', (select count(*) from public.demos) = 1);
do $$ begin
  insert into public.demos (title, link) values ('Bad link', 'javascript:alert(1)');
  raise exception 'FAILED: a non-https link was accepted';
exception when check_violation then raise notice 'ok  demo links must be https';
end $$;
do $$ begin
  insert into public.demo_reactions (demo_id, reaction) select id, 'feeling' from public.demos;
  raise exception 'FAILED: reacted to your own demo';
exception when insufficient_privilege then raise notice 'ok  you cannot react to your own demo';
end $$;
select pg_temp.login('two@test');
select pg_temp.check('other members see the demo', (select count(*) from public.demos) = 1);
insert into public.demo_reactions (demo_id, reaction, comment) select id, 'want_on', 'I hear a hook' from public.demos;
update public.demo_reactions set reaction = 'feeling';
select pg_temp.check('one reaction per member, and it can change', (select feeling from public.demo_summary()) = 1 and (select want_on from public.demo_summary()) = 0);
select pg_temp.login('lead@test');
select pg_temp.check('leadership reads the comment', (select comment from public.demo_reactions) = 'I hear a hook');
select pg_temp.check('leadership sees who commented', (select who from public.demo_comments()) = 'Member Two');
select pg_temp.check('counts are visible to everyone', (select feeling from public.demo_summary()) = 1);
select public.start_view_as('00000000-0000-0000-0000-0000000000a2');
do $$ begin
  insert into public.demos (title, link) values ('Sneaky', 'https://example.com/x');
  raise exception 'FAILED: shared a demo while viewing as someone';
exception when insufficient_privilege then raise notice 'ok  no demos while viewing as someone';
end $$;
select public.stop_view_as();
reset role;
insert into public.artists (id, name, email, synced_at) values ('00000000-0000-0000-0000-0000000000a5', 'Member Three', 'three@test', now());
set role authenticated;
select pg_temp.login('three@test');
select pg_temp.check('other members cannot read someone else''s comment', (select count(*) from public.demo_reactions) = 0 and (select count(*) from public.demo_comments()) = 0);
select pg_temp.check('demos show who shared them', (select artist_name from public.demo_summary()) = 'Member One');

-- Demos that become songs: the member picks a credit role; the song name comes back with the demo.
select pg_temp.login('one@test');
insert into public.demos (title, link, credit_role) values ('Demo Two', 'https://example.com/d2', 'Vocals');
select pg_temp.check('a member can choose how they would be credited', (select credit_role from public.demos where title = 'Demo Two') = 'Vocals');
do $$ begin
  insert into public.demos (title, link, credit_role) values ('Demo Three', 'https://example.com/d3', 'Boss');
  raise exception 'FAILED: an unknown credit role was accepted';
exception when check_violation then raise notice 'ok  only Producer, Vocals or both can be chosen';
end $$;
reset role;
update public.demos set song_id = '00000000-0000-0000-0000-0000000000b2' where title = 'Demo Two';
set role authenticated;
select pg_temp.login('two@test');
select pg_temp.check('the crew sees what song a demo became', (select song_name from public.demo_summary() s join public.demos d on d.id = s.demo_id where d.title = 'Demo Two') = 'Song Two');
