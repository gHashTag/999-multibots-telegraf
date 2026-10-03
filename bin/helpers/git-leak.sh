#!/bin/bash
# tri git-leak [--heal] -- did a test run under a hook's GIT_DIR write into
# this repository?
#
# A git hook exports GIT_DIR for the repo it guards; a test that builds a
# throwaway repo and runs git in it then writes into the REAL one. Measured on
# 2026-10-03: the shared core.bare flipped to true 68 times (every git command
# on the machine then fails with "must be run in a work tree"), and a fixture
# branch docs/x by `t <t@t>` appeared in the real repo. vitest.config.ts now
# drops those vars for every run; this is the check that it held.
#
# Reports, exit 1 on any finding:
#   - core.bare=true in the shared config (--heal sets it back to false, only
#     when the common dir is a `.git` next to a working tree);
#   - branches and remote-tracking refs whose tip was authored by a test fixture identity (listed with
#     the command to delete them -- deleting is left to a person);
#   - GIT_DIR exported into this shell (a hook is running us).
# Also prints what /tmp/bare-watch.log recorded, when that watcher exists.
set -u
ROOT="${1:?repo root required}"
shift
HEAL=0
[ "${1:-}" = "--heal" ] && HEAL=1

HOOK_DIR=${GIT_DIR:-}
# Our own git calls must not follow a leaked GIT_DIR either.
for v in $(git rev-parse --local-env-vars 2>/dev/null); do unset "$v"; done

common=$(git -C "$ROOT" rev-parse --path-format=absolute --git-common-dir 2>/dev/null)
if [ -z "$common" ] && [ -f "$ROOT/.git" ]; then
  # A worktree whose shared repo already reads as bare: follow the gitdir file.
  wt=$(sed -n 's/^gitdir: //p' "$ROOT/.git")
  common=${wt%/worktrees/*}
fi
[ -z "$common" ] && [ -d "$ROOT/.git" ] && common="$ROOT/.git"
[ -n "$common" ] || { echo "  FAIL  no git repository at $ROOT"; exit 2; }

rc=0
bare=$(git config --file "$common/config" --get core.bare 2>/dev/null || echo unset)
if [ "$bare" = "true" ]; then
  if [ "$HEAL" = 1 ] && [ "$(basename "$common")" = ".git" ]; then
    git config --file "$common/config" core.bare false
    echo "  HEAL  core.bare was true in $common/config -- set back to false"
  else
    echo "  FAIL  core.bare=true in $common/config -- every git command fails with \"must be run in a work tree\""
    echo "        heal: tri git-leak --heal"
    rc=1
  fi
else
  echo "  OK    core.bare=$bare ($common/config)"
fi

# Fixture identities used by scripts/*.test.ts and src/__tests__/tools.
FIXTURE='<t@t>|<t@t.t>|<test@example.com>'
leaked=$(git --git-dir="$common" for-each-ref --format='%(authoremail) %(refname:short)' refs/heads refs/remotes 2>/dev/null |
  grep -E "^($FIXTURE) " | cut -d' ' -f2-)
if [ -n "$leaked" ]; then
  echo "  FAIL  refs made by a test fixture identity:"
  printf '%s\n' "$leaked" | sed 's/^/          /'
  echo "        delete after a look: git --git-dir=$common branch -D <name>  (remote-tracking: update-ref -d refs/remotes/<name>)"
  rc=1
else
  echo "  OK    no ref made by a test fixture identity"
fi

if [ -n "$HOOK_DIR" ]; then
  echo "  WARN  GIT_DIR=$HOOK_DIR exported here -- a hook is running this shell"
fi

LOG=/tmp/bare-watch.log
if [ -f "$LOG" ]; then
  n=$(grep -c "^=== flip seen" "$LOG")
  last=$(grep "^=== flip seen" "$LOG" | tail -1 | awk '{print $4}')
  pgrep -f bare-watch.sh >/dev/null && w=running || w=stopped
  echo "  INFO  bare-watch ($w): $n flips logged, last at ${last:-never} ($LOG)"
fi
exit $rc
