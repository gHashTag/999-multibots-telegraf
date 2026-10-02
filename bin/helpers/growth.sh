#!/bin/bash
# tri growth -- the Queen's next best action to earn, for the owner. Read-only.
# Spec: specs/automation/queen-growth.t27 (vendored in the render's src/spec).
set -u
ROOT="${1:?root}"
# The render's key by explicit UUIDs, as in ball.sh. Never printed.
KEY=$(railway variables --kv \
        --project 564d9ebd-7aa8-44fe-93ec-e0b03c87158d \
        --environment e4d200ad-b8a9-4edf-9b25-190a32613b32 \
        --service 6339df9c-15b8-4f51-ba26-4af0b55c596a 2>/dev/null \
      | grep -E '^RENDER_API_KEY=' | cut -d= -f2-)
[ -n "$KEY" ] || { echo "🛑 could not read the render key -- nothing read"; exit 2; }
RENDER_API_KEY="$KEY" exec npx tsx "$ROOT/bin/helpers/growth.ts"
