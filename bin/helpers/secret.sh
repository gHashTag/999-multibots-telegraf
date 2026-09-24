#!/bin/bash
# tri secret NAME [--service vibee-render] -- put a secret on a Railway
# service WITHOUT it ever passing through a chat.
#
# Owner, 2026-09-24: "accept the key safely -- do it yourself through a
# command". A key pasted into a conversation lives in its history for good;
# a key typed here goes from the keyboard to Railway and nowhere else:
#
#   - the value is read with a HIDDEN prompt (or from a pipe:
#     `pbpaste | tri secret BRAVE_SEARCH_API_KEY`), never from an argument;
#   - it is never echoed, logged or written to a file;
#   - the answer names the variable and the value's LENGTH only, then reads
#     the service's variable NAMES back to prove it landed.
#
# Needs the Railway CLI, logged in once (`railway login`) and linked to the
# project (`railway link`, project 999). Setting a variable redeploys the
# service, which is how it picks the value up.
#
#   tri secret BRAVE_SEARCH_API_KEY
#   tri secret ZOHO_REFRESH_TOKEN --service vibee-render
set -u
ROOT="${1:?repo root required}"
shift
NAME="${1:-}"
shift || true
SERVICE="vibee-render"
while [ $# -gt 0 ]; do
  case "$1" in
    --service) SERVICE="${2:-}"; shift 2 ;;
    *) echo "unknown option: $1"; exit 2 ;;
  esac
done

if ! printf '%s' "$NAME" | grep -Eq '^[A-Z][A-Z0-9_]{2,63}$'; then
  echo "usage: tri secret NAME [--service vibee-render]   (NAME in CAPS, e.g. BRAVE_SEARCH_API_KEY)"
  exit 2
fi
command -v railway >/dev/null 2>&1 || {
  echo "the Railway CLI is not installed: https://docs.railway.com/guides/cli"
  exit 2
}

if [ -t 0 ]; then
  printf 'Paste %s for %s (nothing will show), then Enter: ' "$NAME" "$SERVICE"
  IFS= read -rs VALUE
  echo
else
  IFS= read -r VALUE
fi
# Trailing whitespace from a copy is never part of a key.
VALUE="$(printf '%s' "$VALUE" | tr -d '\r' | sed -e 's/[[:space:]]*$//' -e 's/^[[:space:]]*//')"
[ -n "$VALUE" ] || { echo "empty value: nothing was set"; exit 2; }

if ! railway variables --service "$SERVICE" --set "$NAME=$VALUE" >/dev/null 2>&1; then
  unset VALUE
  echo "Railway refused (run 'railway login' and 'railway link' to project 999, then again)"
  exit 1
fi
LEN=${#VALUE}
unset VALUE

# Proof it landed: the NAMES of the service's variables, never the values.
if railway variables --service "$SERVICE" --kv 2>/dev/null | cut -d= -f1 | grep -qx "$NAME"; then
  echo "✓ $NAME is set on $SERVICE ($LEN characters). The value was not shown anywhere."
  echo "  Railway redeploys $SERVICE to pick it up; nothing else to do."
else
  echo "✗ Railway accepted the command but $NAME is not listed on $SERVICE -- check the service name."
  exit 1
fi
