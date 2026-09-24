#!/bin/bash
# tri traffic [days] -- where visitors come from, by channel (epic #2974):
# visits on our pages and starts of our bots from tagged links (tick 9).
#
# Every link the agents publish carries its channel in utm_source (render
# utm.ts); the app counts a tagged arrival once per visit (render
# traffic.ts). This asks the owner's `crm_traffic` through /mcp with the
# owner's agent key and prints arrivals per channel. Counts only: no person
# behind a number is known. The key lives in one variable for one command.
#
#   tri traffic        # last 30 days
#   tri traffic 7      # last 7 days
set -u
ROOT="${1:?repo root required}"
shift
DAYS="${1:-30}"
printf '%s' "$DAYS" | grep -Eq '^[0-9]{1,3}$' || { echo "usage: tri traffic [days]"; exit 2; }

KEY="${AGENT_KEY:-}"
if [ -z "$KEY" ]; then
  KEY=$( (railway variables --service vibee-render --kv 2>/dev/null) \
         | grep -E '^AGENT_KEYS=' | cut -d= -f2- | cut -d, -f1 | cut -d: -f1 )
fi
[ -n "$KEY" ] || { echo "no agent key: export AGENT_KEY or run 'railway login'"; exit 2; }
BASE="${RENDER_BASE:-https://vibee-render-production.up.railway.app}"

RESP=$(curl -s --max-time 45 "$BASE/mcp" -H "X-Agent-Key: $KEY" \
  -H 'Content-Type: application/json' \
  -d "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"tools/call\",\"params\":{\"name\":\"crm_traffic\",\"arguments\":{\"days\":$DAYS}}}")
[ -n "$RESP" ] || { echo "the service did not answer -- no numbers"; exit 2; }

RESP="$RESP" python3 - <<'PYBODY'
import json, os, sys
try:
    msg = json.loads(os.environ['RESP'])
    if 'error' in msg:
        print('refused:', msg['error'].get('message', '')[:200]); sys.exit(2)
    out = json.loads(msg['result']['content'][0]['text'])
except Exception as e:
    print('unreadable answer:', str(e)[:120]); sys.exit(2)
rows = out.get('channels') or []
sources = out.get('sources')
if not rows and not sources:
    print(f"no tagged arrivals or bot starts in the last {out.get('days')} days"); sys.exit(0)
if sources is not None:
    # Per channel: visits on our pages, starts of our bots (tick 9).
    print(f"{'visits':>6} {'starts':>6}  source")
    for r in sources:
        print(f"{r.get('arrivals', 0):>6} {r.get('starts', 0):>6}  {r.get('source', '')}")
    print()
for r in rows:
    camp = r.get('campaign') or '-'
    print(f"{r.get('arrivals', 0):>6}  {r.get('source', ''):<10} {r.get('medium', ''):<10} {camp}")
starts = out.get('totalStarts')
tail = f", {starts} bot starts" if starts is not None else ''
print(f"\n{out.get('total', 0)} tagged arrivals{tail}, last {out.get('days')} days")
PYBODY
