#!/bin/bash
# What is in flight right now -- the first command of every loop cycle, so a
# new cycle does not start a second copy of work the last one left running.
#
# Read-only: open PRs (with GitHub's own mergeable verdict), worktrees, free
# disk, and the last deployment of the bot and the render. Railway is asked
# with explicit ids (bin/helpers/rail.sh), never `railway service X`: the
# directory link is shared by every session in this checkout.
ROOT="${1:-$(cd "$(dirname "$0")/../.." && pwd)}"
cd "$ROOT" || exit 2
. "$ROOT/bin/helpers/rail.sh"  # Railway by explicit ids

echo "── open PRs (newest first) ──"
# An empty answer and a failed one must not print alike: "nothing open" and
# "could not ask" are different news for a cycle deciding what to start.
PRS=$(gh pr list --state open --limit 30 \
  --json number,title,mergeable,updatedAt,headRefName \
  -q '.[] | "  #\(.number)  \(.mergeable | .[0:9])  \(.updatedAt[0:16])  \(.title[0:70])"' 2>/dev/null)
if [ $? -ne 0 ]; then echo "  (gh did not answer -- open PRs unknown)"
elif [ -z "$PRS" ]; then echo "  (none open)"
else echo "$PRS"
fi

echo
echo "── worktrees ──"
git worktree list 2>/dev/null | awk '{printf "  %s  %s\n", $3, $1}'

echo
echo "── disk ──"
df -h /System/Volumes/Data 2>/dev/null | awk 'NR==2 {print "  free: " $4 "  used: " $5}'
FREE_KB=$(df -k /System/Volumes/Data 2>/dev/null | awk 'NR==2 {print $4}')
if [ -n "$FREE_KB" ] && [ "$FREE_KB" -lt 3000000 ]; then
  echo "  !! under 3 GB: remove finished worktrees, then .claude/loop-opus/free-disk.sh"
fi

echo
echo "── last deployments ──"
for s in 999-multibots-telegraf vibee-render; do
  # A failed railway call used to print a blank, which reads as "nothing
  # deployed"; it is "could not ask".
  if OUT=$(railway deployment list --project "$RAIL_PROJECT" --environment "$RAIL_ENV" --service "$s" 2>/dev/null); then
    LAST=$(printf '%s\n' "$OUT" | sed -n 2p | sed 's/^ *//')
    printf '  %-24s %s\n' "$s" "${LAST:-(no deployment listed)}"
  else
    printf '  %-24s %s\n' "$s" "(railway did not answer -- unknown)"
  fi
done
