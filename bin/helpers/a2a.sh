#!/bin/bash
# TEST THE OWNER'S AGENT BY TALKING TO IT, THE WAY THE OWNER DOES (A2A).
#
# Owner, 2026-09-22: "I like how you train it through the browser -- connect
# my job and social accounts through the agent, to test how it copes; and
# make getting into this test mode fast". One command instead of a hand-made
# curl with a key from Railway and a stream parser:
#
#   tri a2a "<task>" [--surface miniapp|bot|agent] [--fresh]
#
# Sends <task> to the owner's agent (POST /api/agent/chat, the owner's agent
# key) as a turn of the owner's OWN conversation, with the last 20 turns for
# context (--fresh: none). On the mini app surface (default) the turn shows
# up in the owner's chat on their phone, cards included, so they can press
# what the agent proposes while this watches. The task is prefixed with a
# test mark, so the transcript never passes a tester's words off as theirs.
#
# Prints the answer as it streams, each tool with its time, the cards the
# agent proposed, and the browser steps this turn took (tri journal).
# Exit 0 answered, 1 the agent errored or said nothing, 2 could not ask.
set -uo pipefail
ROOT="$1"; shift
TASK=""; SURFACE="miniapp"; FRESH=0
while [ $# -gt 0 ]; do
  case "$1" in
    --surface) SURFACE="$2"; shift 2 ;;
    --fresh) FRESH=1; shift ;;
    *) TASK="$1"; shift ;;
  esac
done
[ -z "$TASK" ] && { echo 'usage: tri a2a "<task>" [--surface miniapp|bot|agent] [--fresh]'; exit 2; }
B="${RENDER_BASE:-https://vibee-render-production.up.railway.app}"
MAIN=$(git -C "$ROOT" worktree list --porcelain | awk 'NR==1{print $2}')
AK=$( (cd "${MAIN:-$ROOT}" && railway variables --service vibee-render --kv 2>/dev/null) \
      | grep -E '^AGENT_KEYS=' | cut -d= -f2- | cut -d, -f1 | cut -d: -f1 )
[ -z "$AK" ] && { echo "a2a: no agent key (railway login?) -- could not ask"; exit 2; }
HIST='{"messages":[]}'
[ "$FRESH" = 0 ] && HIST=$(curl -s -m 20 "$B/api/agent/history?limit=20" -H "X-Agent-Key: $AK")
AK="$AK" B="$B" TASK="$TASK" SURFACE="$SURFACE" HIST="$HIST" python3 - <<'PY'
import json, os, sys, time, re, urllib.request
ak, base, surface = os.environ["AK"], os.environ["B"], os.environ["SURFACE"]
MARK = "🧪 [тест от агента-тестировщика] "  # cyrillic-ok: shown to the owner
try:
    past = json.loads(os.environ.get("HIST") or "{}").get("messages") or []
except Exception:
    past = []
msgs = [{"role": m["role"] if m.get("role") == "user" else "assistant", "content": str(m.get("content", ""))}
        for m in past if isinstance(m, dict) and m.get("content")][-20:]
msgs.append({"role": "user", "content": MARK + os.environ["TASK"]})
req = urllib.request.Request(base + "/api/agent/chat",
    data=json.dumps({"messages": msgs, "surface": surface}).encode(),
    headers={"X-Agent-Key": ak, "Content-Type": "application/json"})
t0 = time.time(); text = ""; err = ""; tools = []
print(f"  -> {surface}: {os.environ['TASK'][:120]}")
try:
    with urllib.request.urlopen(req, timeout=600) as r:
        for raw in r:
            line = raw.decode("utf-8", "replace").strip()
            if not line:
                continue
            try:
                ev = json.loads(line)
            except Exception:
                continue
            kind = ev.get("тип")  # cyrillic-ok: the stream's own field names
            if kind == "текст":  # cyrillic-ok
                chunk = ev.get("текст", "")  # cyrillic-ok
                text += chunk; sys.stdout.write(chunk); sys.stdout.flush()
            elif kind == "инструмент":  # cyrillic-ok
                tools.append(ev.get("имя")); print(f"\n  [tool {ev.get('имя')}]", end="", flush=True)  # cyrillic-ok
            elif kind == "результат":  # cyrillic-ok
                print(f" {ev.get('мс')} ms", flush=True)  # cyrillic-ok
            elif kind == "ошибка":  # cyrillic-ok
                err = ev.get("текст", ""); print(f"\n  ERROR {err[:300]}")  # cyrillic-ok
except Exception as e:
    print(f"\na2a: the call failed: {str(e)[:200]}"); sys.exit(2)
cards = re.findall(r"\[\[(card|step):\s*([^|\]\n]+?)\s*(?:\|[^\]\n]*)?\]\]", text)
print(f"\n  -- {time.time()-t0:.0f} s, {len(tools)} tools, {len(cards)} cards")
for k, title in cards:
    print(f"     [{k}] {title}")
sys.exit(1 if (err or not text.strip()) else 0)
PY
code=$?
echo "  -- browser steps this turn:"
bash "$ROOT/bin/helpers/journal.sh" "$ROOT" 8 2>/dev/null | sed -n '2,9p'
exit $code
