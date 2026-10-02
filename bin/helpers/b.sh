#!/bin/bash
# tri browser <case> -- every AI-browser case from the terminal, through the
# SAME door the agent uses: POST /mcp with the agent key, tool by tool.
#
# Why a door and not a script per case. On 2026-10-02 the blog desk said
# "publish button not found" on Reddit and LinkedIn with the button on screen.
# Proving why took a hand-made curl wrapper, a JSON body built in python, and a
# probe pasted into browser_evaluate: the button lived in a shadow root the
# probe never walked (#3361). Every step of that is a case below now, so the
# next anomaly is one command, not an evening.
#
# Everything acts on the owner's REAL browser, the one he watches. Nothing is
# invisible: a click here is a click he sees. The guard (src/browser/guard.ts)
# still holds -- on a bank, mail or checkout page a press needs his recent
# permission, and this door does not go around it. Passwords: never through
# `type` -- the person types them himself (browser_ask_input).
#
#   tri browser status            tabs with ids; * marks where tools act
#   tri browser front ID          bring a tab forward; tools act there next
#   tri browser open URL          open a tab, timed (the pod took 38-43 s)
#   tri browser time [URL]        how long a new tab takes; closes what it opened
#   tri browser read [ID] [N]     visible text of the page (N chars, 2000)
#   tri browser shot [ID] [FILE]  page screenshot to FILE (/tmp/tri-shot.jpg)
#   tri browser desk [FILE]       the whole screen the person sees
#   tri browser find WORDS [ID]   where a click by these words WOULD land; no click.
#                                 Uses THIS checkout's findProbe: test a probe
#                                 fix against the live page before deploying it
#   tri browser click WORDS [ID]  press by words (the agent's browser_click)
#   tri browser xy X Y [ID]       press at a point from a screenshot
#   tri browser type TEXT         type into the focused field (never a password)
#   tri browser eval CODE [ID]    run an expression in the page, print the value
#   tri browser blank [ID]        why a page shows nothing: mount state, then the
#                                 module scripts re-imported with errors caught
#                                 (t27.ai was blank in the pod: "WebGL not supported")
#   tri browser close ID          close a tab (only one you opened yourself)
#   tri browser sign-in NETWORK   start the agent's sign-in flow for a network
#   tri browser call TOOL [JSON]  any tool, raw: the escape hatch
#
# Exit 0 done, 1 the tool answered with an error, 2 could not ask at all.
set -uo pipefail
ROOT="${1:?repo root required}"
shift
CASE="${1:-status}"
[ $# -gt 0 ] && shift

case "$CASE" in -h|--help|help) sed -n '2,/^set -uo/p' "$0" | sed '$d' | sed 's/^# \{0,1\}//'; exit 0 ;; esac

MAIN=$(git -C "$ROOT" worktree list --porcelain | awk 'NR==1{print $2}')
KEY="${AGENT_KEY:-}"
if [ -z "$KEY" ]; then
  # Explicit service: never relink (railway-link-flapping).
  KEY=$( (cd "${MAIN:-$ROOT}" && railway variables --service vibee-render --kv 2>/dev/null) \
         | grep -E '^AGENT_KEYS=' | cut -d= -f2- | cut -d, -f1 | cut -d: -f1 )
fi
[ -n "$KEY" ] || { echo "нет ключа агента: export AGENT_KEY или railway login"; exit 2; }
BASE="${RENDER_BASE:-https://vibee-render-production.up.railway.app}"
NONE='{}'  # "${2:-{}}" expands to "{\\}" in bash: keep the empty object here

# call TOOL JSON [MAX_TIME] -> the tool's own answer on stdout (structured JSON
# or text), exit 1 on a tool error, 2 when nothing came back.
call() {
  local body resp
  body=$(TOOL="$1" ARGS="${2:-$NONE}" python3 -c '
import json, os
print(json.dumps({"jsonrpc": "2.0", "id": 1, "method": "tools/call",
  "params": {"name": os.environ["TOOL"], "arguments": json.loads(os.environ["ARGS"])}}))')
  [ -n "$body" ] || { echo "аргументы не JSON: $2" >&2; return 2; }
  resp=$(curl -s --max-time "${3:-90}" "$BASE/mcp" -H "X-Agent-Key: $KEY" \
    -H 'Content-Type: application/json' -d "$body")
  [ -n "$resp" ] || { echo "сервис не ответил за ${3:-90} с — ответа нет (это не «пусто»)" >&2; return 2; }
  RESP="$resp" python3 -c '
import json, os, sys
try:
    r = json.loads(os.environ["RESP"])
except Exception:
    print(os.environ["RESP"][:400]); sys.exit(2)
if "error" in r:
    print("ошибка:", (r["error"] or {}).get("message", r["error"])); sys.exit(1)
res = r.get("result") or {}
s = res.get("structuredContent")
if s is None:
    txt = "".join(c.get("text", "") for c in res.get("content") or [] if isinstance(c, dict))
    try:
        s = json.loads(txt)
    except Exception:
        s = txt
print(json.dumps(s, ensure_ascii=False) if not isinstance(s, str) else s)
sys.exit(1 if res.get("isError") else 0)'
}

# js_string VALUE -> a JSON string literal, safe inside an argument object.
js() { V="$1" python3 -c 'import json,os;print(json.dumps(os.environ["V"]))'; }

# Tools act on the front tab; an ID argument makes that tab the front first.
front() { [ -n "${1:-}" ] && { call browser_status "{\"front\":$(js "$1")}" >/dev/null || return $?; }; return 0; }

# int VALUE NAME -> exit 2 unless VALUE is a whole number (it goes into JSON bare).
int() { case "$1" in ''|*[!0-9]*) echo "$2 должно быть целым числом: $1"; exit 2 ;; esac; }

