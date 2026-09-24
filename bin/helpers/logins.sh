#!/bin/bash
# tri logins -- which of the owner's networks their browser is signed into (#2962).
#
# The digital clone is only as real as the accounts it holds (epic #2961).
# This asks the live service through the owner's agent key, the same door as
# every other agent: `browser_logins` reads the pod's cookie NAMES on the
# browser socket (no page opens, the wheel is untouched) and answers with a
# network and a state. Values never leave the pod process, and this script
# prints nothing but networks and states. The key lives in one variable for
# one command (skill mcp-owner-access).
#
#   tri logins          # the table
#   tri logins --json   # the raw answer, for a loop to diff
set -u
ROOT="${1:?repo root required}"
shift
cd "$ROOT" || exit 1

KEY="${AGENT_KEY:-}"
if [ -z "$KEY" ]; then
  KEY=$( (railway variables --service vibee-render --kv 2>/dev/null) \
         | grep -E '^AGENT_KEYS=' | cut -d= -f2- | cut -d, -f1 | cut -d: -f1 )
fi
[ -n "$KEY" ] || { echo "no agent key: export AGENT_KEY or run 'railway login'"; exit 2; }
BASE="${RENDER_BASE:-https://vibee-render-production.up.railway.app}"

RESP=$(curl -s --max-time 45 "$BASE/mcp" -H "X-Agent-Key: $KEY" \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"browser_logins","arguments":{}}}')

# An empty answer is not "signed in nowhere": say so and stop.
[ -n "$RESP" ] || { echo "the service did not answer -- no verdict"; exit 2; }

RESP="$RESP" JSON="${1:-}" python3 - <<'PYBODY'
import json, os, sys

try:
    msg = json.loads(os.environ['RESP'])
    if 'error' in msg:
        print('refused:', msg['error'].get('message', '')[:200])
        sys.exit(2)
    out = json.loads(msg['result']['content'][0]['text'])
except Exception as e:
    print('unreadable answer:', str(e)[:120])
    sys.exit(2)

if os.environ.get('JSON') == '--json':
    print(json.dumps(out, ensure_ascii=False))
    sys.exit(0)

if not out.get('running'):
    print('browser is off -- its logins cannot be read (' + str(out.get('hint', '')) + ')')
    sys.exit(3)

MARK = {'signed_in': 'OK ', 'expired': 'EXP', 'signed_out': '-- ', 'unknown': '?? '}
for n in out.get('networks', []):
    print(f"{MARK.get(n.get('state'), '   ')} {n.get('name', ''):<10} {n.get('state', '')}")
held = out.get('signedIn') or []
print(f"\n{len(held)} signed in: {', '.join(held) or 'none'}")
PYBODY
