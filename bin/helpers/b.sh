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
#                                 (t27.ai was blank in the pod: "WebGL not supported");
#                                 staleTab = the tab runs an older build than the
#                                 site serves now: reload before blaming the code
#   tri browser close ID          close a tab (only one you opened yourself)
#   tri browser reload ID         reload a tab (a staleTab from blank); loses
#                                 anything typed and not sent -- never a composer
#   tri browser focus ID          go back to an open tab (browser_focus_tab):
#                                 opens nothing, closes nothing
#   tri browser logins            which networks it is signed into, by cookie
#                                 NAME only (tri logins; values never leave the pod)
#   tri browser sign-in NETWORK   start the agent's sign-in flow for a network
#   tri browser wait WORDS [S] [ID]  until the page text holds WORDS (S s, 60):
#                                 "loaded" measured, not guessed. Reads only
#   tri browser layers [ID]       why a visible button is "not found": shadow
#                                 roots, iframes (cross-origin = unreachable)
#   tri browser composer [ID]     what X's composer boxes hold right now, box by
#                                 box, and which post buttons are there. Reads
#                                 only: the check behind #3373 (mangled thread)
#   tri browser ask WHAT [S]      ask the person to allow an irreversible act
#                                 (browser_ask_permission): a REAL question on his
#                                 phone, two buttons; waits S s (0..120, 0)
#   tri browser ask-input KIND WHY [X Y]  the person types into a field himself
#                                 (browser_ask_input; KIND password|email|code|
#                                 text|action); you learn only "N chars typed"
#   tri browser ask-input choice WHY "A|B|C"  he presses one of the options
#   tri browser doctor            start every loop tick with it: tab list vs the
#                                 cap, cover, and the FRONT tab read (blank,
#                                 staleTab, unsent X composer text), each anomaly
#                                 with its fix command. Probes only: never starts
#                                 a visit (that messages the owner), never tours
#   tri browser call TOOL [JSON]  any tool, raw: the escape hatch
#   tri browser cover             every browser_* tool in agent-tools.ts has a
#                                 case here (exit 1 names the ones that do not)
#
# Exit 0 done, 1 the tool answered with an error, 2 could not ask at all.
set -uo pipefail
ROOT="${1:?repo root required}"
shift
CASE="${1:-status}"
[ $# -gt 0 ] && shift

case "$CASE" in -h|--help|help) sed -n '2,/^set -uo/p' "$0" | sed '$d' | sed 's/^# \{0,1\}//'; exit 0 ;; esac

# cover needs no key and no network: it reads two files. On 2026-10-03 four
# of the thirteen tools (logins, focus, ask, ask-input) had no case, so the
# only way to try them by hand was the raw `call`.
if [ "$CASE" = cover ]; then
  REG="$ROOT/apps/vibee-editor/render/src/browser/agent-tools.ts"
  [ -f "$REG" ] || { echo "нет реестра: $REG"; exit 2; }
  tools=$(grep -oE "name: '(browser_[a-z_]+)'" "$REG" | cut -d"'" -f2 | sort -u)
  miss=""
  # A case calls the tool itself, or hands off to the one helper that does
  # (logins -> logins.sh, which `tri logins` shares).
  for t in $tools; do
    grep -q "call $t \"" "$0" || grep -q "\"name\":\"$t\"" "$(dirname "$0")/logins.sh" || miss="$miss $t"
  done
  echo "инструментов: $(echo "$tools" | wc -w | tr -d ' ')"
  [ -z "$miss" ] && { echo "у каждого есть случай"; exit 0; }
  echo "без случая:$miss  -- добавить в b.sh (и в шапку)"; exit 1
fi

MAIN=$(git -C "$ROOT" worktree list --porcelain | awk 'NR==1{print $2}')
KEY="${AGENT_KEY:-}"
if [ -z "$KEY" ]; then
  # Explicit service: never relink (railway-link-flapping).
  KEY=$( (cd "${MAIN:-$ROOT}" && railway variables --service vibee-render --environment production --kv 2>/dev/null) \
         | grep -E '^AGENT_KEYS=' | cut -d= -f2- | cut -d, -f1 | cut -d: -f1 )
