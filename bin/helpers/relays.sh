#!/bin/bash
# tri relays [hours] -- does a tap on a bot button still reach the render?
#
# WHY. For nine days (2026-09-24 .. 10-03) every "Allow" tap in the CRM bot
# answered "could not pass the answer on": the relay sent no X-Api-Key and the
# render's global guard said 401 before routing. Unit tests mocked fetch and
# stayed green the whole time; nothing measured the real road. This does,
# from the same key the bot holds, and never prints a key -- keys are
# compared by hash.
#
# Probes (all read-only: junk tokens decide nothing):
#   1. key parity  -- the bot's RENDER_API_KEY equals the render's (sha256)
#   2. guard       -- /api/browser/approve without a key is 401 (guard alive)
#   3. approve     -- with the bot's key and a junk token: 200 + words
#   4. meeting     -- meeting_answer over /mcp with a junk token: words back
#   5. bot log     -- relay failures in the last N hours, by kind
# rc 0 = every probe passed, 1 = a probe failed, 2 = could not measure.
set -u
. "$(dirname "${BASH_SOURCE[0]}")/rail.sh"
HOURS="${1:-24}"
BASE="${RENDER_BASE_URL:-https://vibee-render-production.up.railway.app}"
OWNER=144022504
fail=0

sha() { printf '%s' "$1" | shasum -a 256 | cut -c1-12; }
pass() { printf '  ok    %s\n' "$*"; }
bad() { printf '  FAIL  %s\n' "$*"; fail=1; }

BOT_KEY=$(rvars 999-multibots-telegraf | grep -E '^RENDER_API_KEY=' | cut -d= -f2-)
RENDER_KEY=$(rvars vibee-render | grep -E '^RENDER_API_KEY=' | cut -d= -f2-)
if [ -z "$BOT_KEY" ] || [ -z "$RENDER_KEY" ]; then
  # Says set/empty only: ${KEY:-x} would print the key itself when it is set.
  echo "relays: could not read RENDER_API_KEY (bot: $([ -n "$BOT_KEY" ] && echo set || echo empty)," \
    "render: $([ -n "$RENDER_KEY" ] && echo set || echo empty)) -- NOT measured"
  exit 2
fi

echo "relays: bot -> render ($BASE)"
if [ "$(sha "$BOT_KEY")" = "$(sha "$RENDER_KEY")" ]; then
  pass "key parity: the bot holds the render's key"
else
  bad "key parity: the bot's key differs from the render's -- every relay is 401"
fi

junk=$(openssl rand -hex 16)
code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 15 \
  "$BASE/api/browser/approve?t=$junk" -H 'Accept: application/json')
[ "$code" = 401 ] && pass "guard: no key -> 401" ||
  bad "guard: no key -> $code (expected 401; is the route public now?)"

body=$(curl -s --max-time 15 -w '\n%{http_code}' "$BASE/api/browser/approve?t=$junk" \
  -H 'Accept: application/json' -H "X-Api-Key: $BOT_KEY")
code=${body##*$'\n'}
said=$(printf '%s' "${body%$'\n'*}" | python3 -c 'import json,sys
try: print((json.load(sys.stdin).get("said") or "").strip())
except Exception: print("")')
if [ "$code" = 200 ] && [ -n "$said" ]; then
  pass "approve (Allow/Deny button): 200, the person reads: $said"
else
  bad "approve (Allow/Deny button): $code, words: ${said:-none}"
fi

mjunk=$(openssl rand -hex 11)
body=$(curl -s --max-time 20 -w '\n%{http_code}' "$BASE/mcp?telegram_id=$OWNER" \
  -H "X-Api-Key: $BOT_KEY" -H 'Content-Type: application/json' \
  -d "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"tools/call\",\"params\":{\"name\":\"meeting_answer\",\"arguments\":{\"action\":\"ok\",\"token\":\"$mjunk\"}}}")
code=${body##*$'\n'}
said=$(printf '%s' "${body%$'\n'*}" | python3 -c 'import json,sys
try:
  r = json.load(sys.stdin); s = (r.get("result") or {}).get("structuredContent")
  if not s:
    s = json.loads(((r.get("result") or {}).get("content") or [{}])[0].get("text") or "{}")
  print((s.get("said") or "").strip() if not r.get("error") else "ERROR " + str(r["error"])[:80])
except Exception: print("")')
if [ "$code" = 200 ] && [ -n "$said" ] && [ "${said#ERROR}" = "$said" ]; then
  pass "meeting card button: 200, the person reads: $said"
else
  bad "meeting card button: $code, words: ${said:-none}"
fi

# EVERY DEPLOY IN THE WINDOW, NOT THE LATEST ONE.
#
# `railway logs` without an id reads only the current deployment. The first
# run of this probe said "no relay failures in 24 h" eight hours after the
# 401s of 04:31 -- they lived in the deployment before #3494. So each deploy
# that ran inside the window is asked by id, filtered server-side.
ids=$(railway deployment list --json --project "$RAIL_PROJECT" \
  --environment "$RAIL_ENV" --service 999-multibots-telegraf 2>/dev/null |
  HOURS="$HOURS" python3 -c 'import json,os,sys,datetime as d
cut = d.datetime.now(d.timezone.utc) - d.timedelta(hours=int(os.environ["HOURS"]))
rows = [x for x in json.load(sys.stdin) if x.get("status") in ("SUCCESS","REMOVED","CRASHED")]
# A deploy that ran inside the window: created after the cut, or the last one before it.
before = [x for x in rows if d.datetime.fromisoformat(x["createdAt"].replace("Z","+00:00")) < cut]
keep = [x for x in rows if x not in before] + before[:1]
print(" ".join(x["id"] for x in keep))' 2>/dev/null)
if [ -z "$ids" ]; then
  echo "  ??    bot log: Railway listed no deployments -- failures NOT counted"
  fail=$(( fail > 0 ? fail : 2 ))
else
  logs=""
  for id in $ids; do
    logs+=$(rlogs 999-multibots-telegraf "$id" --since "${HOURS}h" \
      --filter '"browser-approval" OR "meeting-answer"' 2>/dev/null |
      grep -E '\[(browser-approval|meeting-answer)\]')$'\n'
  done
  logs=$(printf '%s' "$logs" | sed '/^$/d')
  nd=$(echo $ids | wc -w | tr -d ' ')
  if [ -z "$logs" ]; then
    echo "  ok    bot log, ${HOURS} h over $nd deploy(s): no relay failures"
  else
    n=$(printf '%s\n' "$logs" | wc -l | tr -d ' ')
    echo "  warn  bot log, ${HOURS} h over $nd deploy(s): $n relay failure line(s):"
    printf '%s\n' "$logs" | grep -oE '\[(browser-approval|meeting-answer)\][^{]*(\{[^}]*\})?' |
      sort | uniq -c | sort -rn | head -8 | sed 's/^/        /'
  fi
fi

[ "$fail" = 0 ] && echo "relays: every road answers" || echo "relays: a road is broken (see FAIL)"
exit "$fail"
