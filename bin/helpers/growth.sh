#!/bin/bash
# tri growth -- the Queen's next best action to earn, for the owner. Read-only.
# Spec: specs/automation/queen-growth.t27 (vendored in the render's src/spec).
set -u
. "$(dirname "${BASH_SOURCE[0]}")/rail.sh"  # rvars: Railway by explicit ids
ROOT="${1:?root}"
# The render's key by explicit UUIDs, as in ball.sh. Never printed.
KEY=$(rvars vibee-render \
      | grep -E '^RENDER_API_KEY=' | cut -d= -f2-)
[ -n "$KEY" ] || { echo "🛑 could not read the render key -- nothing read"; exit 2; }
RENDER_API_KEY="$KEY" exec npx tsx "$ROOT/bin/helpers/growth.ts"
