#!/bin/bash
# WHAT app.t27.ai MUST KEEP ANSWERING -- read-only, against the live site.
#
# Measured 2026-09-14: /lipsync, /assets, /icons and /backgrounds answered
# 301 -> http://app.t27.ai:8080/<dir>/, a target that times out (#2403). Nobody
# noticed, because nothing looked at the headers of paths nobody opens by hand.
# The same nginx is about to serve another app from a directory, so every
# route the bots, the iOS build, OAuth and media links depend on is listed
# here, once, with the headers that broke or could break.
#
#   app-t27-smoke.sh --save FILE      record the table
#   app-t27-smoke.sh --compare FILE   exit 1 if the table changed
#
# Exit codes: 0 pass, 1 a changed table or a failed assertion, 2 the check
# could NOT run (network, bad arguments). 2 is never a pass.
#
# Only stable fields go into the table (no Date, no ETag), so a diff against a
# saved table shows real changes and nothing else. Rows are HEAD requests:
# lipsync.mp4 is 16 MB and the table needs only its headers.
set -uo pipefail

BASE="${VIBEE_APP:-https://app.t27.ai}"
SAVE=""
COMPARE=""

usage() { echo "usage: $0 [--base URL] [--save FILE] [--compare FILE]"; exit 2; }
while [ $# -gt 0 ]; do
  case "$1" in
    --base|--save|--compare) [ $# -ge 2 ] || usage ;;
  esac
  case "$1" in
    --base) BASE="$2"; shift 2 ;;
    --save) SAVE="$2"; shift 2 ;;
    --compare) COMPARE="$2"; shift 2 ;;
    *) usage ;;
  esac
done
BASE="${BASE%/}"
if [ -n "$COMPARE" ] && [ ! -r "$COMPARE" ]; then
  echo "cannot read $COMPARE -- check NOT run"; exit 2
fi

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

# stderr: inside the row loop stdout is the table file.
cant() { echo "  $1 did not answer -- check NOT run" >&2; exit 2; }

# Value of a header (case-insensitive); repeated headers joined with ", ".
hdr() { # file, name
  tr -d '\r' < "$1" | awk -v n="$2" '
    index(tolower($0), n ": ") == 1 { v = v (v == "" ? "" : ", ") substr($0, length(n) + 3) }
    END { print (v == "" ? "-" : v) }'
}

PATHS=(/lipsync /assets /icons /backgrounds /healthz / /feed /t27_dev
  /lipsync/captions.json /nope.json /index.html '/profile?tab=agent'
  '/feed?post=abc' /manifest.json /lipsync/lipsync.mp4)

echo "-- $BASE --"
i=0
for p in "${PATHS[@]}"; do
  i=$((i + 1))
  h="$TMP/h$i"
  code=$(curl -sS -m 20 -I -o /dev/null -D "$h" -w '%{http_code}' "$BASE$p") || cant "$p"
  [ "$p" = / ] && ROOT_HEADERS="$h"
  csp=no; [ "$(hdr "$h" content-security-policy)" != "-" ] && csp=yes
  printf '%s\t%s\tloc=%s\tcsp=%s\tcc=%s\tct=%s\n' "$p" "$code" \
    "$(hdr "$h" location)" "$csp" "$(hdr "$h" cache-control)" "$(hdr "$h" content-type)"
done > "$TMP/table"
sed 's/^/  /' "$TMP/table"

FAILS=0
ok() { echo "  PASS  $1"; }
fail() { echo "  FAIL  $1"; FAILS=$((FAILS + 1)); }

echo "-- assertions --"
body=$(curl -sS -m 20 "$BASE/healthz") || cant /healthz
if [ "$body" = ok ]; then ok "/healthz body is ok"; else fail "/healthz body is '$body', expected ok"; fi

curl -sS -m 20 "$BASE/" -o "$TMP/index.html" || cant /
MAIN=$(grep -oE 'src="/assets/index-[^"]+\.js"' "$TMP/index.html" | head -1 | sed 's/^src="//;s/"$//')
if [ -z "$MAIN" ]; then
  fail "/ references no /assets/index-*.js"
else
  c=$(curl -sS -m 20 -I -o /dev/null -w '%{http_code}' "$BASE$MAIN") || cant "$MAIN"
  if [ "$c" = 200 ]; then ok "/ serves $MAIN"; else fail "/ references $MAIN, which answers $c"; fi
fi

curl -sS -m 20 "$BASE/manifest.json" -o "$TMP/manifest.json" || cant /manifest.json
if grep -qE '"start_url"[[:space:]]*:[[:space:]]*"/feed"' "$TMP/manifest.json"; then
  ok "/manifest.json start_url is /feed"
else
  fail "/manifest.json start_url is not /feed"
fi

c=$(curl -sS -m 20 -r 0-99 -o /dev/null -w '%{http_code}' "$BASE/lipsync/lipsync.mp4") || cant /lipsync/lipsync.mp4
if [ "$c" = 206 ]; then ok "Range bytes=0-99 on lipsync.mp4 is 206"; else fail "Range bytes=0-99 on lipsync.mp4 is $c, expected 206"; fi

if hdr "$ROOT_HEADERS" content-security-policy | grep -qE 'frame-ancestors[^;]*https://web\.telegram\.org'; then
  ok "CSP on / has frame-ancestors with https://web.telegram.org"
else
  fail "CSP on / lacks frame-ancestors with https://web.telegram.org: $(hdr "$ROOT_HEADERS" content-security-policy)"
fi

BAD=$(awk -F'\t' '$3 ~ /:8080/' "$TMP/table")
if [ -z "$BAD" ]; then ok "no Location contains :8080"; else fail "Location contains :8080:"; echo "$BAD" | sed 's/^/        /'; fi

DIFFS=0
if [ -n "$COMPARE" ]; then
  echo "-- compare with $COMPARE --"
  if diff "$COMPARE" "$TMP/table" > "$TMP/diff"; then
    echo "  table unchanged"
  else
    echo "  table changed (< saved, > now):"
    sed 's/^/    /' "$TMP/diff"
    DIFFS=1
  fi
fi

if [ -n "$SAVE" ]; then
  cp "$TMP/table" "$SAVE" || { echo "cannot write $SAVE -- table NOT saved"; exit 2; }
  echo "-- table saved to $SAVE --"
fi

if [ "$FAILS" -gt 0 ] || [ "$DIFFS" -gt 0 ]; then exit 1; fi
exit 0
