#!/bin/bash
# tri schema-drift -- the live database schema against its committed baseline.
#
# The same diff queen-watch runs once a day on Railway (deployment/queen-watch/
# schema.mjs), run here on demand: unique indexes (by shape), column defaults,
# NOT NULL, and tables without a primary key, in schema public of
# Postgres-NFrq. Read-only: one connection with default_transaction_read_only
# and a 10 s statement_timeout. Never fixes DDL.
#
#   tri schema-drift              diff; rc 0 clean, 1 drift, 2 not measured
#   tri schema-drift --baseline   rewrite deployment/queen-watch/schema-baseline.json
#                                 from the live database (commit it in a PR)
#
# 2026-10-07: the Supabase -> Railway copy had silently lost 14 unique indexes
# and several defaults, and a user found it first ("no unique or exclusion
# constraint matching the ON CONFLICT specification").
#
# The URL is read as JSON (a value with '=' or a newline survives), lives only
# in this process's variable and the child's environment, is never echoed, and
# is unset after. `pg` comes from the repo root's node_modules.
set -u
. "$(dirname "${BASH_SOURCE[0]}")/rail.sh"  # RAIL_PROJECT / RAIL_ENV
ROOT="${1:?repo root required}"
shift
MODE=check
case "${1:-}" in
  "") ;;
  --baseline) MODE=baseline ;;
  *) echo "usage: tri schema-drift [--baseline]"; exit 2 ;;
esac
# The current CLI first: an old railway on PATH cannot read the newer login.
RW="$HOME/.nvm/versions/node/v22.22.0/bin/railway"
[ -x "$RW" ] || RW=$(command -v railway)
[ -n "$RW" ] || { echo "schema: no railway CLI -- not measured"; exit 2; }
URL=$("$RW" variables --json --project "$RAIL_PROJECT" --environment "$RAIL_ENV" \
  --service Postgres-NFrq 2>/dev/null |
  python3 -c 'import json,sys
try: print(json.load(sys.stdin).get("DATABASE_PUBLIC_URL",""))
except Exception: print("")')
if [ -z "$URL" ]; then
  echo "schema: could not read DATABASE_PUBLIC_URL of Postgres-NFrq -- not measured"
  exit 2
fi
DATABASE_URL="$URL" PG_RESOLVE_FROM="${PG_RESOLVE_FROM:-$ROOT}" \
  node "$ROOT/deployment/queen-watch/schema.mjs" "$MODE"
rc=$?
unset URL
exit $rc
