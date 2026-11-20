#!/usr/bin/env bash
# Runs the database tests on a throwaway local Postgres database.
# Needs Postgres 15 or newer running locally. Never point this at Supabase.
#   PGHOST=localhost PGPORT=5432 PGUSER=postgres dev/test-db.sh
set -euo pipefail
case "${PGHOST:-}" in *supabase*) echo "Refusing: PGHOST points at Supabase. Use a local Postgres."; exit 1;; esac
export PGOPTIONS="${PGOPTIONS:-} -c client_min_messages=warning"
cd "$(dirname "$0")/.."
DB="${TEST_DB:-gryce_test}"
dropdb --if-exists "$DB"
createdb "$DB"
run() { psql -q -X -v ON_ERROR_STOP=1 -d "$DB" "$@" >/dev/null; }
run -f dev/stub.sql -f supabase/schema.sql
# Each migration runs twice in a row, because every one must be safe to re-run.
for f in supabase/migrations/*.sql; do run -f "$f"; run -f "$f"; done
if ! psql -q -X -v ON_ERROR_STOP=1 -d "$DB" -f dev/tests.sql 2>&1 | sed -n 's/.*NOTICE:  ok  /  ok  /p; /FAILED\|ERROR/p'; then
  echo "Database tests FAILED."
  exit 1
fi
echo "All database tests passed."
