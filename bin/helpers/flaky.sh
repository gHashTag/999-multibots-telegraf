#!/bin/bash
# RED ONCE, GREEN ALONE: A FLAKE OR A BREAK?
#
# Twice on 2026-09-22 a test failed in a full parallel run and passed alone:
# a cold import charged to the first test (provider.test.ts) and a fixed
# 50 ms wait for a request to reach a server (vision-lanes.test.ts). Each
# time the answer came from running the same set three times by hand.
#
#   tri flaky <runs> <test files...>     (paths relative to the package dir)
#   tri flaky 3 apps/vibee-editor/render browser-*.test.ts provider.test.ts
#
# The first argument after the count is the package directory; the rest are
# the files, run TOGETHER each time, as a full run would. Prints every test
# that failed at least once and how often. Exit 0 none failed, 1 some did.
set -uo pipefail
ROOT="$1"; shift
RUNS="${1:?usage: tri flaky <runs> <package dir> <test files...>}"; shift
PKG="${1:?package dir}"; shift
cd "$ROOT/$PKG" || { echo "flaky: no such package: $PKG"; exit 2; }
LOGS=$(mktemp -d)
for i in $(seq 1 "$RUNS"); do
  npx vitest run "$@" > "$LOGS/run$i.log" 2>&1
  printf '  run %s: %s\n' "$i" "$(grep -E '^ +Tests ' "$LOGS/run$i.log" | sed 's/^ *//')"
done
FAILED=$(cat "$LOGS"/run*.log | sed 's/\x1b\[[0-9;]*m//g' | grep -E '^ *FAIL ' | sed -E 's/^ *FAIL +//' | sort | uniq -c | sort -rn)
rm -rf "$LOGS"
if [ -z "$FAILED" ]; then echo "flaky: none failed in $RUNS runs"; exit 0; fi
echo "failed at least once (count / test):"
echo "$FAILED" | sed 's/^/  /'
echo "flaky: red in some runs -- green in others means timing or a cold import, not logic"
exit 1
