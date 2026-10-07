#!/bin/bash
# pr_branch ROOT PR -- make the local branch of an open PR ready for
# `git worktree add WT BRANCH`, and print BRANCH.
#
# Sourced, never run. `tri worktree` only made NEW branches off origin/main,
# so a reviewer's notes on an open PR (#3451, 03.10) had no door back to the
# PR's own branch: a fresh branch means a second PR and a lost conversation.
# Refuses with a reason on stderr and nothing created: 2 a non-number; 1 gh
# did not answer (unknown is not "no such PR"), the PR is not open, it comes
# from a fork (its branch is not on origin), the fetch failed, or a local
# branch of that name holds commits origin does not -- those are someone's
# work, and resetting the branch to origin would drop them.
. "$(dirname "${BASH_SOURCE[0]}")/fetch.sh"  # tfetch: a failed fetch says so

pr_branch() {
  local root="$1" pr="$2" info branch st cross
  case "$pr" in '' | *[!0-9]*) echo "  usage: tri worktree --pr <number>" >&2; return 2 ;; esac
  info=$(gh pr view "$pr" --json headRefName,state,isCrossRepository \
    --jq '.headRefName+" "+.state+" "+(.isCrossRepository|tostring)' 2>/dev/null)
  if [ $? -ne 0 ] || [ -z "$info" ]; then
    echo "  gh did not answer for PR $pr -- unknown, nothing created" >&2
    return 1
  fi
  read -r branch st cross <<<"$info"
  [ "$st" = OPEN ] || { echo "  PR $pr is $st, not open -- nothing to fix on it" >&2; return 1; }
  [ "$cross" = false ] || { echo "  PR $pr comes from a fork: its branch $branch is not on origin" >&2; return 1; }
  if ! (cd "$root" && tfetch origin "+refs/heads/$branch:refs/remotes/origin/$branch"); then
    echo "  fetching $branch failed -- nothing created" >&2
    return 1
  fi
  if git -C "$root" rev-parse -q --verify "refs/heads/$branch" >/dev/null; then
    if ! git -C "$root" merge-base --is-ancestor "refs/heads/$branch" "origin/$branch"; then
      echo "  local $branch has commits origin/$branch does not: push them, or rename the local branch" >&2
      return 1
    fi
    if ! git -C "$root" branch -q -f "$branch" "origin/$branch" 2>/dev/null; then
      echo "  local $branch is checked out somewhere already: \`git worktree list\`" >&2
      return 1
    fi
  else
    git -C "$root" branch -q --track "$branch" "origin/$branch" || return 1
  fi
  echo "$branch"
}
