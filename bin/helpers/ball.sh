#!/bin/bash
# tri ball push [--dry] [owner/repo ...] | tri ball show
# The ball board: push the owner's open PRs and bugs to it, or read it.
# Spec: specs/automation/ball-board.t27 (vendored in the render's src/spec).
set -u
ROOT="${1:?root}"; shift
SUB="${1:-show}"; [ $# -gt 0 ] && shift
case "$SUB" in
  push|show) ;;
  *) echo "tri ball push [--dry] [owner/repo ...] | tri ball show"; exit 2 ;;
esac
# --dry reads only GitHub: no key needed.
case " $* " in
  *" --dry "*) exec npx tsx "$ROOT/bin/helpers/ball-push.ts" "$@" ;;
esac
# The render's key, by explicit UUIDs: a bare `railway service` relinks the
# directory and has sent variables to the wrong project before. Never printed.
KEY=$(railway variables --kv \
        --project 564d9ebd-7aa8-44fe-93ec-e0b03c87158d \
        --environment e4d200ad-b8a9-4edf-9b25-190a32613b32 \
        --service 6339df9c-15b8-4f51-ba26-4af0b55c596a 2>/dev/null \
      | grep -E '^RENDER_API_KEY=' | cut -d= -f2-)
[ -n "$KEY" ] || { echo "🛑 could not read the render key -- nothing sent"; exit 2; }
if [ "$SUB" = show ]; then
  RENDER_API_KEY="$KEY" exec npx tsx "$ROOT/bin/helpers/ball-push.ts" show
fi
RENDER_API_KEY="$KEY" exec npx tsx "$ROOT/bin/helpers/ball-push.ts" "$@"
