#!/bin/bash
# tri rail -- every Railway call in tri that does not name its project.
#
# A bare `railway variables` follows the directory's link, and a bare
# `railway service X` MOVES that link: tri secret could write a key into
# whichever project the directory had drifted to (railway-link-flapping).
# The ids live in bin/helpers/rail.sh; this lists any call that bypasses it.
# Comments and printed hints are not calls. rc 1 when one is found.
set -u
ROOT="${1:?repo root required}"
cd "$ROOT" || exit 2
# Continuation lines are joined first, so a call whose --project sits on the
# next line is read as one call. A call inside a printed hint (bad/warn/skip/
# echo) is text, not a call.
HITS=$(for f in tri bin/tri bin/helpers/*.sh; do
  [ "${f#bin/helpers/rail}" != "$f" ] && continue
  awk -v f="$f" '{ if (buf == "") start = NR; buf = buf $0 }
    /\\$/ { sub(/\\$/, " ", buf); next }
    { print f ":" start ":" buf; buf = "" }' "$f"
done | grep -E 'railway (variables?|logs|run|up|deployment|redeploy|restart|down|ssh|connect|service )' |
  grep -vE -- '^[^:]+:[0-9]+:[[:space:]]*#|(echo|bad|warn|skip)[[:space:]]|print\(' |
  grep -vE -- '(--project|-p) "?\$[{]?RAIL_PROJECT.*(--environment|-e) "?\$[{]?RAIL_ENV|(--environment|-e) "?\$[{]?RAIL_ENV.*(--project|-p) "?\$[{]?RAIL_PROJECT|(--project|-p) "?\$[{]?P\b.*(--environment|-e) "?\$[{]?E\b|(--project|-p) "?\$[{]?p\b.*(--environment|-e) "?\$[{]?e\b')
# The ids themselves live in rail.sh only: a second literal copy is the
# hand-copied list this file exists to end (it lagged behind once already).
. bin/helpers/rail.sh
COPIES=$(grep -nE "$RAIL_PROJECT|$RAIL_ENV" tri bin/tri bin/helpers/*.sh |
  grep -v '^bin/helpers/rail\.sh:')
rc=0
if [ -n "$HITS" ]; then
  printf '%s\n' "$HITS"
  echo "railway calls without --project and --environment from rail.sh: route them through rvars/rlogs (bin/helpers/rail.sh)"
  rc=1
fi
if [ -n "$COPIES" ]; then
  printf '%s\n' "$COPIES"
  echo "the project/environment ids are copied outside bin/helpers/rail.sh: use \$RAIL_PROJECT / \$RAIL_ENV"
  rc=1
fi
[ "$rc" -eq 0 ] && echo "OK   every railway call in tri names its project and environment (from rail.sh)"
exit "$rc"
