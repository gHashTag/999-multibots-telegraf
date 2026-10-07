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
#   tri browser sites             the person's own site list: ask = acting there
#                                 needs a fresh yes, block = never opened, read or
#                                 touched. Reads the table, not the browser
#   tri browser sites ask|block SITE  tighten it (the agent's door can only
#                                 tighten; loosening is the person's, in the app)
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
#                                 cap, cover, and EVERY tab read on the server
#                                 (blank, staleTab on our sites, unsent X
#                                 composer text), each anomaly with its fix.
#                                 Nothing fronted, no visit started, never tours
#   tri browser tidy              tabs that look abandoned (unfinished form,
#                                 stuck sign-in, raw file, blank, duplicate):
#                                 a list, read through the door that starts nothing
#   tri browser tidy ask [ID...]  ONE card on the owner's phone with that list
#                                 (+ IDs named by hand), answerable for a day: a
#                                 REAL question. Closes nothing by itself
#   tri browser tidy apply QID    after his "allow": close exactly the tabs the
#                                 card named that still show the same URL; once
#   tri browser share-check [SLUG]  the blog desk's publish look, without its
#                                 press: opens each signed-in network's share
#                                 page for the article (newest if no SLUG), looks
#                                 for the button by the desk's OWN words
#                                 (SHARE_LABELS), closes the tab it opened.
#                                 Never clicks. Exit 1 = a button the desk
#                                 would miss tonight
#   tri browser swept [SINCE]     what the 5-min sweep and room-making closed
#                                 (host and why, never the path) beside the
#                                 desk lines of the same hours (6h): "did a
#                                 tab close under the desk?" in one look.
#                                 Logs only -- touches no browser (#3469)
#   tri browser call TOOL [JSON]  any tool, raw: the escape hatch
#   tri browser cover             every browser_* tool in agent-tools.ts has a
#                                 case here (exit 1 names the ones that do not)
#
# The cases that only look (status, read, shot, desk, wait, layers, composer)
# send every call as a probe: an unmarked read is a journal step, and two
# minutes later the owner gets an "agent work over the connection" report for
# a check nobody asked him about (2026-10-03, `tri logins`). A probe never
# starts a browser: with no visit on record the server says so, and the
# remedy is a case that works (open, share-check), which he is told about.
# share-check is NOT a probe: it opens tabs in the browser he watches, and
# work he can see is work he is told about -- there is no invisible mode.
# Neither is find: findProbe scrolls the target into view, so his page moves
# under his eyes, and that is work he is told about too (review on #3434).
#
# Exit 0 done, 1 the tool answered with an error, 2 could not ask at all.
set -uo pipefail
. "$(dirname "${BASH_SOURCE[0]}")/rail.sh"  # rvars: Railway by explicit ids
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
  KEY=$( (cd "${MAIN:-$ROOT}" && rvars vibee-render) \
         | grep -E '^AGENT_KEYS=' | cut -d= -f2- | cut -d, -f1 | cut -d: -f1 )
fi
[ -n "$KEY" ] || { echo "нет ключа агента: export AGENT_KEY или railway login"; exit 2; }
BASE="${RENDER_BASE:-https://vibee-render-production.up.railway.app}"
NONE='{}'  # "${2:-{}}" expands to "{\\}" in bash: keep the empty object here
# A case that only looks marks every call it makes, `front` included.
LOOK_ONLY=""
# Not find: its probe scrolls the page (see the header).
case "$CASE" in status|tabs|read|shot|desk|wait|layers|composer) LOOK_ONLY=probe ;; esac

