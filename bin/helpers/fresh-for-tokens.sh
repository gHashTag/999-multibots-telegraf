#!/bin/bash
# REFUSE TO HOLD BOT TOKENS FROM A STALE CHECKOUT.
#
# On 2026-09-22 `tri bridge`, run from a checkout 228 commits behind main,
# asked api.telegram.org for every bot token -- including a bot moved to our
# own Bot API server three minutes earlier. The cloud took that bot back at
# once (any method, getMe included, logs a bot back in: tdlib/telegram-bot-api
# #324), and two servers held one bot. The current scripts choose the host per
# token; a stale copy of them does not.
#
# So before a tri command runs a script with the service's bot tokens, this
# checks that the files deciding the Telegram host are not BEHIND origin/main.
# A checkout ahead of main (your own branch) passes; one that is merely behind
# in those files is refused with the command that fixes it.
#
# Usage: fresh-for-tokens.sh <repo root>
# Exit: 0 fresh enough, 3 stale (refused). A failed fetch falls back to the
# last fetched origin/main -- offline is not a reason to refuse.
set -uo pipefail
ROOT="$1"
HOST_FILES=(
  scripts/lib/telegram-api.cjs
  scripts/bridge.cjs
  scripts/commands-answered.cjs
  scripts/client-pack.cjs
  deployment/telegram-bot-api/allowed-bots.cjs
  deployment/telegram-bot-api/bot-api-move.cjs
)
[ -n "${TRI_SKIP_FRESH_FETCH:-}" ] || git -C "$ROOT" fetch -q origin main 2>/dev/null || true
git -C "$ROOT" rev-parse -q --verify origin/main >/dev/null || exit 0
# Behind: HEAD is an ancestor of origin/main and the host files differ.
if git -C "$ROOT" merge-base --is-ancestor HEAD origin/main &&
  ! git -C "$ROOT" diff --quiet HEAD origin/main -- "${HOST_FILES[@]}"; then
  behind=$(git -C "$ROOT" rev-list --count HEAD..origin/main)
  echo "tri: REFUSED -- this checkout is $behind commit(s) behind origin/main in the" >&2
  echo "  files that choose the Telegram host for each bot token. A stale copy asks" >&2
  echo "  the cloud for a bot that lives on our Bot API server and logs it back in" >&2
  echo "  there (deployment/telegram-bot-api/README.md, step 4b). Update first:" >&2
  echo "    git -C \"$ROOT\" merge --ff-only origin/main" >&2
  exit 3
fi
exit 0
