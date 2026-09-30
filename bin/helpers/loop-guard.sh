#!/bin/bash
# tri loop-guard [start|end|status] [--tests "<command>"]
#
# MAY THIS CRON TICK TOUCH THE BRANCH -- OR WOULD IT BREAK THE LAST ONE?
#
# The CRM mobile loop (30.09.2026) runs every 30 minutes through the night
# with nobody watching. `tri loop` answers "what is in the plan"; this
# answers "is the ground still where the last tick left it":
#
#   lock      a tick that has not ended still holds the loop. Two ticks on
#             one branch commit over each other. The lock lives in $TMPDIR,
#             not in the repo: tracked state must not carry a PID.
#   tree      uncommitted files = the last tick died mid-edit. Finish or
#             revert them first; do not start a new item on top.
#   remote    behind origin/<branch> = someone else pushed; pull before
#             editing, or the next push is rejected (and force is banned).
#   PR        MERGED = the branch is done. New work goes on a fresh branch
#             from main; pushing more onto a merged branch is lost work.
#   main      files this branch changes that main has changed too since the
#             merge base = a conflict waiting; merge main in first.
#   --tests   the baseline, BEFORE editing. Red here is not this tick's
#             fault -- write it down instead of "fixing" it blindly.
#   mutants   with --tests and .claude/loop-state/<name>-mutants.json: every
#             mutation proven by a past tick must still be killed by the
#             same tests (tri mutants). A survivor stops the tick.
#
# The loop names its branch and PR in its state file:
#   <!-- loop-branch: fix/crm-mobile-ux -->
#   <!-- loop-pr: 3199 -->
# (absent: the current branch, and gh's PR for it).
#
# Exit 0 go, 1 stop (the reason is printed), 2 could not check.
set -uo pipefail
ROOT="${1:?root}"; shift
NAME="${TRI_LOOP:-crm}"
STATE="$ROOT/.claude/loop-state/$NAME-loop.md"
LOCK="${TMPDIR:-/tmp}/tri-loop-$NAME.lock"
STALE_MIN="${LOOP_GUARD_STALE_MIN:-90}"

MODE=status; TESTS=""
while [ $# -gt 0 ]; do
  case "$1" in
    start|end|status) MODE="$1" ;;
    --tests) TESTS="${2:-}"; shift ;;
    *) echo "loop-guard: unknown argument $1"; exit 2 ;;
  esac
  shift
done

if [ "$MODE" = end ]; then
  rm -f "$LOCK"; echo "loop-guard: $NAME released"; exit 0
fi

STOP=0
stop() { echo "  STOP  $*"; STOP=1; }
note() { echo "  ok    $*"; }
warn() { echo "  warn  $*"; }

echo "── loop-guard: $NAME ──"

# 1. Lock.
if [ -f "$LOCK" ]; then
  AGE=$(( ( $(date +%s) - $(cat "$LOCK" 2>/dev/null || echo 0) ) / 60 ))
  if [ "$AGE" -lt "$STALE_MIN" ]; then
    stop "a tick started ${AGE} min ago has not ended (tri loop-guard end, if it died)"
  else
    warn "lock is ${AGE} min old -- the tick died; taking it over"
  fi
else
  note "no tick in progress"
fi

# 2. Tree.
BR=$(sed -n 's/.*<!-- loop-branch: *\([^ ]*\) *-->.*/\1/p' "$STATE" 2>/dev/null | head -1)
CUR=$(git -C "$ROOT" branch --show-current)
BR="${BR:-$CUR}"
if [ "$CUR" != "$BR" ]; then
  stop "on '$CUR', the loop works on '$BR'"
fi
DIRTY=$(git -C "$ROOT" status --porcelain --untracked-files=no | wc -l | tr -d ' ')
if [ "$DIRTY" != 0 ]; then
  stop "$DIRTY tracked file(s) uncommitted -- the last tick died mid-edit:"
  git -C "$ROOT" status --porcelain --untracked-files=no | head -8 | sed 's/^/          /'
else
  note "tree clean on $BR"
fi

# 3. Remote.
if ! git -C "$ROOT" fetch -q origin main "$BR" 2>/dev/null; then
  git -C "$ROOT" fetch -q origin main 2>/dev/null || { echo "  cannot fetch -- could not check"; exit 2; }
  warn "origin/$BR does not exist yet (never pushed)"
