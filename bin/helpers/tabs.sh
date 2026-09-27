#!/bin/bash
# HOW MANY TABS ARE OPEN IN THE OWNER'S BROWSER, AND HOW CLOSE TO THE CEILING.
#
# The number that was invisible while it mattered. On 27.09.2026 the profile
# grew to 27 tabs, Chromium restored them all at once, the pod's PID cgroup ran
# out (pids.max = 1000), and the zygote never recovered: old tabs kept
# answering, every new tab hung forever, and a signed-in Reddit account looked
# like a broken login for a day. From outside, 27 tabs and 9 tabs looked
# identical -- HTTP 200 either way.
#
# Read-only: lists targets and prints the plan the sweep WOULD run. Closes
# nothing, opens nothing, signs nobody out.
#
#   tri tabs          the table
#   tri tabs --json   the raw answer, for a loop to diff
# Exit 0 read, 2 could not read, 3 over the cap (for a cron to notice).
set -uo pipefail
ROOT="$1"; shift
JSON="${1:-}"
B="${RENDER_BASE:-https://vibee-render-production.up.railway.app}"
MAIN=$(git -C "$ROOT" worktree list --porcelain | awk 'NR==1{print $2}')
AK="${AGENT_KEY:-}"
if [ -z "$AK" ]; then
  AK=$( (cd "${MAIN:-$ROOT}" && railway variables --service vibee-render --kv 2>/dev/null) \
        | grep -E '^AGENT_KEYS=' | cut -d= -f2- | cut -d, -f1 | cut -d: -f1 )
fi
[ -n "$AK" ] || { echo "tabs: no agent key (railway login?) -- could not read"; exit 2; }

ANSWER=$(curl -s -m 30 "$B/api/browser/tabs" -H "X-Agent-Key: $AK")
[ -n "$ANSWER" ] || { echo "tabs: the service did not answer -- could not read"; exit 2; }

ANSWER="$ANSWER" JSON="$JSON" python3 - <<'PY'
import json, os, sys
try:
    d = json.loads(os.environ.get("ANSWER") or "")
except Exception:
    print("tabs: unreadable answer -- could not read"); sys.exit(2)
if not d.get("ok"):
    print("tabs: refused:", str(d.get("error") or d)[:160]); sys.exit(2)
if os.environ.get("JSON") == "--json":
    print(json.dumps(d, ensure_ascii=False)); sys.exit(0)
pods = d.get("pods") or []
if not pods:
    # Not "all clear": a deployment with a configured pod always has a row here.
    print("tabs: ни одного пода не видно -- и это само по себе находка")
    sys.exit(2)
over = 0
for p in pods:
    if not p.get("reachable"):
        print(f"  {p.get('who','?'):<18} НЕ ОТВЕЧАЕТ -- поднимается или в беде")
        continue
    pages, cap = p.get("pages", 0), p.get("cap", 0)
    if pages > cap: over = 1
    doomed = p.get("wouldClose") or []
    print(f"  {p.get('who','?'):<18} {pages:>3} вкладок из {cap}  "
          f"{p.get('origins',0):>3} сайтов  "
          f"{'уборка закроет ' + str(len(doomed)) if doomed else 'убирать нечего'}")
    for t in doomed[:8]:
        print(f"      - {t.get('why',''):<10} {str(t.get('url',''))[:70]}")
sys.exit(3 if over else 0)
PY
