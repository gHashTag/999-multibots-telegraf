#!/bin/bash
# tri engage -- what the engage desk proposed, what the owner said, what it led to.
#
# The desk (render src/agent/engage-desk.ts, spec automation/engage-desk.t27)
# searches the owner's signed-in networks for posts on his topics and asks him
# before every comment. This prints its own rows: the questions, their answers,
# the receipts, and the lead signals (replies under a posted comment, looked at
# between a day and a week after). Read-only.
#
#   tri engage        # last 15 proposals, today's count per network, lead signals
#   tri engage 40     # last 40
set -u
. "$(dirname "${BASH_SOURCE[0]}")/rail.sh"  # rvars: Railway by explicit ids
ROOT="${1:?repo root required}"
shift
cd "$ROOT" || exit 1
# The database service by name, passed explicitly: never relink (railway-link-flapping).
URL=$(rvars postgres-nfrq | grep -E '^DATABASE_PUBLIC_URL=' | cut -d= -f2-)
[ -n "$URL" ] || { echo "no DATABASE_PUBLIC_URL -- not checked"; exit 2; }
N="${1:-15}"
case "$N" in *[!0-9]*) echo "usage: tri engage [N]"; exit 2 ;; esac
psql "$URL" -X -q -c "SELECT to_regclass('engage_proposals') IS NOT NULL AS desk_has_run" | grep -q ' t' || {
  echo "engage_proposals does not exist yet -- the desk has not run (ENGAGE_DESK_ENABLED=1 on vibee-render?)"
  exit 0
}
psql "$URL" -X -q -c "
SELECT network, state,
       to_char(asked_at, 'MM-DD HH24:MI') AS asked,
       round(extract(epoch from (done_at - asked_at)) / 60) AS min_to_close,
       detail->'leads'->>'replies' AS replies,
       left(post_url, 60) AS post,
       left(comment, 60) AS comment
  FROM engage_proposals ORDER BY asked_at DESC LIMIT $N"
echo "-- per network: asked in 24 h (cap 3), all-time outcomes, lead signals"
psql "$URL" -X -q -c "
SELECT network,
       count(*) FILTER (WHERE asked_at > now() - interval '24 hours') AS asked_24h,
       count(*) FILTER (WHERE state = 'asked') AS open,
       count(*) FILTER (WHERE state = 'posted') AS posted,
       count(*) FILTER (WHERE state = 'declined') AS declined,
       count(*) FILTER (WHERE state = 'expired') AS unanswered,
       count(*) FILTER (WHERE state = 'failed') AS failed,
       count(*) FILTER (WHERE (detail->'leads'->>'replies')::int > 0) AS with_replies,
       coalesce(sum((detail->'leads'->>'replies')::int), 0) AS replies,
       count(*) FILTER (WHERE state = 'posted' AND comment ~ 'https?://') AS with_link
  FROM engage_proposals GROUP BY network ORDER BY network"
echo "replies: Reddit only for now (read from the thread JSON); X/LinkedIn/Threads/Habr show empty, not zero."
echo "followers and DMs are not attributable to one comment -- not counted here."
