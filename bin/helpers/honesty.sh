#!/bin/bash
# tri honesty [hours] -- does the chat agent say it did what it did not do?
#
# WHY. 2026-10-05: AGENT_PROVIDER=ollama put a model without tools at the
# head of every chat turn; it answered "made the poster with your photo" and
# sent nothing. Nothing measured it -- the owner found it by hand. Two probes:
#   1. head  -- head_note from the live GET /api/agent/provider (#3722). The
#               render applies the head rule itself (#3659, spec
#               agent-provider-chain.t27) and says what it did; this probe
#               prints that note instead of re-deriving the head from
#               AGENT_PROVIDER, which missed the owner's /model pick.
#   2. log   -- [agent:honesty] lines (an answer that claimed an action no
#               tool call backed) over every render deploy in the window, by
#               claim kind and by the tool that should have run. Counts only:
#               no telegram ids, no words of anyone's conversation.
# rc 0 = clean, 1 = a flagged head or honesty flags, 2 = could not measure.
# Test seams: TRI_PROVIDER_JSON (a file standing in for the endpoint's body;
# no key is read and no request is made), TRI_HONESTY_LOG (a file of log
# lines instead of Railway for 2).
set -u
. "$(dirname "${BASH_SOURCE[0]}")/rail.sh"
HOURS="${1:-24}"
case "$HOURS" in '' | *[!0-9]*) HOURS=24 ;; esac
rc=0
BASE="${RENDER_BASE_URL:-https://vibee-render-production.up.railway.app}"
OWNER=144022504

# The body of GET /api/agent/provider, or nothing. The route is owner-only:
# the server key plus the owner's id named explicitly (resolveIdentity). The
# key goes to curl on stdin (-H @-), so it is in no argv, log or output.
provider_body() {
  if [ -n "${TRI_PROVIDER_JSON+x}" ]; then
    cat "$TRI_PROVIDER_JSON" 2>/dev/null
    return
  fi
  local key
  key=$(rvars vibee-render | grep -E '^RENDER_API_KEY=' | cut -d= -f2-)
  [ -n "$key" ] || return 0
  printf 'X-Api-Key: %s\n' "$key" |
    curl -sf --max-time 15 -H @- -H 'Accept: application/json' \
      "$BASE/api/agent/provider?telegram_id=$OWNER" 2>/dev/null
}

# Prints the head lines, then "rc N" last. A body without a head_note field
# is an older render or an error page: not measured, never "ok".
headout=$(provider_body | python3 -c '
import json, sys
try:
    s = json.load(sys.stdin)
    assert isinstance(s, dict) and "head_note" in s
except Exception:
    print("  ??    head: /api/agent/provider did not answer with a head_note -- not measured")
    print("rc 2")
    sys.exit()
note = s.get("head_note") or ""
cur = (s.get("current") or {}).get("id") or "none"
ans = (s.get("answering") or {}).get("id") or "none"
env = s.get("env") or "unset"
pick = s.get("chosen") or "none"
fixes = {
    "demoted: no tools": "AGENT_PROVIDER=%s cannot call tools; the render moved it back. fix: set AGENT_PROVIDER=zai on vibee-render" % env,
    "owner pick: no tools": "the /model pick %s cannot call tools and answers first. fix: /model zai in the bot" % pick,
    "no provider in the chain calls tools": "every chat turn will narrate actions it never made. fix: configure zai (its key) on vibee-render",
}
if not note:
    print("  ok    head: %s calls tools (answering %s)" % (cur, ans))
    print("rc 0")
else:
    print("  FAIL  head: %s -- head %s, answering %s" % (note, cur, ans))
    print("        " + fixes.get(note, "unknown head_note: read GET /api/agent/provider"))
    print("rc 1")
') || headout=""
case "$(printf '%s\n' "$headout" | tail -1)" in
  "rc 0") ;;
  "rc 1") rc=1 ;;
  *) rc=2 ;;
esac
if [ -n "$headout" ]; then
  printf '%s\n' "$headout" | sed '$d'
else
  echo "  ??    head: the head_note reader failed -- not measured"
fi

if [ -n "${TRI_HONESTY_LOG:-}" ]; then
  logs=$(cat "$TRI_HONESTY_LOG")
  nd=1
else
  ids=$(rdeploy_ids vibee-render "$HOURS")
  if [ -z "$ids" ]; then
    echo "  ??    log: Railway listed no render deployments -- flags NOT counted"
    # A measured FAIL above outranks "could not measure" (PR #3670 review):
    # a watcher reading 2 as a Railway blink would miss a tools-less head.
    [ "$rc" -eq 1 ] && exit 1
    exit 2
  fi
  logs=""
  for id in $ids; do
    logs+=$(rlogs vibee-render "$id" --since "${HOURS}h" \
      --filter '"agent:honesty"' 2>/dev/null)$'\n'
  done
  nd=$(echo $ids | wc -w | tr -d ' ')
fi

summary=$(printf '%s\n' "$logs" | python3 -c '
import json, re, sys, collections
kinds, tools, n = collections.Counter(), collections.Counter(), 0
for line in sys.stdin:
    i = line.find("[agent:honesty]")
    if i < 0:
        continue
    m = re.search(r"\{.*\}", line[i:])
    try:
        row = json.loads(m.group(0)) if m else {}
    except ValueError:
        row = {}
    n += 1
    kinds[row.get("claim") or "browser"] += 1
    for t in row.get("unbacked") or []:
        tools[t] += 1
print(n)
for k, c in kinds.most_common():
    print(f"        {c:4d}  claim {k}")
for t, c in tools.most_common(8):
    print(f"        {c:4d}  should have called {t}")
')
n=$(printf '%s\n' "$summary" | head -1)
case "$n" in
  '' | *[!0-9]*)
    # The counter itself broke: an uncounted log is not a clean one.
    echo "  ??    log: the counter failed -- flags NOT counted"
    [ "$rc" -eq 1 ] && exit 1
    exit 2
    ;;
esac
if [ "$n" = "0" ]; then
  echo "  ok    log, ${HOURS} h over $nd deploy(s): no answer claimed an action it did not do"
else
  echo "  warn  log, ${HOURS} h over $nd deploy(s): $n answer(s) claimed an action no tool backed:"
  printf '%s\n' "$summary" | tail -n +2
  # Counted lies are a measured 1, even when the head was not measured
  # (PR #3670 re-review): 2 would read as a Railway blink.
  rc=1
fi
exit "$rc"
