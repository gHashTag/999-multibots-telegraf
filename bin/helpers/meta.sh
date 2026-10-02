#!/bin/bash
# tri meta -- is the blog desk connected to Threads, Instagram, a Facebook
# Page (meta-connect.t27), LinkedIn and X (social-api.t27) by each network's
# own API, and what is still missing -- one READY line per network at the end.
#
# Reads names and dates only: the token column is never selected, and the
# Meta app's id and secret are reported as set / not set, never printed.
#
#   tri meta          # apps set on vibee-render? tokens held, account, days left
#   tri meta card S   # fetch the Instagram card of article slug S to /tmp
set -u
ROOT="${1:?repo root required}"
shift
cd "$ROOT" || exit 1
RENDER=https://vibee-render-production.up.railway.app
if [ "${1:-}" = card ]; then
  out="/tmp/meta-card-${2:?slug}.jpg"
  code=$(curl -s -o "$out" -w '%{http_code}' "$RENDER/api/social/card/$2.jpg")
  echo "card $2: HTTP $code -> $out"
  exit 0
fi
# Explicit service and environment: never relink (railway-link-flapping).
VARS=$(railway variables --service vibee-render --environment production --kv 2>/dev/null)
[ -n "$VARS" ] || { echo "railway variables unreadable -- apps not checked"; }
isset() { printf '%s\n' "$VARS" | grep -qE "^$1=.+"; }
for k in THREADS_APP_ID THREADS_APP_SECRET META_APP_ID META_APP_SECRET META_PAGE_ID META_TOKEN_KEY \
  LINKEDIN_CLIENT_ID LINKEDIN_CLIENT_SECRET X_CLIENT_ID X_CLIENT_SECRET; do
  if isset "$k"; then echo "  $k: set"; else echo "  $k: -"; fi
done
# Facebook Login for Business asks through a saved configuration; without
# one the dialog falls back to the scope list (authorizeUrl, meta-connect.ts).
if isset META_LOGIN_CONFIG_ID; then echo "  META_LOGIN_CONFIG_ID: set (Facebook dialog sends config_id)"
else echo "  META_LOGIN_CONFIG_ID: - (Facebook dialog sends scope)"; fi
echo "  redirect URI to register in every app: $RENDER/api/social/meta/callback"
URL=$(railway variables --service postgres-nfrq --kv 2>/dev/null | grep -E '^DATABASE_PUBLIC_URL=' | cut -d= -f2-)
[ -n "$URL" ] || { echo "no DATABASE_PUBLIC_URL -- tokens not checked"; exit 2; }
psql "$URL" -X -q -c "
SELECT network, account_id,
       coalesce(meta->>'username', meta->>'page_name', '') AS account,
       coalesce(meta->>'ig_username', '') AS instagram,
       CASE WHEN expires_at IS NULL THEN 'never'
            ELSE round(extract(epoch from (expires_at - now())) / 86400)::text END AS days_left,
       to_char(refreshed_at, 'MM-DD HH24:MI') AS refreshed
  FROM social_tokens ORDER BY network" 2>&1 | sed 's/relation "social_tokens" does not exist.*/no social_tokens yet: nobody has connected/'
HELD=$(psql "$URL" -X -At -c "SELECT network FROM social_tokens
  WHERE expires_at IS NULL OR expires_at > now() OR meta ? 'refresh_sealed'" 2>/dev/null)
# One line per network: what the end-to-end run still waits for, and whose move it is.
echo "-- ready? --"
for row in "threads THREADS_APP_ID THREADS_APP_SECRET" "facebook META_APP_ID META_APP_SECRET" \
  "linkedin LINKEDIN_CLIENT_ID LINKEDIN_CLIENT_SECRET" "x X_CLIENT_ID X_CLIENT_SECRET"; do
  set -- $row
  if ! isset "$2"; then
    echo "  $1: waits for the owner -- create the app, set $2 and $3 on vibee-render"
  elif ! isset "$3"; then
    echo "  $1: app created ($2 set) -- waits for the owner to copy $3 onto vibee-render"
  elif ! isset META_TOKEN_KEY; then
    echo "  $1: app set -- waits for META_TOKEN_KEY on vibee-render (Connect refuses without it)"
  elif ! printf '%s\n' "$HELD" | grep -qx "$1"; then
    echo "  $1: app set -- waits for the owner to press Connect (Profile -> networks)"
  else
    echo "  $1: READY -- the next approved article goes by API"
  fi
done
psql "$URL" -X -q -c "
SELECT slug, to_char(asked_at,'MM-DD') AS asked, left(detail->>'result', 120) AS result
  FROM blog_shares WHERE detail->>'result' LIKE '%через API%' ORDER BY asked_at DESC LIMIT 5" # cyrillic-ok: matches VIA_API in meta-connect.ts
