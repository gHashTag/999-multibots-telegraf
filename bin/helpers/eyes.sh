#!/bin/bash
# DOES THE AGENT SEE THE PERSON'S BROWSER?
#
# The live check run by hand five times on 2026-09-22, as one command:
# through the owner's agent key, the tools an agent actually calls --
# browser_status and browser_screenshot { desktop: true } -- and what came
# back: tabs, picture size, and `seen` (the vision endpoint's description).
#
# That night the answers went: "the Queen's board" for a Google sign-in (the
# model was handed base64 it could not see), then seen=null (a full-size
# shot timed out the CPU vision service), then a correct description in
# 2.2 s. Each step is a line here.
#
# Opens the owner's browser session only if none is live, and closes only
# what it opened (logins are kept either way). Keys stay in variables.
# Exit 0 sees, 1 does not see (or no tabs), 2 could not check.
set -uo pipefail
ROOT="$1"
B="${RENDER_BASE:-https://vibee-render-production.up.railway.app}"

# Railway links a project to a DIRECTORY; a fresh worktree is not linked and
# `railway variables` answers nothing there. Ask from the main checkout, and
# name the service with --service instead of re-linking it back and forth.
MAIN=$(git -C "$ROOT" worktree list --porcelain | awk 'NR==1{print $2}')
AK=$( (cd "${MAIN:-$ROOT}" && railway variables --service vibee-render --kv 2>/dev/null) \
      | grep -E '^AGENT_KEYS=' | cut -d= -f2- | cut -d, -f1 | cut -d: -f1 )
if [ -z "$AK" ]; then echo "eyes: no agent key (railway login?) -- could not check"; exit 2; fi

state=$(curl -s -m 30 "$B/api/browser/session" -H "X-Agent-Key: $AK" \
  | python3 -c 'import json,sys;print(json.load(sys.stdin).get("state","?"))' 2>/dev/null)
opened=0
if [ "$state" != "live" ]; then
  state=$(curl -s -m 90 -X POST "$B/api/browser/session" -H "X-Agent-Key: $AK" \
    | python3 -c 'import json,sys;print(json.load(sys.stdin).get("state","?"))' 2>/dev/null)
  opened=1
  echo "  session: opened for this check ($state)"
else
  echo "  session: already live (left as it is)"
fi
if [ "$state" != "live" ]; then echo "eyes: no live browser ($state) -- could not check"; exit 2; fi

AK="$AK" B="$B" python3 - <<'PY'
import json, os, sys, time, urllib.request
ak, base = os.environ['AK'], os.environ['B']
def call(name, args):
    body = json.dumps({"jsonrpc": "2.0", "id": 1, "method": "tools/call",
                       "params": {"name": name, "arguments": args}}).encode()
    req = urllib.request.Request(base + "/mcp", data=body,
        headers={"X-Agent-Key": ak, "Content-Type": "application/json"})
    t0 = time.time()
    with urllib.request.urlopen(req, timeout=120) as r:
        d = json.load(r)
    return d.get("result", {}).get("structuredContent"), d.get("error"), time.time() - t0
st, err, _ = call("browser_status", {})
pages = (st or {}).get("pages") or []
print(f"  tabs: {len(pages)}" + (f" -- front: {pages[0].get('title','')[:60]}" if pages else ""))
shot, err, secs = call("browser_screenshot", {"desktop": True})
if not shot:
    print(f"  screenshot: FAILED {str(err)[:160]}"); sys.exit(1)
kb = len(shot.get("base64", "")) * 3 // 4 // 1024
seen = shot.get("seen")
print(f"  screenshot: {kb} KB desktop, {len(shot.get('tabs') or [])} tabs named, {secs:.1f} s")
print(f"  seen: {seen[:200] if seen else 'NONE -- the agent is blind to this shot'}")
sys.exit(0 if (seen and pages) else 1)
PY
code=$?
if [ "$opened" = 1 ]; then
  curl -s -m 60 -X DELETE "$B/api/browser/session" -H "X-Agent-Key: $AK" >/dev/null
  echo "  session: closed (logins kept)"
fi
[ $code = 0 ] && echo "eyes: ok -- the agent sees the browser" || echo "eyes: NOT SEEING (see lines above)"
exit $code
