#!/bin/bash
# WHAT DID THE AGENT DO IN THE OWNER'S BROWSER?
#
# The owner's browser journal (render src/browser/journal.ts): every browser
# tool call -- when, which tool, ok or failed, how long, and the sanitised
# facts (address without query, what the screenshot saw, typed text by
# length only). Newest first. Read-only; never opens a browser.
#
#   tri journal [n]      last n steps (default 20)
# Exit 0 read, 2 could not read.
set -uo pipefail
ROOT="$1"; shift
N="${1:-20}"
B="${RENDER_BASE:-https://vibee-render-production.up.railway.app}"
MAIN=$(git -C "$ROOT" worktree list --porcelain | awk 'NR==1{print $2}')
AK=$( (cd "${MAIN:-$ROOT}" && railway variables --service vibee-render --kv 2>/dev/null) \
      | grep -E '^AGENT_KEYS=' | cut -d= -f2- | cut -d, -f1 | cut -d: -f1 )
[ -z "$AK" ] && { echo "journal: no agent key (railway login?) -- could not read"; exit 2; }
curl -s -m 30 "$B/api/browser/journal?limit=$N" -H "X-Agent-Key: $AK" | python3 -c '
import json, sys
try:
    d = json.load(sys.stdin)
except Exception:
    print("journal: unreadable answer -- could not read"); sys.exit(2)
if not d.get("ok"):
    print("journal: refused:", str(d.get("error") or d)[:160]); sys.exit(2)
steps = d.get("steps") or []
if not steps:
    print("journal: no steps yet"); sys.exit(0)
for s in steps:
    det = s.get("detail") or {}
    key = det.get("error") or det.get("seen") or det.get("url") or det.get("title") or det.get("what") \
          or (f"{det.get(\"chars\")} chars" if "chars" in det else "") \
          or (f"x={det.get(\"x\")} y={det.get(\"y\")}" if "x" in det else "") \
          or (f"pages={det.get(\"pages\")}" if "pages" in det else "")
    mark = "ok " if s.get("ok") else "ERR"
    print(f"  {s[\"at\"][5:19].replace(\"T\",\" \")}  {mark}  {s[\"tool\"]:<22} {s[\"ms\"]:>6} ms  {str(key)[:90]}")
'
