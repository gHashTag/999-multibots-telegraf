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
ANSWER=$(curl -s -m 30 "$B/api/browser/journal?limit=$N" -H "X-Agent-Key: $AK")
# The answer goes in through the environment and the code through a quoted
# heredoc: the first version put Python inside a single-quoted bash string,
# escaped its quotes, and died with SyntaxError on its first real answer.
ANSWER="$ANSWER" python3 - <<'PY'
import json, os, sys
try:
    d = json.loads(os.environ.get("ANSWER") or "")
except Exception:
    print("journal: unreadable answer -- could not read"); sys.exit(2)
if not d.get("ok"):
    print("journal: refused:", str(d.get("error") or d)[:160]); sys.exit(2)
steps = d.get("steps") or []
if not steps:
    print("journal: no steps yet"); sys.exit(0)
for s in steps:
    det = s.get("detail") or {}
    if det.get("error"): key = det["error"]
    elif det.get("seen"): key = det["seen"]
    elif det.get("seenPending"): key = "(description pending)"
    elif det.get("url"): key = det["url"]
    elif det.get("title"): key = det["title"]
    elif det.get("what"): key = det["what"]
    elif "chars" in det: key = f"{det['chars']} chars"
    elif "x" in det: key = f"x={det['x']} y={det['y']}"
    elif "pages" in det: key = f"pages={det['pages']}"
    else: key = ""
    mark = "ok " if s.get("ok") else "ERR"
    at = s["at"][5:19].replace("T", " ")
    print(f"  {at}  {mark}  {s['tool']:<22} {s['ms']:>6} ms  {str(key)[:90]}")
PY
