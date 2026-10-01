#!/bin/bash
# tri blog-share -- why the blog did (or did not) reach the networks.
#
# 2026-10-02: eight articles in a row were "declined" exactly thirty minutes
# after being asked, and the logs said nothing -- the question had expired at
# the browser's ten minutes while the desk believed it waited a day. This
# prints the desk's own rows and the age of each open question, so the next
# silence is read in one command instead of a database session.
#
#   tri blog-share        # last 10 articles: state, asked, decided, minutes to close
set -u
ROOT="${1:?repo root required}"
shift
cd "$ROOT" || exit 1
# The database service by name, passed explicitly: never relink (railway-link-flapping).
URL=$(railway variables --service postgres-nfrq --kv 2>/dev/null | grep -E '^DATABASE_PUBLIC_URL=' | cut -d= -f2-)
[ -n "$URL" ] || { echo "no DATABASE_PUBLIC_URL -- not checked"; exit 2; }
psql "$URL" -X -q -c "
SELECT slug, state,
       to_char(asked_at, 'MM-DD HH24:MI') AS asked,
       round(extract(epoch from (done_at - asked_at)) / 60) AS min_to_close,
       left(coalesce(detail->>'result', ''), 80) AS result
  FROM blog_shares ORDER BY asked_at DESC LIMIT ${1:-10}"
psql "$URL" -X -q -c "
SELECT count(*) FILTER (WHERE state = 'declined' AND done_at - asked_at < interval '1 hour') AS closed_within_hour,
       count(*) FILTER (WHERE state = 'posted') AS posted,
       count(*) FILTER (WHERE state = 'failed') AS failed
  FROM blog_shares"
