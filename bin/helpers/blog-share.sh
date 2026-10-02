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
#   tri blog-share reoffer          # list articles the 10-minute timer closed (dry run)
#   tri blog-share reoffer --apply  # forget them; the desk asks again, one a day
#   tri blog-share detail [slug]    # what EACH network answered, in full (last article by default)
#
# Every listing ends with the desk's NEXT step (2026-10-03): a night was spent
# asking "why is the blog not posted" when the answer was the pace -- one
# question every ASK_EVERY_MS, the next due two hours later, about an article
# already in the feed. The pace is read from the spec's generated module, not
# copied here.
set -u
ROOT="${1:?repo root required}"
shift
cd "$ROOT" || exit 1
# The database service by name, passed explicitly: never relink (railway-link-flapping).
URL=$(railway variables --service postgres-nfrq --kv 2>/dev/null | grep -E '^DATABASE_PUBLIC_URL=' | cut -d= -f2-)
[ -n "$URL" ] || { echo "no DATABASE_PUBLIC_URL -- not checked"; exit 2; }
# Closed by the timer, not by a person: the desk marked it declined while its
# approval row was never decided (still pending) -- nobody pressed "no". Also a
# "posted" row whose every network reported a failure (before #3235 any click
# counted). Deleting the row makes the article unseen; the desk's own daily
# pace re-asks it -- no burst.
TIMER="slug IN (SELECT b.slug FROM blog_shares b LEFT JOIN browser_approvals a ON a.id = b.approval_id
  WHERE (b.state = 'declined' AND (a.id IS NULL OR a.decided_at IS NULL))
     OR (b.state = 'posted' AND b.detail->>'result' IS NOT NULL
         AND b.detail->>'result' !~ '(опубликован|ушла с формы)'))" # cyrillic-ok: matches the desk's own result strings
# The table cuts `result` at 80 characters, and 2026-10-02's answer was in
# the cut part: Reddit and LinkedIn "button not found" (a shadow-DOM probe
# blind spot, #3361), X "not confirmed on the profile". One network per line.
if [ "${1:-}" = detail ]; then
  WHERE="ORDER BY asked_at DESC LIMIT 1"
  [ -n "${2:-}" ] && WHERE="WHERE slug = '$(printf %s "$2" | tr -cd 'a-z0-9-')'"
  # The query's own exit code first: piped straight into python, a database
  # that did not answer printed "no such article" -- a wrong answer, not none.
  ROWS=$(psql "$URL" -X -q -At -c "SELECT slug, state, to_char(asked_at,'MM-DD HH24:MI'), to_char(done_at,'MM-DD HH24:MI'), detail::text FROM blog_shares $WHERE") \
    || { echo "the database did not answer -- not checked"; exit 2; }
  printf '%s\n' "$ROWS" | python3 -c '
import json, sys
rows = [l for l in sys.stdin.read().splitlines() if l.strip()]
if not rows:
    print("no such article in blog_shares"); sys.exit(1)
for row in rows:
    slug, state, asked, done, detail = row.split("|", 4)
    d = json.loads(detail or "{}")
    print(slug, " [" + state + "]  asked", asked, " done", done or "-")
    print("  link:", d.get("link", ""))
    res = d.get("result")
    if isinstance(res, dict):
        for net, said in res.items():
            print(f"  {net:<9} {said}")
    elif res:
        print(f"  {res}")
    else:
        print("  no network was tried yet")'
  exit $?
fi
if [ "${1:-}" = reoffer ]; then
  psql "$URL" -X -q -c "SELECT slug, to_char(asked_at,'MM-DD') AS asked FROM blog_shares WHERE $TIMER ORDER BY asked_at"
  if [ "${2:-}" = --apply ]; then
    psql "$URL" -X -q -c "DELETE FROM blog_shares WHERE $TIMER"
    echo "forgotten; the desk re-asks one per day"
  else
    echo "dry run -- add --apply to let the desk ask these again"
  fi
  exit 0
fi
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
# The desk's next step, in the desk's own order (blogShareTick): an open
# question first, then the pace, then the newest feed article never offered.
GEN=apps/vibee-editor/render/src/spec/blog-share.gen.ts
EVERY=$(grep -oE 'ASK_EVERY_MS = [0-9]+' "$GEN" | grep -oE '[0-9]+$')
WAIT=$(grep -oE 'ANSWER_WAIT_MS = [0-9]+' "$GEN" | grep -oE '[0-9]+$')
STATE=$(psql "$URL" -X -q -At -F'|' -c "
SELECT coalesce((SELECT slug || '|' || round(extract(epoch from now() - asked_at))::text
                   FROM blog_shares WHERE state = 'asked' ORDER BY asked_at DESC LIMIT 1), ''),
       coalesce(round(extract(epoch from now() - max(asked_at)))::text, '')
  FROM blog_shares") || { echo "next: the database did not answer -- not checked"; exit 2; }
SEEN=$(psql "$URL" -X -q -At -c "SELECT slug FROM blog_shares") || SEEN=
FEED=$(curl -s --max-time 20 https://t27.ai/rss.xml) || FEED=
STATE="$STATE" SEEN="$SEEN" FEED="$FEED" EVERY="${EVERY:-0}" WAIT="${WAIT:-0}" python3 -c '
import os, re
st = os.environ["STATE"].split("|")
every, wait = int(os.environ["EVERY"]) // 1000, int(os.environ["WAIT"]) // 1000
h = lambda s: f"{s / 3600:.1f} h"
if st[0] and len(st) >= 3 and st[1]:
    age = int(st[1])
    print(f"next: waiting for the owner on {st[0]} -- asked {h(age)} ago, closes in {h(max(wait - age, 0))}")
    raise SystemExit(0)
seen = set(os.environ["SEEN"].split())
feed = re.findall(r"<guid[^>]*>([^<]+)</guid>", os.environ["FEED"])
if not feed:
    print("next: the feed did not answer -- not checked"); raise SystemExit(2)
new = [g for g in feed if g not in seen]
last = st[-1]
due = 0 if not last else max(every - int(last), 0)
if not new:
    print("next: every feed article was offered already -- nothing to ask")
elif due:
    print(f"next: asks about {new[0]} in {h(due)} (one question every {h(every)}); {len(new)} article(s) never offered")
else:
    print(f"next: asks about {new[0]} on the next tick (5 min); {len(new)} article(s) never offered")'