fi
[ -n "$KEY" ] || { echo "нет ключа агента: export AGENT_KEY или railway login"; exit 2; }
BASE="${RENDER_BASE:-https://vibee-render-production.up.railway.app}"
NONE='{}'  # "${2:-{}}" expands to "{\\}" in bash: keep the empty object here

# call TOOL JSON [MAX_TIME] [probe] -> the tool's own answer on stdout
# (structured JSON or text), exit 1 on a tool error, 2 when nothing came back.
# "probe" sets params._meta.probe: the server then never starts a browser
# visit for the call -- a started visit messages the owner (liveSession).
call() {
  local body resp
  body=$(TOOL="$1" ARGS="${2:-$NONE}" PROBE="${4:-}" python3 -c '
import json, os
params = {"name": os.environ["TOOL"], "arguments": json.loads(os.environ["ARGS"])}
if os.environ["PROBE"] == "probe":
    params["_meta"] = {"probe": True}
print(json.dumps({"jsonrpc": "2.0", "id": 1, "method": "tools/call", "params": params}))')
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
      echo "  кнопка в тени/фрейме? tri browser layers; снимок: tri browser shot"
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
  const mine = [...document.scripts].filter(s => s.type === "module" && s.src).map(s => new URL(s.src).pathname);
  const served = fetch(location.href, { cache: "no-store" }).then(r => r.text()).then(html =>
    [...new DOMParser().parseFromString(html, "text/html").querySelectorAll("script[type=module][src]")]
      .map(s => new URL(s.getAttribute("src"), location.href).pathname)).catch(() => null);
  addEventListener("error", e => errs.push(String(e.message || e.error)));
  addEventListener("unhandledrejection", e => errs.push("rejected: " + String(e.reason && (e.reason.stack || e.reason)).slice(0, 300)));
  const mods = [...document.scripts].filter(s => s.type === "module" && s.src).map(s => s.src);
  Promise.allSettled(mods.map(src => import(src + (src.includes("?") ? "&" : "?") + "blank=" + Date.now())))
    .then(r => setTimeout(() => served.then(now => done({ blank: true, before, after: st(), modules: mods,
      importFailed: r.filter(x => x.status === "rejected").map(x => String(x.reason).slice(0, 300)),
      errors: errs,
      ...(now && now.some(p => !mine.includes(p)) ? { staleTab: { tab: mine, serverNow: now,
        note: "this tab runs an older build than the site serves: reload it before reading the error as live" } } : {}) })), 4000));
})')}" 60 ;;
  close)
    [ -n "${1:-}" ] || { echo "нужен id вкладки"; exit 2; }
    call browser_close_tab "{\"id\":$(js "$1")}" ;;
  reload)
    # ID is required: a reload throws away whatever was typed and not sent,
    # so it is never "whatever tab is in front".
    [ -n "${1:-}" ] || { echo "нужен id вкладки: tri browser status"; exit 2; }
    front "$1" || exit $?
    call browser_evaluate "{\"code\":$(js 'setTimeout(() => location.reload(), 50), location.href')}" ;;
  focus)
    [ -n "${1:-}" ] || { echo "нужен id вкладки: tri browser status"; exit 2; }
    call browser_focus_tab "{\"id\":$(js "$1")}" ;;
  logins)
    # One home for the table: logins.sh (also `tri logins`), not a copy here.
    bash "$(dirname "$0")/logins.sh" "$ROOT" "$@" ;;
  sign-in)
    [ -n "${1:-}" ] || { echo "нужна сеть: x, linkedin, reddit, threads…"; exit 2; }
    call browser_sign_in "{\"network\":$(js "$1")}" 120 ;;
  wait)
    # The pod took 38-43 s for a new tab; "open answered" is not "the page is
    # there". Polls the agent's own read, so it waits for what the agent sees.
    [ -n "${1:-}" ] || { echo "нужны слова, которых ждём"; exit 2; }
    S="${2:-60}"; int "$S" "секунды"
    front "${3:-}" || exit $?
    t0=$(date +%s)
    while :; do
      out=$(call browser_read '{"maxChars":20000}' 60); rc=$?
      if [ $rc -eq 0 ] && OUT="$out" W="$1" python3 -c '
