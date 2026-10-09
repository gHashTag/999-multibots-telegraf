#!/bin/bash
# WHAT RAILWAY SAID ABOUT A PULL REQUEST.
#
# GitHub Actions do not start in this repository (account billing); the
# ci-bridge service on Railway (deployment/ci-bridge, spec automation/
# ci-bridge) runs the local gates on each new PR head and leaves the mark
# `railway/checks` -- a commit status, or a check run when the app may not
# write statuses. This reads that mark, so nobody opens GitHub to see it.
#
#   tri ci            every open PR: number, head, mark, description
#   tri ci 3950 3951  only these
#   tri ci --recheck 3951   ask the bridge to run that head again
# Exit 0 when every PR shown is green, 1 when one is red or errored,
# 2 when GitHub could not be read. "no mark" is neither: the bridge has not
# reached that head yet (or it predates SINCE).
set -uo pipefail
REPO="${CI_REPO:-gHashTag/999-multibots-telegraf}"
CONTEXT="railway/checks"
if [ "${1:-}" = "--recheck" ]; then
  # A finished head runs again on the bridge's next pass (spec recheck_due:
  # the comment must be newer than the mark, from someone who may write).
  shift; [ $# -gt 0 ] || { echo "tri ci --recheck <PR>..."; exit 2; }
  for n in "$@"; do
    gh api -X POST "repos/$REPO/issues/$n/comments" -f body=/recheck --jq '.html_url' ||
      { echo "tri ci: could not comment on #$n"; exit 2; }
  done
  exit 0
fi
if [ $# -gt 0 ]; then PRS="$*"; else
  PRS=$(gh api "repos/$REPO/pulls?state=open&per_page=50" --jq '.[].number' 2>/dev/null) ||
    { echo "tri ci: GitHub could not be read (gh auth?)"; exit 2; }
fi
[ -z "$PRS" ] && { echo "  no open PRs"; exit 0; }
worst=0
for n in $PRS; do
  sha=$(gh api "repos/$REPO/pulls/$n" --jq .head.sha 2>/dev/null) ||
    { echo "  #$n  could not be read"; worst=2; continue; }
  line=$(gh api "repos/$REPO/commits/$sha/status" \
    --jq ".statuses[] | select(.context==\"$CONTEXT\") | \"\(.state)\t\(.description)\"" 2>/dev/null | head -1)
  if [ -z "$line" ]; then
    line=$(gh api "repos/$REPO/commits/$sha/check-runs?check_name=$CONTEXT&per_page=1" \
      --jq '.check_runs[0] | select(.) | "\(if .status=="completed" then .conclusion else "pending" end)\t\(.output.title // "")"' 2>/dev/null)
  fi
  state=${line%%$'\t'*}; desc=${line#*$'\t'}
  case "$state" in
    success) mark="✅ green" ;;
    failure|error) mark="❌ $state"; [ $worst -lt 1 ] && worst=1 ;;
    pending) mark="⏳ running" ;;
    *) mark="· no mark"; desc="" ;;
  esac
  printf '  #%-5s %s  %-12s %s\n' "$n" "${sha:0:9}" "$mark" "$desc"
done
exit $worst
