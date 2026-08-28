#!/bin/bash
# Run every test suite in the repo — all three of them.
#
# WHY THIS EXISTS. The suite lives in three places with three runners, and
# nothing said so. I spent a cycle believing 253 tests were red; they were
# green, just invoked from the wrong directory with the wrong environment.
# A suite you must know three facts to run is a suite nobody runs.
#
#   bash .claude/loop-opus/test-all.sh
#
# Exits non-zero if any suite fails, so it can gate a commit.

set -uo pipefail
cd "$(dirname "$0")/../.."
ROOT="$PWD"
NODE_BIN="${NODE_BIN:-node}"
export PATH="$(dirname "$(command -v "$NODE_BIN" 2>/dev/null || echo /usr/bin/node)"):$PATH"

fail=0
run() {
  local name="$1" dir="$2" args="${3:-}"
  echo "▸ $name"
  if (cd "$dir" && npx vitest run $args 2>&1 | tail -4); then :; else fail=1; fi
  echo
}

# Server: uses the ROOT config — it needs the dummy provider keys from
# vitest.setup.ts, and that path only resolves from the repo root.
run "render server" "$ROOT" "apps/vibee-editor/render"

# Player and atoms: OWN runners and OWN configs. Running them from the root
# gives `localStorage is not defined` — they are DOM tests, and the root
# config runs in node.
run "player"        "$ROOT/apps/vibee-editor/player"
run "vibee-atoms"   "$ROOT/apps/vibee-editor/packages/vibee-atoms"

if [ "$fail" -ne 0 ]; then
  echo "❌ at least one suite failed"
  exit 1
fi
echo "✅ all suites passed"
