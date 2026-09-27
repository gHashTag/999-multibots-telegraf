#!/bin/bash
# IS MAIN ITSELF HEALTHY -- BEFORE ANYONE BUILDS ON IT?
#
# On 2026-09-22 two PRs merged the same field the same day; main's player
# type gate went red for everyone, and it was found only when it stopped an
# unrelated commit. The same night a static import made every bot start
# crash while every unit test stayed green. Each is a check that exists --
# the point is to run them on MAIN, not on your branch.
#
# A throwaway worktree of origin/main (node_modules linked from the main
# checkout, or the gates fail on imports), then:
#   player types     node scripts/check-player-types.cjs
#   render types     node scripts/check-render-types.cjs  (render IS production)
#   bot bundle boots src/__tests__/bot/bundleBootsPastImports.test.ts
#   merged = shipped scripts/railway-drift.mjs
#   --eyes           also tri eyes (opens the owner's browser if closed)
# Exit 0 all green, 1 something red (named), 2 could not check.
set -uo pipefail
ROOT="$1"; shift
EYES=0; [ "${1:-}" = "--eyes" ] && EYES=1
MAIN=$(git -C "$ROOT" worktree list --porcelain | awk 'NR==1{print $2}')
git -C "$ROOT" fetch -q origin main || { echo "main-guard: cannot fetch origin/main -- could not check"; exit 2; }
DIR=$(mktemp -d)/main
REF="${MAIN_GUARD_REF:-origin/main}"  # a past commit, to prove it can go red
git -C "$ROOT" worktree add -q --detach "$DIR" "$REF" || { echo "main-guard: no worktree -- could not check"; exit 2; }
trap 'git -C "$ROOT" worktree remove --force "$DIR" >/dev/null 2>&1' EXIT
for d in node_modules apps/vibee-editor/node_modules apps/vibee-editor/player/node_modules \
         apps/vibee-editor/render/node_modules apps/vibee-editor/packages/vibee-atoms/node_modules; do
  [ -e "$MAIN/$d" ] && [ ! -e "$DIR/$d" ] && ln -s "$MAIN/$d" "$DIR/$d"
done
echo "  main: $(git -C "$DIR" log -1 --format='%h %s' | cut -c1-70)"
red=0
check() { # label, command...
  local label="$1"; shift
  local out; out=$( (cd "$DIR" && "$@") 2>&1 ); local rc=$?
  if [ $rc = 0 ]; then echo "  ok    $label"; else red=1; echo "  RED   $label"; echo "$out" | tail -4 | sed 's/^/        /'; fi
}
check "player types"      node scripts/check-player-types.cjs
check "render types"      node scripts/check-render-types.cjs
check "bot bundle boots"  npx vitest run src/__tests__/bot/bundleBootsPastImports.test.ts
check "merged = shipped"  node scripts/railway-drift.mjs
[ $EYES = 1 ] && check "agent sees the browser" bash bin/helpers/eyes.sh "$DIR"
[ $red = 0 ] && echo "main-guard: ok" || echo "main-guard: MAIN IS RED -- fix it first, it will stop your commit too"
exit $red
