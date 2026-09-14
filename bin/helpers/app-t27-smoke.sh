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
# saved table shows real changes and nothing else. The CSP goes in whole: a
# location with its own add_header drops the inherited one, and yes/no would
# not show a changed frame-ancestors. Rows are HEAD requests: lipsync.mp4 is
# 16 MB and the table needs only its headers.
set -uo pipefail

BASE="${VIBEE_APP:-https://app.t27.ai}"
SAVE=""
COMPARE=""

usage() { echo "usage: $0 [--base URL] [--save FILE] [--compare FILE]"; exit 2; }
while [ $# -gt 0 ]; do
  case "$1" in
    # An empty value (an unset $BASELINE) must not read as "not requested".
    --base|--save|--compare) [ $# -ge 2 ] && [ -n "$2" ] || usage ;;
  esac
  case "$1" in
    --base) BASE="$2"; shift 2 ;;
    --save) SAVE="$2"; shift 2 ;;
    --compare) COMPARE="$2"; shift 2 ;;
    *) usage ;;
  esac
done
BASE="${BASE%/}"
if [ -n "$COMPARE" ] && { [ ! -f "$COMPARE" ] || [ ! -r "$COMPARE" ]; }; then
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
  '/feed?post=abc' /manifest.json /lipsync/lipsync.mp4
  /bridge /bridge/bridge.js)

echo "-- $BASE --"
i=0
for p in "${PATHS[@]}"; do
  i=$((i + 1))
  h="$TMP/h$i"
  code=$(curl -sS -m 20 -I -o /dev/null -D "$h" -w '%{http_code}' "$BASE$p") || cant "$p"
  printf '%s\t%s\tloc=%s\tcsp=%s\tcc=%s\tct=%s\n' "$p" "$code" \
    "$(hdr "$h" location)" "$(hdr "$h" content-security-policy)" \
    "$(hdr "$h" cache-control)" "$(hdr "$h" content-type)"
done > "$TMP/table"
sed 's/^/  /' "$TMP/table"

FAILS=0
ok() { echo "  PASS  $1"; }
fail() { echo "  FAIL  $1"; FAILS=$((FAILS + 1)); }
# Rows of the table that break a rule; none is a pass.
rows() { # rule, offending rows
  if [ -z "$2" ]; then ok "$1"; else fail "$1:"; echo "$2" | sed 's/^/        /'; fi
}

echo "-- assertions --"
body=$(curl -sS -m 20 "$BASE/healthz") || cant /healthz
if [ "$body" = ok ]; then ok "/healthz body is ok"; else fail "/healthz body is '$body', expected ok"; fi

# Status alone would pass an SPA fallback: index.html answers 200 for a
# missing bundle and 206 for a Range on a missing mp4. So the type too.
curl -sS -m 20 "$BASE/" -o "$TMP/index.html" || cant /
MAIN=$(grep -oE 'src="/assets/index-[^"]+\.js"' "$TMP/index.html" | head -1 | sed 's/^src="//;s/"$//')
if [ -z "$MAIN" ]; then
  fail "/ references no /assets/index-*.js"
else
  c=$(curl -sS -m 20 -I -o /dev/null -w '%{http_code} %{content_type}' "$BASE$MAIN") || cant "$MAIN"
  case "$c" in
    "200 application/javascript"*|"200 text/javascript"*) ok "/ serves $MAIN as javascript" ;;
    *) fail "/ references $MAIN, which answers $c" ;;
  esac
fi

curl -sS -m 20 "$BASE/manifest.json" -o "$TMP/manifest.json" || cant /manifest.json
if grep -qE '"start_url"[[:space:]]*:[[:space:]]*"/feed"' "$TMP/manifest.json"; then
  ok "/manifest.json start_url is /feed"
else
  fail "/manifest.json start_url is not /feed"
fi

c=$(curl -sS -m 20 -r 0-99 -o /dev/null -w '%{http_code} %{content_type}' "$BASE/lipsync/lipsync.mp4") || cant /lipsync/lipsync.mp4
case "$c" in
  "206 video/mp4"*) ok "Range bytes=0-99 on lipsync.mp4 is 206 video/mp4" ;;
  *) fail "Range bytes=0-99 on lipsync.mp4 is $c, expected 206 video/mp4" ;;
esac

# The class of #2403, not its number: nginx built an absolute Location from
# its own scheme and port, and Railway's PORT is not always 8080.
rows "directory redirects are exactly 301 loc=<dir>/" "$(awk -F'\t' '
  $1 ~ /^\/(lipsync|assets|icons|backgrounds)$/ && ($2 != 301 || $3 != ("loc=" $1 "/"))' "$TMP/table")"

# Every CSP header is enforced on its own, and hdr() joins repeats with ", ",
# so directives are split on both ; and , -- a match must not run from one
# policy into the next. Each frame-ancestors present must allow Telegram Web.
rows "SPA routes are 200 text/html, framable by https://web.telegram.org" "$(awk -F'\t' '
  index(" / /feed /t27_dev /index.html /profile?tab=agent /feed?post=abc ", " " $1 " ") {
    fa = 0; open = 1
    n = split(substr($4, 5), d, /[;,]/)
    for (j = 1; j <= n; j++) if (d[j] ~ /^ *frame-ancestors /) {
      fa = 1; if (d[j] !~ / https:\/\/web\.telegram\.org( |$)/) open = 0
    }
    if ($2 != 200 || $6 !~ /^ct=text\/html/ || !fa || !open) print
  }' "$TMP/table")"

rows "/nope.json is 404, not the SPA fallback" "$(awk -F'\t' '$1 == "/nope.json" && $2 != 404' "$TMP/table")"

# The identity bridge the game frames (player/public/bridge/) has its own
# policy, compared whole: frame-ancestors exactly https://t27.ai, never 'self'.
# A missing location shows as the SPA fallback's CSP, and a script cached as
# immutable would keep an old bridge alive for a year.
BRIDGE_CSP="default-src 'none'; script-src 'self'; connect-src https://vibee-render-production.up.railway.app; style-src 'self'; frame-ancestors https://t27.ai"
rows "/bridge and /bridge/bridge.js carry exactly the bridge policy, no-store" "$(awk -F'\t' -v csp="csp=$BRIDGE_CSP" '
  ($1 == "/bridge" && $6 !~ /^ct=text\/html/) ||
  ($1 == "/bridge/bridge.js" && $6 !~ /^ct=(application|text)\/javascript/) ||
  (($1 == "/bridge" || $1 == "/bridge/bridge.js") && ($2 != 200 || $4 != csp || $5 != "cc=no-store"))' "$TMP/table")"

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
