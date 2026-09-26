#!/bin/bash
# tri bare-fetch -- which calls the app makes WITHOUT a credential land on a
# route the render guard closes (a 401 before the handler runs).
#
# Found twice on 2026-09-24: the acceptance verdicts and the traffic counter
# were called with a bare fetch, the guard answered 401, and every handler
# test stayed green. This sweeps player/src for fetch(`${API_BASE}/...`)
# with no auth header nearby (12 lines up, down to the end of the call), asks render's isPublic
# for each path, and lists the ones that cannot work unsigned.
#
# Exit 0 either way: a GUARDED line is a lead to read, not proof -- the
# headers may be built further away, or the route may be served elsewhere.
set -u
ROOT="${1:?repo root required}"
PLAYER="$ROOT/apps/vibee-editor/player/src"
cd "$PLAYER" || exit 2
LIST=$(grep -rnE '(fetch|send)\(\s*`\$\{API_BASE\}/' --include=*.ts --include=*.tsx . | grep -v '\.test\.' |
  while IFS=: read -r f l rest; do
    # Up to 12 lines above (a Headers built just before), and down to the
    # end of this call: 25 lines at most, cut at the next function so a
    # neighbour's headers do not vouch for this one.
    up=$(sed -n "$((l > 12 ? l - 12 : 1)),$((l - 1))p" "$f" | awk '/^(export |async function|function )/ {buf=""} {buf=buf $0 "\n"} END {printf "%s", buf}')
    down=$(sed -n "$l,$((l + 25))p" "$f" | awk 'NR > 1 && /^(export |async function|function |\/\/ )/ {exit} {print}')
    ctx="$up$down"
    if ! printf '%s' "$ctx" | grep -qE 'Init-Data|initData|authHeaders|withAuth|Authorization|X-Agent-Key|X-Api-Key|devKey|getAuth|signed'; then
      p=$(printf '%s' "$rest" | grep -oE 'API_BASE\}/[a-zA-Z0-9/_-]+' | head -1 | sed 's/API_BASE}//')
      m=GET
      sed -n "$l,$((l + 4))p" "$f" | grep -qE "method:\s*'(POST|PUT|DELETE|PATCH)'" &&
        m=$(sed -n "$l,$((l + 4))p" "$f" | grep -oE "method:\s*'[A-Z]+'" | head -1 | grep -oE "[A-Z]+'" | tr -d "'")
      [ -n "$p" ] && printf '%s %s %s:%s\n' "$m" "$p" "${f#./}" "$l"
    fi
  done)
[ -n "$LIST" ] || { echo "no bare fetch to render found"; exit 0; }
cd "$ROOT/apps/vibee-editor/render" || exit 2
BARE="$LIST" npx --no-install tsx -e '
const { isPublic } = require("./auth")
let guarded = 0
for (const line of process.env.BARE.trim().split("\n")) {
  const [m, p, where] = line.split(" ")
  const open = isPublic({ url: p, method: m })
  if (!open) guarded += 1
  console.log(`${open ? "public " : "GUARDED"} ${m.padEnd(6)} ${p.padEnd(34)} ${where}`)
}
console.log(guarded
  ? `\n${guarded} bare call(s) hit a guarded route: read each one -- a 401 before the handler, or a route render does not serve`
  : "\nevery bare call lands on a public route")
' 2>&1 | grep -v ExperimentalWarning