# call TOOL JSON [MAX_TIME] [probe] -> the tool's own answer on stdout
# (structured JSON or text), exit 1 on a tool error, 2 when nothing came back.
# "probe" sets params._meta.probe: the server then never starts a browser
# visit for the call -- a started visit messages the owner (liveSession).
call() {
  local body resp
  body=$(TOOL="$1" ARGS="${2:-$NONE}" PROBE="${4:-$LOOK_ONLY}" python3 -c '
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
  sites)
    if [ -z "${1:-}" ]; then call browser_sites '{"action":"list"}' 30 probe; exit $?; fi
    case "$1" in ask|block) ;; *) echo "правило: ask или block"; exit 2 ;; esac
    [ -n "${2:-}" ] || { echo "нужен сайт: bank.com или yandex.ru/mail"; exit 2; }
    call browser_sites "{\"action\":\"add\",\"rule\":$(js "$1"),\"site\":$(js "$2")}" 30 ;;
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
    # EVERY tab is read, on the server, where it lies: `browser_status
    # {shape:true}` (render/src/browser/tab-shape.ts) evaluates counts in each
    # background target over CDP -- nothing is fronted, and the status door
    # (podToLookAt) never starts a visit. The first doctor toured tabs through
    # the front and, with no visit on record, its read STARTED one and
    # messaged the owner at 02:36 (review on #3392). The second read only the
    # front tab. This one reads all of them and still drives nothing.
    bash "$0" "$ROOT" cover >/dev/null 2>&1; crc=$?
    # An older render refuses the unknown `shape`: then list without it.
    st=$(call browser_status '{"shape":true}' 60 probe) \
      || { grep -q 'unknown shape' <<<"$st" && st=$(call browser_status '{}' 40 probe); } \
      || { echo "статус не пришёл: ${st:0:200}"; exit 2; }
    CAP=$(grep -oE 'export const TAB_CAP = [0-9]+' "$ROOT/apps/vibee-editor/render/src/browser/tab-sweep.ts" | grep -oE '[0-9]+$')
    report=$(OUT="$st" python3 -c '
import json, os
d = json.loads(os.environ["OUT"])
pages = (d.get("pages") or []) if d.get("running") else []
shaped = any("shape" in p for p in pages)
print(1 if d.get("running") else 0, 1 if d.get("watchedByThePerson") else 0, len(pages), 1 if shaped else 0)
fixes = {
  "blank": ("страница пустая", "tri browser blank %s"),
  "stale": ("вкладка на старой сборке сайта (staleTab)", "tri browser reload %s"),
  "draft": ("в композере X неотправленный текст, %d знаков", "tri browser composer %s"),
}
for p in pages:
    i, url, sh = p["id"], str(p.get("url", ""))[:72], p.get("shape") or {}
    mark = "*" if p.get("actingHere") else " "
    if not shaped:
        print(" %s %s  %s" % (mark, i, url)); continue
    if sh.get("unread"):
        print(" %s %s  %s\n      не прочитана: %s" % (mark, i, url, sh["unread"])); continue
    print(" %s %s  %s  [%s узлов, %s знаков]" % (mark, i, url, sh.get("nodes", "?"), sh.get("text", "?")))
    an = sh.get("anomalies") or []
    for a in an:
        what, fix = fixes.get(a, (a, "tri browser shot %s"))
        if a == "draft": what = what % (sh.get("draft") or 0)
        fix = fix % i
        # reload throws the composer text away: save it first.
        if a == "stale" and "draft" in an: fix = "сначала tri browser composer %s, потом tri browser reload %s" % (i, i)
        print("!%s: %s\t%s" % (i, what, fix))' 2>/dev/null)
    read -r RUN WATCH TOTAL SHAPED <<<"$(head -1 <<<"$report")"
    [ -n "${RUN:-}" ] || { echo "статус не разобрать: ${st:0:200}"; exit 2; }
    found=0
    flag() { found=$((found + 1)); printf '  ! %s\n      -> %s\n' "$1" "$2"; }
    [ $crc -eq 0 ] || flag "не у каждого browser_* инструмента есть случай здесь" "tri browser cover"
    if [ "$RUN" != 1 ]; then
      echo "браузер не запущен — вкладок нет (под гасится в простое; это не поломка)"
      [ $found -eq 0 ] && exit 0 || exit 1
    fi
    echo "вкладок: $TOTAL из ${CAP:-?}   визит записан: $([ "$WATCH" = 1 ] && echo да || echo нет)   (* — где действует агент)"
    [ -n "$CAP" ] && [ "$TOTAL" -gt "$CAP" ] && flag "вкладок $TOTAL при потолке $CAP: под задохнётся (pids.max, 27.09)" "tri tabs"
    while IFS= read -r l; do
      case "$l" in '') ;; '!'*) w="${l#!}"; flag "${w%%	*}" "${w#*	}" ;; *) echo " $l" ;; esac
    done <<<"$(tail -n +2 <<<"$report")"
    # Litter tabs (tab-tidy.ts): a count and the command that asks. An older
    # render without browser_tidy says nothing here rather than "none".
    if td=$(call browser_tidy '{}' 40 probe 2>/dev/null); then
      read -r n oq os <<<"$(OUT="$td" python3 -c 'import json,os;d=json.loads(os.environ["OUT"]);o=d.get("open") or {};print(len(d.get("tabs") or []),o.get("question","-"),o.get("state","-"))' 2>/dev/null)"
      # A question already on his phone is not a reason to ask again (#tidy-once).
      if [ "${os:-}" = allowed ]; then
        flag "лишних вкладок: $n, он разрешил закрыть" "tri browser tidy apply $oq"
      elif [ "${os:-}" = pending ]; then
        [ "${n:-0}" -gt 0 ] && echo "  лишних вкладок: $n — вопрос уже у владельца ($oq), ждём «Разрешить»"
      else
        [ "${n:-0}" -gt 0 ] && flag "лишних вкладок: $n (брошенная форма, застрявший вход, сырой файл…)" "tri browser tidy, затем tidy ask — закроет только по его «да»"
      fi
    fi
    # A render deployed before tab-shape.ts ignores `shape`: say so rather
    # than reporting a clean sweep that never happened.
    [ "$SHAPED" = 1 ] || [ "$TOTAL" -eq 0 ] || echo "  страницы не прочитаны: рендер ещё без shape (не задеплоен?) — по одной: tri browser blank ID (заведёт визит)"
    [ $found -eq 0 ] && { [ "$SHAPED" = 1 ] && echo "аномалий нет" || echo "аномалий нет (по списку)"; exit 0; }
    echo "аномалий: $found"; exit 1 ;;
  tidy)
    # render/src/browser/tab-tidy.ts: list, ask, apply. Only apply closes, and
    # only after the person's yes to that exact list.
    sub="${1:-list}"
    case "$sub" in
      list) out=$(call browser_tidy '{}' 40 probe) || { rc=$?; echo "$out"; exit $rc; } ;;
      ask)
        shift
        IDS=$(python3 -c 'import json,sys;print(json.dumps(sys.argv[1:]))' "$@")
        out=$(call browser_tidy "{\"ask\":true,\"ids\":$IDS}" 60 probe) || { rc=$?; echo "$out"; exit $rc; } ;;
      apply)
        [ -n "${2:-}" ] || { echo "нужен id вопроса: его печатает tri browser tidy ask"; exit 2; }
        out=$(call browser_tidy "{\"apply\":$(js "$2")}" 60 probe) || { rc=$?; echo "$out"; exit $rc; } ;;
      *) echo "tri browser tidy [ask [ID...] | apply QID]"; exit 2 ;;
    esac
    OUT="$out" python3 -c '
