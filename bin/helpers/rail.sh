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
rvars() {
  railway variables --kv --project "$RAIL_PROJECT" --environment "$RAIL_ENV" \
    --service "${1:?service required}" 2>/dev/null
}

# rlogs SERVICE [railway logs args...] -> that service's logs, no relink.
rlogs() {
  local svc="${1:?service required}"
  shift
  railway logs --project "$RAIL_PROJECT" --environment "$RAIL_ENV" --service "$svc" "$@"
}
