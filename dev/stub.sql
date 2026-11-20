-- Stand-ins for the parts of Supabase the schema expects, so the migrations
-- run on plain Postgres for testing. auth.jwt() reads the test.jwt setting,
-- so a test can "sign in" with: select set_config('test.jwt', '{"email":"a@x"}', false);
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role; end if;
end $$;
create schema if not exists auth;
create or replace function auth.jwt() returns jsonb language sql stable as
  $$ select coalesce(current_setting('test.jwt', true), '{}')::jsonb $$;
grant usage on schema auth to authenticated, anon;
grant execute on function auth.jwt() to authenticated, anon;
grant usage on schema public to authenticated, anon, service_role;
