#!/bin/bash
# WHAT IS RED ON MAIN, AND WHAT DOES EACH RED CHECK SAY?
#
# Done by hand five times in one night (2026-10-02) on gHashTag/trinity-fpga:
# list the check runs of main's head, pick the failures, fetch each job log,
# and read past the echoed workflow source and the runner's cleanup chatter to
# the three lines that say why. One of those times the answer was a gate that
# went red only BECAUSE another gate had just turned green (gates-can-fail
# could test it at last) -- so look at the whole list after every merge, not
# only at the check you were fixing.
#
#   tri red [owner/repo] [ref]      default: this repo, main
#   RED_LINES=N                     log lines kept per failure (default 12)
#
# Read-only. Exit 0 nothing failed, 1 something failed (named, with its log
# tail), 2 could not tell (no answer from GitHub, unknown ref).
set -uo pipefail
ROOT="$1"; shift
REPO="${1:-}"; REF="${2:-main}"
if [ -z "$REPO" ]; then
  REPO=$(cd "$ROOT" && gh repo view --json nameWithOwner -q .nameWithOwner 2>/dev/null) \
    || { echo "red: cannot tell which repo -- pass owner/repo"; exit 2; }
fi
KEEP="${RED_LINES:-12}"

# gh api prints the error body on stdout when it fails, so keep an answer only
# when gh exited 0 -- a 404 page is not a SHA.
SHA=$(timeout 30 gh api "repos/$REPO/commits/$REF" --jq .sha 2>/dev/null) || SHA=
[ -n "$SHA" ] || { echo "red: $REPO@$REF did not answer"; exit 2; }

RUNS=$(timeout 60 gh api --paginate "repos/$REPO/commits/$SHA/check-runs?per_page=100" \
  --jq '.check_runs[] | [(.conclusion // .status), .id, .name, .html_url] | @tsv' 2>/dev/null) \
  || { echo "red: check runs of $REPO@${SHA:0:9} did not answer"; exit 2; }
[ -n "$RUNS" ] || { echo "red: $REPO@${SHA:0:9} has no check runs (yet?) -- cannot tell"; exit 2; }

echo "  $REPO @ ${SHA:0:9} ($REF)"
printf '%s\n' "$RUNS" | cut -f1 | sort | uniq -c | sort -rn | sed 's/^/  /'

BAD=$(printf '%s\n' "$RUNS" | awk -F'\t' '$1 ~ /^(failure|timed_out|cancelled|action_required|startup_failure)$/')
if [ -z "$BAD" ]; then
  pend=$(printf '%s\n' "$RUNS" | awk -F'\t' '$1 ~ /^(queued|in_progress|pending|waiting)$/' | wc -l | tr -d ' ')
  [ "$pend" -gt 0 ] && echo "  nothing failed; $pend still running -- not yet green"
  [ "$pend" -eq 0 ] && echo "  nothing failed"
  exit 0
fi

while IFS=$'\t' read -r concl id name url; do
  echo
  echo "  ✗ $name  ($concl)"
  echo "    $url"
  # The log echoes the step's script (ESC[36;1m lines), the runner's group
  # markers and, after the verdict, a page of git cleanup. None of it is why.
  timeout 60 gh api "repos/$REPO/actions/jobs/$id/logs" 2>/dev/null \
    | sed -E 's/^[0-9]{4}-[0-9-]+T[0-9:.]+Z //; s/\r$//' \
    | awk '/^Post job cleanup/ {exit} {print}' \
    | grep -v -E $'^\e\\[36;1m|^##\\[(group|endgroup)\\]|^\\[command\\]|^shell: |^env:|^  [A-Z_]+: ' \
    | sed -E $'s/\e\\[[0-9;]*m//g' \
    | grep -v -E '^\s*$' \
    | tail -n "$KEEP" | sed 's/^/    /' \
    || echo "    (log not readable -- open the link)"
done <<< "$BAD"
exit 1
