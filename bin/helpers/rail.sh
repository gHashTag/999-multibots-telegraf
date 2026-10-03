#!/bin/bash
# Railway by explicit UUIDs -- the one home of project 999's ids for tri.
#
# Sourced, never run. A bare `railway service X` RELINKS the directory, and a
# bare `railway variables` reads (or, in `tri secret`, WRITES) whatever project
# the directory happens to be linked to: variables have gone to the wrong
# project that way (memory railway-link-flapping). Until 2026-10-03 the ids
# were hand-copied into three helpers and missing from about forty other calls.
# `tri rail` lists any call that bypasses this file.
RAIL_PROJECT=564d9ebd-7aa8-44fe-93ec-e0b03c87158d   # project 999
RAIL_ENV=e4d200ad-b8a9-4edf-9b25-190a32613b32       # production

# rvars SERVICE -> the service's variables as KEY=VALUE lines. Never printed by
# a caller: each one greps the line it needs.
#
# An empty answer is retried (3 tries, RVARS_PAUSE s apart, 3 by default): the
# DNS proxy on this Mac blinks, and on 2026-10-03 `tri blog-share` said "no
# DATABASE_PUBLIC_URL" while the variable was there and Railway simply did not
# answer. When every try is empty, stderr says so, so a caller's "variable
# missing" can be read as "Railway silent" instead. rc 1 then.
rvars() {
  local svc="${1:?service required}" out try
  for try in 1 2 3; do
    out=$(railway variables --kv --project "$RAIL_PROJECT" \
      --environment "$RAIL_ENV" --service "$svc" 2>/dev/null)
    [ -n "$out" ] && { printf '%s\n' "$out"; return 0; }
    [ "$try" -lt 3 ] && sleep "${RVARS_PAUSE:-3}"
  done
  echo "rvars: railway did not answer for $svc (3 tries) -- a network blink, not a missing variable" >&2
  return 1
}

# rlogs SERVICE [railway logs args...] -> that service's logs, no relink.
rlogs() {
  local svc="${1:?service required}"
  shift
  railway logs --project "$RAIL_PROJECT" --environment "$RAIL_ENV" --service "$svc" "$@"
}
