#!/bin/bash
# CAN THE GATES OF A REPO STILL FAIL?
#
# gHashTag/trinity-fpga runs tools/check_gates_can_fail.py in CI: it plants
# each gate's own defect and asks whether the gate rejects it. A gate already
# red on a clean tree cannot be tested (UNTESTABLE), and a floor (MIN_TESTABLE)
# keeps that number from shrinking. The verdict hides in a job log behind the
# sibling clones; on 2026-10-02/03 it was dug out by hand every tick of a loop.
# And "gates-can-fail: success" alone does not say HOW MANY were tested -- the
# number that moved when a red gate turned green (9 of 10 after #813).
#
#   tri canfail [owner/repo] [ref]  default: gHashTag/trinity-fpga, main
#
# Prints, from the gates-can-fail job of the ref's head: the tested count, each
# gate's verdict, the harness's own OK/FAIL line and the floor check. Read-only.
# Exit 0 the job passed, 1 it failed, 2 could not tell (no answer, no such
# check, log expired or still running).
set -uo pipefail
ROOT="$1"; shift
REPO="${1:-gHashTag/trinity-fpga}"; REF="${2:-main}"
CHECK="${GATES_CHECK:-gates-can-fail}"

# Same reasons as red.sh: stock macOS has no `timeout`, and gh prints the error
# body on stdout when it fails -- so keep an answer only when gh exited 0.
if command -v timeout >/dev/null 2>&1; then lim() { timeout "$@"; }
elif command -v gtimeout >/dev/null 2>&1; then lim() { gtimeout "$@"; }
else lim() { shift; "$@"; }
fi

SHA=$(lim 30 gh api "repos/$REPO/commits/$REF" --jq .sha 2>/dev/null) || SHA=
[ -n "$SHA" ] || { echo "canfail: $REPO@$REF did not answer"; exit 2; }

# The newest run of the check on this commit (a re-run adds another).
ROW=$(lim 60 gh api --paginate "repos/$REPO/commits/$SHA/check-runs?per_page=100" \
  --jq ".check_runs[] | select(.name == \"$CHECK\") | [.started_at, (.conclusion // .status), .id, .html_url] | @tsv" \
  2>/dev/null | sort | tail -1) \
  || { echo "canfail: check runs of $REPO@${SHA:0:9} did not answer"; exit 2; }
[ -n "$ROW" ] || { echo "canfail: $REPO@${SHA:0:9} has no '$CHECK' check"; exit 2; }
IFS=$'\t' read -r _ CONCL ID URL <<< "$ROW"

echo "  $REPO @ ${SHA:0:9} ($REF)  $CHECK: $CONCL"
echo "    $URL"
case "$CONCL" in
  success|failure) ;;
  *) echo "  not finished -- cannot tell yet"; exit 2 ;;
esac

LOG=$(lim 60 gh api "repos/$REPO/actions/jobs/$ID/logs" 2>/dev/null </dev/null) \
  || LOG=$(lim 60 gh api "repos/$REPO/actions/jobs/$ID/logs" 2>/dev/null </dev/null) \
  || LOG=
# Only the harness's own lines and the floor check. The workflow echoes its
# script (ESC[36;1m), and that script contains "testable gates:" too -- so the
# echoed lines go first, or the floor would be printed twice, once unexpanded.
OUT=$(printf '%s\n' "$LOG" \
  | sed -E 's/^[0-9]{4}-[0-9-]+T[0-9:.]+Z //; s/\r$//' \
  | grep -v -E $'^\e\\[36;1m' \
  | sed -E $'s/\e\\[[0-9;]*m//g' \
  | grep -E '^gates tested: |^  check_[a-z_]+: |^(OK|FAIL): |^testable gates: |^##\[error\]' \
  | sed 's/^/  /')
if [ -z "$OUT" ]; then
  echo "  (log not readable or holds no harness verdict -- open the link)"
  exit 2
fi
printf '%s\n' "$OUT"
[ "$CONCL" = success ] && exit 0
exit 1
