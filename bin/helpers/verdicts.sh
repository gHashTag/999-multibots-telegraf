#!/bin/bash
# tri verdicts -- what the last acceptance run said about each marketplace agent.
#
# The render service checks every agent once a day by itself
# (render/src/agent/daily-acceptance.ts) and `tri agents` adds a run on
# demand; both write to /api/agents/acceptance. This reads the newest
# verdict per agent -- the same answer the /agents cards show. Public read:
# no key, and nothing but agent ids, days, pass/fail, tool names and codes.
#
#   tri verdicts          # the table
#   tri verdicts --json   # the raw answer, for a loop to diff
set -u
ROOT="${1:?repo root required}"
shift
BASE="${RENDER_BASE:-https://vibee-render-production.up.railway.app}"

RESP=$(curl -s --max-time 30 "$BASE/api/agents/acceptance")
[ -n "$RESP" ] || { echo "the service did not answer -- no verdict"; exit 2; }

RESP="$RESP" JSON="${1:-}" python3 - <<'PYBODY'
import json, os, sys

try:
    out = json.loads(os.environ['RESP'])
except Exception as e:
    print('unreadable answer:', str(e)[:120])
    sys.exit(2)
if not out.get('ok'):
    print('the service could not tell:', out.get('error', ''))
    sys.exit(2)
if os.environ.get('JSON') == '--json':
    print(json.dumps(out, ensure_ascii=False))
    sys.exit(0)

verdicts = out.get('verdicts') or []
if not verdicts:
    print('no agent has been checked yet (the daily run starts 10 min after a deploy)')
    sys.exit(3)
failed = 0
for v in sorted(verdicts, key=lambda v: v.get('agent', '')):
    ok = v.get('pass') is True
    failed += 0 if ok else 1
    why = '' if ok else '  ' + ','.join(v.get('codes') or [])
    tools = ','.join(v.get('tools') or [])
    print(f"{'PASS' if ok else 'FAIL'}  {v.get('agent', ''):<8} {v.get('at', '')[:16]}  [{tools}]{why}")
print(f"\n{len(verdicts) - failed}/{len(verdicts)} passing")
sys.exit(1 if failed else 0)
PYBODY