else
  read -r BEHIND AHEAD < <(git -C "$ROOT" rev-list --left-right --count "origin/$BR...HEAD")
  if [ "$BEHIND" != 0 ]; then
    stop "$BEHIND commit(s) on origin/$BR are not here -- pull (never force)"
  else
    note "origin/$BR: $AHEAD unpushed, 0 behind"
  fi
fi

# 4. PR.
PR=$(sed -n 's/.*<!-- loop-pr: *\([0-9]*\) *-->.*/\1/p' "$STATE" 2>/dev/null | head -1)
if command -v gh >/dev/null; then
  if [ -n "$PR" ]; then
    PRS=$(cd "$ROOT" && gh pr view "$PR" --json state -q .state 2>/dev/null)
  else
    PRS=$(cd "$ROOT" && gh pr view "$BR" --json number,state -q '"\(.number) \(.state)"' 2>/dev/null)
    PR="${PRS%% *}"; PRS="${PRS##* }"
  fi
  case "$PRS" in
    MERGED) stop "PR #$PR is MERGED -- branch the next item from fresh main, update loop-branch/loop-pr" ;;
    CLOSED) stop "PR #$PR was CLOSED without merging -- ask why (loop-note) before pushing more" ;;
    OPEN)   note "PR #$PR open" ;;
    *)      warn "no PR state (gh offline or no PR yet)" ;;
  esac
fi

# 5. Main moved under the branch.
BASE=$(git -C "$ROOT" merge-base HEAD origin/main)
MINE=$(git -C "$ROOT" diff --name-only "$BASE" HEAD | sort)
THEIRS=$(git -C "$ROOT" diff --name-only "$BASE" origin/main | sort)
BOTH=$(comm -12 <(echo "$MINE") <(echo "$THEIRS") | sed '/^$/d')
if [ -n "$BOTH" ]; then
  warn "main changed files this branch changes too -- merge main in before the next edit:"
  echo "$BOTH" | head -8 | sed 's/^/          /'
else
  note "main has not touched this branch's files ($(git -C "$ROOT" rev-list --count HEAD..origin/main) commits behind main)"
fi

# 6. Baseline.
if [ -n "$TESTS" ]; then
  echo "  ..    baseline: $TESTS"
  if (cd "$ROOT" && bash -c "$TESTS") > "${TMPDIR:-/tmp}/tri-loop-$NAME-baseline.log" 2>&1; then
    note "baseline green"
  else
    stop "baseline RED before any edit -- not this tick's fault; see ${TMPDIR:-/tmp}/tri-loop-$NAME-baseline.log"
    tail -5 "${TMPDIR:-/tmp}/tri-loop-$NAME-baseline.log" | sed 's/^/          /'
  fi
fi

# 7. Past guards still bite. A green baseline says the tests pass; it does
# not say they would still FAIL if last night's fix were undone -- a later
# tick can weaken a test (or move the code it watched) and stay green. The
# loop keeps every proven mutation in <name>-mutants.json; each must still
# be killed. Only with --tests (the same command), only if the list exists.
MUTANTS="$ROOT/.claude/loop-state/$NAME-mutants.json"
if [ -n "$TESTS" ] && [ -f "$MUTANTS" ] && [ "$STOP" = 0 ]; then
  echo "  ..    past guards: $(basename "$MUTANTS")"
  MLOG="${TMPDIR:-/tmp}/tri-loop-$NAME-mutants.log"
  (cd "$ROOT" && python3 "$ROOT/bin/helpers/mutants.py" "$MUTANTS" -- bash -c "$TESTS") > "$MLOG" 2>&1
  case $? in
    0) note "past guards: $(grep -E '^-- [0-9]+ of [0-9]+ killed' "$MLOG" | tr -d -)" ;;
    1) stop "a past mutation SURVIVES -- a guard stopped guarding; see $MLOG"
       grep -E '^SURVIVED' "$MLOG" | head -5 | sed 's/^/          /' ;;
    *) warn "past guards not checked (the list no longer matches the code?); see $MLOG"
       tail -3 "$MLOG" | sed 's/^/          /' ;;
  esac
fi

if [ "$STOP" = 1 ]; then
  echo "── STOP: resolve the above; the lock was not taken ──"; exit 1
fi
if [ "$MODE" = start ]; then
  date +%s > "$LOCK"; echo "── GO: lock taken; finish with tri loop-guard end ──"
else
  echo "── GO ──"
fi
exit 0