# ids -> the tab ids of one browser_status listing, or exit 2 when the
# listing did not come back: "no list" must never read as "no tabs".
ids() {
  local out
  out=$(call browser_status '{}') || { echo "список вкладок не пришёл: $out" >&2; return 2; }
  OUT="$out" python3 -c '
import json, os, sys
try:
    d = json.loads(os.environ["OUT"])
    pages = d["pages"] if d.get("running") else []
    print(" ".join(p["id"] for p in pages))
except Exception:
    sys.exit(2)' || { echo "список вкладок не разобрать: ${out:0:200}" >&2; return 2; }
}

pretty_status() {
  python3 -c '
import json, sys
raw = sys.stdin.read()
try:
    d = json.loads(raw)
except Exception:
    print(raw); sys.exit(0)
if not d.get("running"):
    print("браузер не запущен:", d.get("hint", "")); sys.exit(0)
pages = d.get("pages") or []
watched = "да" if d.get("watchedByThePerson") else "нет"
print(f"вкладок: {len(pages)}   человек смотрит: {watched}")
for p in pages:
    mark = "*" if p.get("actingHere") else " "
    pid, title, url = p.get("id", ""), str(p.get("title", ""))[:40], str(p.get("url", ""))[:70]
    print(f" {mark} {pid}  {title:<40}  {url}")
if d.get("note"): print("примечание:", d["note"])'
}

case "$CASE" in
  status|tabs) call browser_status '{}' | pretty_status ;;
  front)
    [ -n "${1:-}" ] || { echo "нужен id вкладки: tri browser status"; exit 2; }
    call browser_status "{\"front\":$(js "$1")}" | pretty_status ;;
  open)
    [ -n "${1:-}" ] || { echo "нужен адрес"; exit 2; }
    t0=$(date +%s); call browser_open "{\"url\":$(js "$1")}" 120; rc=$?
    echo "за $(( $(date +%s) - t0 )) с"; exit $rc ;;
  time)
    # Measures, then closes ONLY the tab this command opened. Both listings
    # must come back, and exactly one id may be new: anything else closes
    # nothing -- the person's tab is never a guess (review on #3365).
    URL="${1:-https://example.com/}"
    before=$(ids) || exit 2
    t0=$(date +%s); out=$(call browser_open "{\"url\":$(js "$URL")}" 120); rc=$?
    took=$(( $(date +%s) - t0 ))
    echo "новая вкладка: ${took} с (код $rc)  $URL"
    [ $rc -eq 0 ] || echo "$out"
    if after=$(ids); then
      new=""; n=0
      for id in $after; do case " $before " in *" $id "*) ;; *) new="$id"; n=$((n + 1)) ;; esac; done
      opened=$(OUT="$out" python3 -c 'import json,os
try: print(json.loads(os.environ["OUT"]).get("id") or "")
except Exception: print("")')
      # No id back is trusted only from an open that succeeded: after a
      # failed or timed-out open the one new tab may be the person's.
      if [ $n -eq 1 ] && { [ "$opened" = "$new" ] || { [ -z "$opened" ] && [ $rc -eq 0 ]; }; }; then
        call browser_close_tab "{\"id\":$(js "$new")}" >/dev/null && echo "закрыл свою: $new"
      elif [ $n -eq 0 ]; then echo "новой вкладки в списке нет — ничего не закрыл (под мог заменить старую)"
      else echo "новых id: $n ($after), открыт: ${opened:-?} — не угадываю, ничего не закрыл"; fi
    else echo "второй список не пришёл — ничего не закрыл; открытая: tri browser status"; fi
    [ $took -le 60 ] || echo "медленнее 60 с: NEW_PAGE_TIMEOUT_MS в cdp.ts оборвёт такую вкладку"
    exit $rc ;;
  read)
    N="${2:-2000}"; int "$N" "длина"
    front "${1:-}" || exit $?
    call browser_read "{\"maxChars\":$N}" | python3 -c '
import json, sys
raw = sys.stdin.read()
try:
    d = json.loads(raw); print(d.get("title", ""), "|", d.get("url", "")); print(); print(d.get("text", ""))
except Exception:
    print(raw)' ;;
  shot|desk)
    if [ "$CASE" = shot ]; then front "${1:-}" || exit $?; FILE="${2:-/tmp/tri-shot.jpg}"; ARGS='{}'
    else FILE="${1:-/tmp/tri-desk.jpg}"; ARGS='{"desktop":true}'; fi
    call browser_screenshot "$ARGS" 120 | FILE="$FILE" python3 -c '