import json, os, sys
try: t = json.loads(os.environ["OUT"]).get("text", "")
except Exception: t = os.environ["OUT"]
sys.exit(0 if os.environ["W"].lower() in t.lower() else 1)'; then
        echo "есть «$1» через $(( $(date +%s) - t0 )) с"; exit 0
      fi
      [ $rc -eq 2 ] && { echo "$out"; exit 2; }
      [ $(( $(date +%s) - t0 )) -ge "$S" ] && break
      sleep 3
    done
    echo "НЕТ «$1» за $S с — страница: tri browser read; пустая? tri browser blank"
    exit 1 ;;
  layers)
    # 2026-10-02: Reddit's and LinkedIn's buttons were on screen and "not
    # found" -- they lived in shadow roots the probe never walked (#3361).
    # This counts the places a document query cannot see into.
    front "${1:-}" || exit $?
    call browser_evaluate "{\"code\":$(js '(() => {
  const hosts = [];
  const walk = root => root.querySelectorAll("*").forEach(el => {
    if (el.shadowRoot) { hosts.push(el.tagName.toLowerCase()); walk(el.shadowRoot); }
  });
  walk(document);
  const frames = [...document.querySelectorAll("iframe")].map(f => {
    let same = false; try { same = !!f.contentDocument; } catch (e) {}
    return { src: (f.src || "about:blank").slice(0, 100), reachable: same };
  });
  const count = {}; hosts.forEach(t => count[t] = (count[t] || 0) + 1);
  const tags = Object.fromEntries(Object.entries(count).sort((a, b) => b[1] - a[1]).slice(0, 12));
  return { href: location.href, nodes: document.querySelectorAll("*").length,
    shadowRoots: hosts.length, shadowHosts: tags, iframes: frames,
    note: "find/click walk open shadow roots; a cross-origin iframe is out of reach: click by xy from a shot" };
})()')}" ;;
  composer)
    # 2026-10-03: a thread went out with ~115 chars lost from its first post;
    # per-char typing into Draft.js drops characters and "\n" (#3373). This
    # is what the desk now reads back before "Post all" -- by hand.
    front "${1:-}" || exit $?
    call browser_evaluate "{\"code\":$(js '(() => {
  const boxes = [...document.querySelectorAll("[data-testid^=\"tweetTextarea_\"]")]
    .filter(b => /^tweetTextarea_\d+$/.test(b.getAttribute("data-testid")))
    .map(b => ({ box: b.getAttribute("data-testid"), chars: (b.innerText || "").length,
      text: (b.innerText || "").slice(0, 300) }));
  const buttons = ["tweetButton", "tweetButtonInline", "addButton"]
    .filter(id => document.querySelector("[data-testid=\"" + id + "\"]"));
  return { href: location.href, boxes, buttons,
    note: boxes.length ? "compare chars with what you meant to type" : "no composer on this tab" };
})()')}" ;;
  ask)
    # A REAL question on the owner's phone, not a dry run. A yes opens the
    # guarded door for a few minutes (guard.ts) -- ask only for an act you
    # are about to do.
    [ -n "${1:-}" ] || { echo "нужно одно предложение: что именно произойдёт"; exit 2; }
    S="${2:-0}"; int "$S" "секунды"
    # The server clips a longer wait to 120 s without a word; say it here.
    [ "$S" -le 120 ] || { echo "ждать можно до 120 с (сервер обрезает молча): $S"; exit 2; }
    call browser_ask_permission "{\"what\":$(js "$1"),\"waitSeconds\":$S}" $(( S + 30 )) ;;
  ask-input)
    case "${1:-}" in password|email|code|text|action|choice) ;;
      *) echo "вид поля: password|email|code|text|action|choice"; exit 2 ;; esac
    [ -n "${2:-}" ] || { echo "нужно «зачем» — его увидит человек"; exit 2; }
    EXTRA=""
    if [ "$1" = choice ]; then
      # choice is pressed, not typed: options instead of a point.
      [ -n "${3:-}" ] || { echo "нужны варианты: \"Да|Нет|Позже\" (от двух)"; exit 2; }
      EXTRA=",\"options\":$(O="$3" python3 -c 'import json,os;print(json.dumps([o.strip() for o in os.environ["O"].split("|") if o.strip()], ensure_ascii=False))')"
    elif [ -n "${3:-}" ]; then int "$3" X; int "${4:-}" Y; EXTRA=",\"x\":$3,\"y\":$4"; fi
    call browser_ask_input "{\"kind\":$(js "$1"),\"why\":$(js "$2")$EXTRA}" 150 ;;
  doctor)
    # One read-only sweep for the start of every loop tick: each anomaly with
    # the command that fixes it. Fixes nothing itself. Born 2026-10-03: a tab
    # loaded before a deploy kept showing a bug already fixed live.
    #
    # It reads ONE tab, the front one, and only while a visit is on record.
    # The first version toured every tab, and review (#3392) caught what that
    # costs: a page read with no visit on record STARTS one (liveSession), and
    # a started visit messages the owner -- at 02:36, from a "read-only"
    # check. With a visit on record the person may be watching, and bringing
    # his tabs forward one by one in front of him is driving. So every call
    # here is a probe, and the other tabs are listed, not opened.
    bash "$0" "$ROOT" cover >/dev/null 2>&1; crc=$?
    st=$(call browser_status '{}' 40 probe) || { echo "статус не пришёл: ${st:0:200}"; exit 2; }
    CAP=$(grep -oE 'export const TAB_CAP = [0-9]+' "$ROOT/apps/vibee-editor/render/src/browser/tab-sweep.ts" | grep -oE '[0-9]+$')
    # Where the tools act: the remembered choice, else the first real page --
    # the server's own pickFront (front-page.ts), not a guess.
    listing=$(OUT="$st" python3 -c '
import json, os
d = json.loads(os.environ["OUT"])
pages = (d.get("pages") or []) if d.get("running") else []
real = [p for p in pages if not str(p.get("url", "")).startswith("chrome-extension://")]
front = next((p["id"] for p in real if p.get("actingHere")), real[0]["id"] if real else "-")
print(1 if d.get("running") else 0, 1 if d.get("watchedByThePerson") else 0, front, len(pages))
for p in pages:
    print("%s %s  %s" % ("*" if p["id"] == front else " ", p["id"], str(p.get("url", ""))[:80]))' 2>/dev/null)
    read -r RUN WATCH FRONT TOTAL <<<"$(head -1 <<<"$listing")"
    [ -n "${RUN:-}" ] || { echo "статус не разобрать: ${st:0:200}"; exit 2; }
    found=0
    flag() { found=$((found + 1)); printf '  ! %s\n      -> %s\n' "$1" "$2"; }
    [ $crc -eq 0 ] || flag "не у каждого browser_* инструмента есть случай здесь" "tri browser cover"
    if [ "$RUN" != 1 ]; then
      echo "браузер не запущен — вкладок нет (под гасится в простое; это не поломка)"
      [ $found -eq 0 ] && exit 0 || exit 1
    fi
    echo "вкладок: $TOTAL из ${CAP:-?}   визит записан: $([ "$WATCH" = 1 ] && echo да || echo нет)"
    tail -n +2 <<<"$listing" | sed 's/^/  /'
    [ -n "$CAP" ] && [ "$TOTAL" -gt "$CAP" ] && flag "вкладок $TOTAL при потолке $CAP: под задохнётся (pids.max, 27.09)" "tri tabs"
    if [ "$WATCH" != 1 ]; then
      echo "  страницы не читаю: визита нет, а чтение завело бы его и написало владельцу."
      echo "  одну вкладку по делу: tri browser blank ID (заведёт визит)"
      [ $found -eq 0 ] && { echo "аномалий нет (по списку)"; exit 0; }
      echo "аномалий: $found"; exit 1
    fi
    # The front tab: mount state, unsent X composer text, and staleTab = a
    # module the site serves NOW is missing from the tab (a subset test:
    # modules the page injects at runtime are extra, not stale). The re-GET
    # carries his cookies, so URLs that look like they act on a GET are not
    # re-fetched.
    PROBE='new Promise(done => {
  const v = { href: location.href, proto: location.protocol, ready: document.readyState,
    nodes: document.querySelectorAll("*").length,
    text: (document.body && document.body.innerText || "").trim().length };
  v.draft = [...document.querySelectorAll("[data-testid^=\"tweetTextarea_\"]")]
    .filter(b => /^tweetTextarea_\d+$/.test(b.getAttribute("data-testid")))
    .reduce((n, b) => n + (b.innerText || "").trim().length, 0);
  const mine = [...document.scripts].filter(s => s.type === "module" && s.src).map(s => new URL(s.src).pathname);
  if (!/^https?:$/.test(location.protocol) || !mine.length
      || /log-?out|sign-?out|unsub|callback|oauth|confirm|verify|token|code=/i.test(location.href)) return done(v);
  setTimeout(() => done(v), 8000);
  fetch(location.href, { cache: "no-store" }).then(r => r.text()).then(html => {
    const now = [...new DOMParser().parseFromString(html, "text/html").querySelectorAll("script[type=module][src]")]
      .map(s => new URL(s.getAttribute("src"), location.href).pathname);
    if (now.some(p => !mine.includes(p))) v.stale = true;
    done(v);
  }).catch(() => done(v));
})'
    out=$(call browser_evaluate "{\"code\":$(js "$PROBE")}" 40 probe); rc=$?
    if [ $rc -eq 2 ]; then flag "$FRONT: передняя вкладка не ответила за 40 с" "tri browser shot $FRONT; висит — tri heal"
    elif [ $rc -eq 1 ]; then echo "  $FRONT не прочитана: ${out:0:120} (страж банка/почты/оплаты — так и должно быть)"
    else
      lines=$(ID="$FRONT" OUT="$out" python3 -c '
import json, os
i = os.environ["ID"]
try: d = json.loads(os.environ["OUT"])
except Exception: d = {}
v = d.get("value", d) if isinstance(d, dict) else {}
v = v if isinstance(v, dict) else {}
web = v.get("proto") in ("http:", "https:")
print("  передняя %s: %s узлов, %s знаков" % (i, v.get("nodes", "?"), v.get("text", "?")))
draft = v.get("draft") or 0
if web and v.get("ready") == "complete" and v.get("text") == 0:
    print("!%s: страница пустая\ttri browser blank %s" % (i, i))
if v.get("stale"):
    fix = ("сначала tri browser composer %s -- в композере %d знаков, reload их выбросит" % (i, draft)) if draft else ("tri browser reload %s" % i)
    print("!%s: вкладка на старой сборке сайта (staleTab)\t%s" % (i, fix))
if draft:
    print("!%s: в композере X неотправленный текст, %d знаков\ttri browser composer %s" % (i, draft, i))')
      while IFS= read -r l; do
        case "$l" in '') ;; '!'*) w="${l#!}"; flag "${w%%	*}" "${w#*	}" ;; *) echo "$l" ;; esac
      done <<<"$lines"
    fi
    [ "$TOTAL" -gt 1 ] && echo "  остальные $((TOTAL - 1)) не читаю: при записанном визите человек может смотреть. По одной: tri browser blank ID"
    [ $found -eq 0 ] && { echo "аномалий нет"; exit 0; }
    echo "аномалий: $found"; exit 1 ;;
  call)
    [ -n "${1:-}" ] || { echo "нужно имя инструмента"; exit 2; }
    call "$1" "${2:-$NONE}" "${3:-120}" ;;
  *) echo "неизвестный случай: $CASE  (tri browser help)"; exit 2 ;;
esac
