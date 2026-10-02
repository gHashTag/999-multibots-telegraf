#!/bin/bash
# tri meta -- is the blog desk connected to Threads, Instagram and a Facebook
# Page by Meta's own API (meta-connect.t27), and what is still missing.
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
for k in THREADS_APP_ID THREADS_APP_SECRET META_APP_ID META_APP_SECRET META_PAGE_ID META_TOKEN_KEY; do
  if printf '%s\n' "$VARS" | grep -qE "^$k=.+"; then echo "  $k: set"; else echo "  $k: -"; fi
done
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
psql "$URL" -X -q -c "
SELECT slug, to_char(asked_at,'MM-DD') AS asked, left(detail->>'result', 120) AS result
  FROM blog_shares WHERE detail->>'result' LIKE '%через API%' ORDER BY asked_at DESC LIMIT 5" # cyrillic-ok: matches VIA_API in meta-connect.ts
