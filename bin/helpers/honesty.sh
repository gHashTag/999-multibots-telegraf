#!/bin/bash
# tri honesty [hours] -- does the chat agent say it did what it did not do?
#
# WHY. 2026-10-05: AGENT_PROVIDER=ollama put a model without tools at the
# head of every chat turn; it answered "made the poster with your photo" and
# sent nothing. Nothing measured it -- the owner found it by hand. Two probes:
#   1. head  -- the deploy-time AGENT_PROVIDER on vibee-render, and whether
#               that model can call tools at all (ollama cannot)
#   2. log   -- [agent:honesty] lines (an answer that claimed an action no
#               tool call backed) over every render deploy in the window, by
#               claim kind and by the tool that should have run. Counts only:
#               no telegram ids, no words of anyone's conversation.
# rc 0 = clean, 1 = a tools-less head or honesty flags, 2 = could not measure.
# Test seams: TRI_AGENT_PROVIDER (skip Railway for 1), TRI_HONESTY_LOG (a file
# of log lines instead of Railway for 2).
set -u
. "$(dirname "${BASH_SOURCE[0]}")/rail.sh"
HOURS="${1:-24}"
case "$HOURS" in '' | *[!0-9]*) HOURS=24 ;; esac
rc=0

# Providers whose model cannot call tools (render provider.ts CATALOG).
TOOLLESS="ollama"

if [ -n "${TRI_AGENT_PROVIDER+x}" ]; then
  head="$TRI_AGENT_PROVIDER"
else
  vars=$(rvars vibee-render) || { echo "  ??    head: Railway did not answer -- NOT measured"; rc=2; }
  head=$(printf '%s\n' "${vars:-}" | grep -E '^AGENT_PROVIDER=' | cut -d= -f2-)
fi
# provider.ts lower-cases the variable; so does this probe.
head=$(printf '%s' "$head" | tr 'A-Z' 'a-z')
if [ "$rc" -ne 2 ]; then
  if [ -z "$head" ]; then
    echo "  ok    head: AGENT_PROVIDER unset -- default chain, zai first"
  elif printf ' %s ' $TOOLLESS | grep -q " $head "; then
    echo "  FAIL  head: AGENT_PROVIDER=$head -- a model WITHOUT tools answers first;"
    echo "        it will narrate posters and clicks it never made (05.10)."
    echo "        fix: railway variables --set AGENT_PROVIDER=zai (vibee-render)"
    rc=1
  else
    echo "  ok    head: AGENT_PROVIDER=$head (calls tools)"
  fi
fi

if [ -n "${TRI_HONESTY_LOG:-}" ]; then
  logs=$(cat "$TRI_HONESTY_LOG")
  nd=1
else
  ids=$(rdeploy_ids vibee-render "$HOURS")
  if [ -z "$ids" ]; then
    echo "  ??    log: Railway listed no render deployments -- flags NOT counted"
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
if [ "${n:-0}" = "0" ]; then
  echo "  ok    log, ${HOURS} h over $nd deploy(s): no answer claimed an action it did not do"
else
  echo "  warn  log, ${HOURS} h over $nd deploy(s): $n answer(s) claimed an action no tool backed:"
  printf '%s\n' "$summary" | tail -n +2
  [ "$rc" -eq 0 ] && rc=1
fi
exit "$rc"
