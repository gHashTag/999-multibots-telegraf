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
                       # A probe says so (MCP _meta): the owner's journal
                       # keeps it apart from the agent's real work.
                       "params": {"name": name, "arguments": args, "_meta": {"probe": True}}}).encode()
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
# A cold screen -- right after a render deploy the description cache is
# empty -- answers seenPending while the description is still being made.
# That is not blindness: the same screen, a minute later, comes from the
# cache (render agent-tools.ts describeShot). Found 2026-09-22 when eyes
# went red right after a deploy and the journal said "description pending".
if not shot.get("seen") and shot.get("seenPending"):
    print(f"  screenshot: description pending after {secs:.1f} s (cold screen) -- asking again in 60 s")
    time.sleep(60)
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

# THE PERSON'S DOORS STAY SHUT TO AN AGENT (render browser/routes.ts).
# Typing into the person's browser from the app and bringing their logins
# are theirs alone; an agent key must get 403. The typing probe sends an
# EMPTY body on purpose: were the door ever open, it would fail as "nothing
# to type" (400) and still type nothing into the owner's browser.
door() {
  curl -s -m 30 -o /dev/null -w '%{http_code}' -X POST "$B$1" \
    -H "X-Agent-Key: $AK" -H 'Content-Type: application/json' -d "$2"
}
for probe in "/api/browser/type|{}" "/api/browser/cookies|"; do
  path=${probe%%|*}; body=${probe#*|}
  got=$(door "$path" "$body")
  if [ "$got" = 403 ]; then
    echo "  agent at $path: refused (403)"
  else
    echo "  agent at $path: $got -- EXPECTED 403, the person's door is open to an agent"
    code=1
  fi
done

if [ "$opened" = 1 ]; then
  curl -s -m 60 -X DELETE "$B/api/browser/session" -H "X-Agent-Key: $AK" >/dev/null
  echo "  session: closed (logins kept)"
fi
[ $code = 0 ] && echo "eyes: ok -- the agent sees the browser" || echo "eyes: NOT SEEING (see lines above)"
exit $code
