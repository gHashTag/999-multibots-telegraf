#!/bin/bash
# tri ball push [--dry] [owner/repo ...] | tri ball show
# The ball board: push the owner's open PRs and bugs to it, or read it.
# Spec: specs/automation/ball-board.t27 (vendored in the render's src/spec).
set -u
. "$(dirname "${BASH_SOURCE[0]}")/rail.sh"  # rvars: Railway by explicit ids
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
KEY=$(rvars vibee-render \
      | grep -E '^RENDER_API_KEY=' | cut -d= -f2-)
[ -n "$KEY" ] || { echo "🛑 could not read the render key -- nothing sent"; exit 2; }
if [ "$SUB" = show ]; then
  RENDER_API_KEY="$KEY" exec npx tsx "$ROOT/bin/helpers/ball-push.ts" show
fi
RENDER_API_KEY="$KEY" exec npx tsx "$ROOT/bin/helpers/ball-push.ts" "$@"
