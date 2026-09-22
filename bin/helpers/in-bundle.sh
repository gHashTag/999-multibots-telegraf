#!/bin/bash
# DID THIS TEXT REACH THE LIVE BUNDLE?
#
# Done by hand several times on 2026-09-22 -- curl the page, list its
# scripts, grep each -- to prove a change had shipped, not only merged. The
# Queen's board is a hash router with lazy chunks, so its entry names no
# chunk: for `queen` every script the entry references AND every chunk named
# inside the entry is fetched.
#
#   tri in-bundle <text> [app|queen]      default app
# Exit 0 found (file named), 1 not found, 2 could not fetch.
set -uo pipefail
ROOT="$1"; shift
TEXT="${1:?usage: tri in-bundle <text> [app|queen]}"; WHERE="${2:-app}"
case "$WHERE" in
  app)   BASE="https://app.t27.ai"; PAGE="/" ;;
  queen) BASE="https://app.t27.ai/queen"; PAGE="/" ;;
  *) echo "in-bundle: app or queen"; exit 2 ;;
esac
TMP=$(mktemp -d); trap 'rm -rf "$TMP"' EXIT
curl -s -m 30 -f "$BASE$PAGE" -o "$TMP/index.html" || { echo "in-bundle: $BASE did not answer -- could not check"; exit 2; }
# Every asset the page names, then every chunk named inside those, and so
# on (breadth first, each file once): the board's component chunk is
# reached from another chunk, not from the entry, so one level missed it.
grep -oE '(src|href)="\.?/?assets/[^"]+\.(js|css)"' "$TMP/index.html" | sed -E 's/.*"\.?\/?assets\/([^"]+)"/\1/' | sort -u > "$TMP/queue"
[ -s "$TMP/queue" ] || { echo "in-bundle: no assets in the page -- could not check"; exit 2; }
: > "$TMP/seen"
fetched=0
while [ -s "$TMP/queue" ]; do
  a=$(head -1 "$TMP/queue"); tail -n +2 "$TMP/queue" > "$TMP/q2"; mv "$TMP/q2" "$TMP/queue"
  grep -qxF -- "$a" "$TMP/seen" && continue
  echo "$a" >> "$TMP/seen"
  curl -s -m 60 -f "$BASE/assets/$a" -o "$TMP/f" || continue
  fetched=$((fetched+1))
  if grep -qF -- "$TEXT" "$TMP/f"; then echo "in-bundle: found in $BASE/assets/$a"; exit 0; fi
  grep -oE '[A-Za-z0-9_.-]+-[A-Za-z0-9_-]{8}\.(js|css)' "$TMP/f" | sort -u | while read -r c; do
    grep -qxF -- "$c" "$TMP/seen" || echo "$c" >> "$TMP/queue"
  done
done
echo "in-bundle: not found in $fetched file(s) of $BASE"
exit 1