import base64, json, os, sys
raw = sys.stdin.read()
try:
    d = json.loads(raw)
except Exception:
    print(raw); sys.exit(1)
open(os.environ["FILE"], "wb").write(base64.b64decode(d["base64"]))
print("снимок:", os.environ["FILE"])
if d.get("painted") is False: print("страница ещё не отрисовалась:", d.get("note", ""))
for k in ("described", "description", "summary"):
    if d.get(k): print(d[k])' ;;
  find)
    [ -n "${1:-}" ] || { echo "нужны слова кнопки"; exit 2; }
    front "${2:-}" || exit $?
    PROBE=$(cd "$ROOT/apps/vibee-editor/render" && WANT="$1" npx -y tsx -e '
import { findProbe } from "./src/browser/find-target.ts"
process.stdout.write(findProbe(process.env.WANT ?? ""))' 2>/dev/null)
    [ -n "$PROBE" ] || { echo "не собрал пробу из find-target.ts (tsx?)"; exit 2; }
    out=$(call browser_evaluate "{\"code\":$(js "$PROBE")}"); rc=$?
    [ $rc -eq 0 ] || { echo "$out"; exit $rc; }
    # browser_evaluate answers {"value": ...}; null means the probe saw nothing.
    hit=$(OUT="$out" python3 -c '
import json, os
try:
    d = json.loads(os.environ["OUT"])
except Exception:
    d = None
v = d.get("value", d) if isinstance(d, dict) else d
print(json.dumps(v, ensure_ascii=False) if v else "")')
    if [ -z "$hit" ]; then
      echo "НЕ НАЙДЕНО: «$1» — клик по этим словам здесь промахнётся."
      echo "  кнопка в тени/фрейме? tri browser eval 'document.querySelectorAll(\"*\").length'; снимок: tri browser shot"
      exit 1
    fi
    echo "нашёл бы: $hit"
    echo "(проба этой рабочей копии; страница прокручена к цели, клика не было)" ;;
  click)
    [ -n "${1:-}" ] || { echo "нужны слова кнопки"; exit 2; }
    front "${2:-}" || exit $?
    call browser_click "{\"text\":$(js "$1")}" ;;
  xy)
    [ -n "${2:-}" ] || { echo "нужны X и Y"; exit 2; }
    int "$1" X; int "$2" Y
    front "${3:-}" || exit $?
    call browser_click "{\"x\":$1,\"y\":$2}" ;;
  type)
    [ -n "${1:-}" ] || { echo "нужен текст"; exit 2; }
    call browser_type "{\"text\":$(js "$1")}" ;;
  eval)
    [ -n "${1:-}" ] || { echo "нужно выражение"; exit 2; }
    front "${2:-}" || exit $?
    call browser_evaluate "{\"code\":$(js "$1")}" ;;
  blank)
    # A blank page answers HTTP 200 and reads as "" -- the agent cannot tell
    # "still loading" from "crashed". Re-importing the page's own module
    # scripts with a listener reproduces the crash and names it (2026-10-03:
    # t27.ai's React tree died on Babylon's "WebGL not supported" in the pod).
    front "${1:-}" || exit $?
    call browser_evaluate "{\"code\":$(js 'new Promise(done => {
  const errs = [];
  const st = () => ({ href: location.href, ready: document.readyState,
    nodes: document.querySelectorAll("*").length,
    text: (document.body && document.body.innerText || "").trim().length });
  const before = st();
  if (before.text > 0) return done({ blank: false, ...before });
  addEventListener("error", e => errs.push(String(e.message || e.error)));
  addEventListener("unhandledrejection", e => errs.push("rejected: " + String(e.reason && (e.reason.stack || e.reason)).slice(0, 300)));
  const mods = [...document.scripts].filter(s => s.type === "module" && s.src).map(s => s.src);
  Promise.allSettled(mods.map(src => import(src + (src.includes("?") ? "&" : "?") + "blank=" + Date.now())))
    .then(r => setTimeout(() => done({ blank: true, before, after: st(), modules: mods,
      importFailed: r.filter(x => x.status === "rejected").map(x => String(x.reason).slice(0, 300)),
      errors: errs }), 4000));
})')}" 60 ;;
  close)
    [ -n "${1:-}" ] || { echo "нужен id вкладки"; exit 2; }
    call browser_close_tab "{\"id\":$(js "$1")}" ;;
  sign-in)
    [ -n "${1:-}" ] || { echo "нужна сеть: x, linkedin, reddit, threads…"; exit 2; }
    call browser_sign_in "{\"network\":$(js "$1")}" 120 ;;
  call)
    [ -n "${1:-}" ] || { echo "нужно имя инструмента"; exit 2; }
    call "$1" "${2:-$NONE}" "${3:-120}" ;;
  *) echo "неизвестный случай: $CASE  (tri browser help)"; exit 2 ;;
esac
