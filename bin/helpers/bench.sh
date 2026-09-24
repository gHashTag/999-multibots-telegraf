#!/usr/bin/env bash
# THE AGENT'S ONE MOVE, SCORED.
#
# Every competitor publishes a number; we had none, so "the agent got better
# at pressing buttons" was an opinion. This runs find-target against the
# pages we actually met in production (render/src/browser/bench/cases.ts) and
# prints a score. No browser, no network, no model: it runs on every change.
set -euo pipefail
ROOT="${1:?usage: tri bench}"
cd "$ROOT/apps/vibee-editor/render"
OUT=$(npx vitest run src/browser/bench 2>&1) || {
  # A failed run must SAY which page it lost, not only that it lost.
  echo "$OUT" | grep -aE "missed|×|AssertionError|Error" | head -12
  exit 1
}
echo "$OUT" | grep -aE "Tests  " || true