import json, os
d = json.loads(os.environ["OUT"])
if d.get("running") is False: print("браузер не запущен"); raise SystemExit
if "applied" in d:
    if not d["applied"]: print("не закрыто:", d.get("decision") or d.get("note")); raise SystemExit
    print("закрыто:", len(d.get("closed") or []))
    for i in d.get("closed") or []: print("  x", i)
    for s in d.get("skipped") or []: print("  оставлена %s: %s" % (s["id"], s["why"]))
    raise SystemExit
tabs = d.get("tabs") or []
o = d.get("open") or {}
if not tabs and not o: print("лишних вкладок нет"); raise SystemExit
for t in tabs: print("  %s  %-16s %s" % (t["id"], t["why"], t["url"][:72]))
if o.get("state") == "allowed":
    print("он разрешил закрыть; вопрос:", o["question"])
    print("закрыть: tri browser tidy apply", o["question"])
elif o.get("state") == "pending":
    print("вопрос уже у владельца, второй карточки не будет:", o["question"])
    print("после «Разрешить»: tri browser tidy apply", o["question"])
elif d.get("asked"):
    print("карточка ушла владельцу; вопрос:", d["question"])
    print("после «Разрешить»: tri browser tidy apply", d["question"])
else:
    print("спросить владельца одной карточкой: tri browser tidy ask [ещё ID...]")' ;;
  share-check)
    # Everything the desk does on a share page up to the press, by the desk's
    # own code: shareUrls, SHARE_LABELS, findProbe, isNotConnected and the
    # spec's look timing. Reddit and LinkedIn had never been looked at live
    # after #3361 and #3371; the first real test was the owner's "allow".
    # The opens and looks are journaled work (he gets the report); only the
    # cookie-name read is a probe.
    RENDER="$ROOT/apps/vibee-editor/render"
    [ -x "$RENDER/node_modules/.bin/tsx" ] || { echo "нет tsx в $RENDER/node_modules (tri deps)"; exit 2; }
    lg=$(call browser_logins '{}' 45 probe) || { echo "входы не прочитаны: $lg"; exit 2; }
    PLAN=$(cd "$RENDER" && { curl -s --max-time 20 https://t27.ai/rss.xml || true; } \
      | SLUG="${1:-}" LOGINS="$lg" node_modules/.bin/tsx -e '
import { parseRss, shareUrls, SHARE_LABELS } from "./src/agent/blog-share.ts"
import { isNotConnected } from "./src/agent/rounds.ts"
import { findProbe } from "./src/browser/find-target.ts"
import { FIRST_SETTLE_MS, LOOK_EVERY_MS, LOOKS } from "./src/spec/blog-share.gen.ts"
let xml = ""
process.stdin.on("data", d => (xml += d)).on("end", () => {
  const list = parseRss(xml)
  const slug = process.env.SLUG
  const a = slug ? list.find(x => x.slug === slug) : list[0]
  if (!a) { console.error(slug ? `no article ${slug} in the feed` : "the feed holds no article"); process.exit(3) }
  const logins = (() => { try { return JSON.parse(process.env.LOGINS!).networks ?? null } catch { return null } })()
  const urls = shareUrls(a) as Record<string, string>
  console.log(["plan", a.slug, FIRST_SETTLE_MS, LOOK_EVERY_MS, LOOKS].join("\t"))
  for (const [net, labels] of Object.entries(SHARE_LABELS)) {
    const url = urls[net.toLowerCase()]
    if (isNotConnected(url, logins)) { console.log(["skip", net, url].join("\t")); continue }
    for (const l of labels) console.log(["look", net, url, l, Buffer.from(findProbe(l)).toString("base64")].join("\t"))
  }
})'); prc=$?
    [ $prc -eq 0 ] || { echo "план не собран кодом стола (rc $prc)"; exit 2; }
    IFS=$'\t' read -r _ slug settle every looks <<<"$(printf '%s\n' "$PLAN" | head -1)"
    echo "статья: $slug   (смотрю ${looks}×${every} мс, как стол; не нажимаю)"
    miss=0; asked=0
    for net in $(printf '%s\n' "$PLAN" | awk -F'\t' '$1!="plan"{print $2}' | awk '!s[$0]++'); do
      if printf '%s\n' "$PLAN" | grep -q "^skip	$net	"; then
        echo "  · $net: не вошёл — стол её пропустит, ничего не открыто"; continue
      fi
      url=$(printf '%s\n' "$PLAN" | awk -F'\t' -v n="$net" '$1=="look" && $2==n{print $3; exit}')
      before=$(ids) || exit 2
      out=$(call browser_open "{\"url\":$(js "$url")}" 120); orc=$?
      [ $orc -eq 0 ] || { echo "  ✗ $net: не открылась: ${out:0:160}"; miss=1; continue; }
      asked=1
      id=$(OUT="$out" python3 -c 'import json,os
try: print(json.loads(os.environ["OUT"]).get("id") or "")
except Exception: print("")')
      # No id: the front tab is not known to be ours, so nothing is looked at
      # (findProbe scrolls) and nothing is closed.
      [ -n "$id" ] || { echo "  ✗ $net: открылась без id — не смотрю и не закрываю: ${out:0:160}"; miss=1; continue; }
      sleep $(( settle / 1000 ))
      hit=""; look=0
      while [ -z "$hit" ] && [ $look -lt "$looks" ]; do
        [ $look -gt 0 ] && sleep $(( every / 1000 ))
        look=$((look + 1))
        while IFS=$'\t' read -r _ _ _ label b64; do
          code=$(printf '%s' "$b64" | base64 --decode)
          res=$(front "$id" && call browser_evaluate "{\"code\":$(js "$code")}" 60) || continue
          hit=$(RES="$res" L="$label" python3 -c '
import json, os
try:
    d = json.loads(os.environ["RES"])
except Exception:
    d = None
v = d.get("value", d) if isinstance(d, dict) else d
print(json.dumps({"label": os.environ["L"], "at": v}, ensure_ascii=False) if v else "")')
          [ -n "$hit" ] && break
        done < <(printf '%s\n' "$PLAN" | awk -F'\t' -v n="$net" '$1=="look" && $2==n')
      done
      where=$(call browser_evaluate '{"code":"location.href"}' 30 | python3 -c 'import json,sys
r=sys.stdin.read()
try:
    d=json.loads(r); print(d.get("value", d) if isinstance(d, dict) else d)
except Exception: print(r[:120])')
      if [ -n "$hit" ]; then echo "  ✓ $net: нажал бы $hit (взгляд $look)"
      else echo "  ✗ $net: кнопки нет за $looks взглядов — стол сегодня промахнётся. Страница: ${where:0:120}"; miss=1; fi
      # Close only the tab this case opened: one new id, the one open named.
      if after=$(ids); then
        new=""; n=0
        for t in $after; do case " $before " in *" $t "*) ;; *) new="$t"; n=$((n + 1)) ;; esac; done
        if [ $n -eq 1 ] && [ "$new" = "$id" ]; then call browser_close_tab "{\"id\":$(js "$id")}" >/dev/null || echo "    не закрыл $id"
        else echo "    новых вкладок: $n, открыта: ${id:-?} — не угадываю, ничего не закрыл"; fi
      fi
    done
    [ $asked -eq 1 ] || { echo "ни одна сеть не проверена"; exit 2; }
    exit $miss ;;
  swept)
    # Render logs, not the browser: a closing is named since #3469's follow-up
    # ("closed 1 ... -- x.com (duplicate)"); before it, only a count. rlogs is
    # a shell function, so it is backgrounded and killed instead of `timeout`.
    since="${1:-6h}"; tmp=$(mktemp)
    rlogs vibee-render --since "$since" --lines 5000 > "$tmp" 2>/dev/null &
    lp=$!
    for _ in $(seq 120); do kill -0 "$lp" 2>/dev/null || break; sleep 1; done
    kill "$lp" 2>/dev/null
    LOG="$tmp" python3 -c '
import os, re
rows = [l.rstrip() for l in open(os.environ["LOG"], errors="replace")
        if re.search(r"\[(tabs|blog-share|reddit|engage|scenario)", l)]
closings = [l for l in rows if re.search(r"closed [1-9]|room for", l)]
for l in rows[-60:]:
    print(("  ! " if l in closings else "    ") + l[:200])
total = sum(1 for _ in open(os.environ["LOG"], errors="replace"))
print("строк: %d, закрытий: %d (из %d строк лога)" % (len(rows), len(closings), total))
if not total: print("лог не пришёл: railway не ответил за 120 с -- это не «ничего не закрыто»")
elif not rows: print("за это время вкладки не закрывались и столы не работали")'
    rm -f "$tmp"; exit 0 ;;
  call)
    [ -n "${1:-}" ] || { echo "нужно имя инструмента"; exit 2; }
    call "$1" "${2:-$NONE}" "${3:-120}" ;;
  *) echo "неизвестный случай: $CASE  (tri browser help)"; exit 2 ;;
esac
