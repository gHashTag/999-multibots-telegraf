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
#             same tests (tri mutants). A survivor stops the tick; so does
#             a stale anchor (unchecked is not green).
#   end       releases the lock only if the list's anchors still match the
#             code and the tree is clean: the tick that moved the code
#             re-anchors, not the next one.
#
# The loop names its branch and PR in its state file:
#   <!-- loop-branch: fix/crm-mobile-ux -->
#   <!-- loop-pr: 3199 -->
#   <!-- loop-tests: cd apps/vibee-editor/player && npx vitest run ... -->
# (absent: the current branch, and gh's PR for it, and no tests).
# `--tests` wins over loop-tests. The marker exists because the command was
# retyped every tick: tick 5 added a test file, and the next tick's copy
# without it would have reported five proven mutations as survivors.
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

if [ -z "$TESTS" ]; then
  TESTS=$(sed -n 's/.*<!-- loop-tests: *\(.*[^ ]\) *-->.*/\1/p' "$STATE" 2>/dev/null | head -1)
fi

# The guards run the suite with --bail=1: a killed mutant needs only its
# first failing test, and a survivor still runs everything, so no verdict
# changes. CRM loop tick 12 (01.10.2026): 67 guards took ~11 min at start;
# three measured 65 s -> 43 s with it. Only when the (last) command is
# vitest and does not bail already -- appended text lands on the last
# command of a `&&` chain.
MTESTS="$TESTS"
case "$TESTS" in
  *--bail*) ;;
  *"vitest run"*) case "${TESTS##*&&}" in *"vitest run"*) MTESTS="$TESTS --bail=1" ;; esac ;;
esac

# A test file the branch adds but the marker does not name is never run by
# the baseline nor by the guards. The rule "a new test file goes into the
# marker in the same commit" lived only in the journal: on 01.10.2026 three
# such files had slipped past it (crmInsets, crmClientThumb,
# embed-guest-panel) before tick 18 counted. Now it is checked.
# Files the person had already edited before the loop began are theirs, not
# a dead tick's (blog loop, 02.10.2026: .claude/launch.json stopped every
# tick). They are named in the state file, one marker each:
#   <!-- loop-not-mine: .claude/launch.json -->
NOT_MINE=$(sed -n 's/.*<!-- loop-not-mine: *\(.*[^ ]\) *-->.*/\1/p' "$STATE" 2>/dev/null)
dirty_list() {
  git -C "$ROOT" status --porcelain "${@:---untracked-files=no}" | while IFS= read -r l; do
    printf '%s\n' "$NOT_MINE" | grep -qxF "${l:3}" || printf '%s\n' "$l"
  done
}
unlisted_tests() {
  [ -n "$TESTS" ] || return 0
  local dir base
  dir=$(printf '%s' "$TESTS" | sed -n 's/^cd \([^ &]*\) *&&.*/\1/p')
  base=$(git -C "$ROOT" merge-base HEAD origin/main 2>/dev/null) || return 0
  git -C "$ROOT" diff --name-only --diff-filter=A "$base" HEAD -- \
      "${dir:-.}/*.test.ts" "${dir:-.}/*.test.tsx" 2>/dev/null |
    while read -r f; do
      rel="${f#"$dir"/}"
      case " $TESTS " in *" $rel "*) ;; *) echo "$rel" ;; esac
    done
}

# The guard log is written as each guard finishes, so `tail -f` shows
# progress; block-buffered, it stayed empty for the whole 9-minute run.
export PYTHONUNBUFFERED=1

MUTANTS="$ROOT/.claude/loop-state/$NAME-mutants.json"
# The list as the tick found it: `end` runs only what was added since.
SNAP="${TMPDIR:-/tmp}/tri-loop-$NAME-mutants-at-start.json"

# `end` does not release a tick that leaves the next one blind. Tick 6 of
# the CRM loop (01.10.2026) rewrote a line a past mutation was anchored to;
# the list went stale, and tick 7's start could check none of its 27 guards.
# The tick that moved the code knows the new line -- it re-anchors, now.
# ONE GUARD AT A TIME. start and end both run the mutation list, which
# rewrites source files in place; start also --heals any journalled mutant.
# On 01.10.2026 a start that a tool timeout pushed into the background kept
# running while a second start went ahead: the second one's --heal reverted
# the first one's live mutant (a false SURVIVED), and the first one's mutant
# turned the second one's baseline red. Neither report was true. The lock
# below is taken only after those checks, so it cannot catch this; a busy
# marker with the running guard's pid, taken first, does.
BUSY="${TMPDIR:-/tmp}/tri-loop-$NAME.busy"
if [ "$MODE" = start ] || [ "$MODE" = end ]; then
  OTHER=$(cat "$BUSY" 2>/dev/null)
  if [ -n "$OTHER" ] && kill -0 "$OTHER" 2>/dev/null; then
    echo "── loop-guard: $NAME ──"
    echo "  STOP  another loop-guard (pid $OTHER) is still running -- it may hold a"
    echo "        mutant in the tree right now; wait for it, do not edit or heal"
    exit 1
  fi
  echo $$ > "$BUSY"
  trap 'rm -f "$BUSY"' EXIT
fi

if [ "$MODE" = end ]; then
  BAD=0
  if [ -f "$MUTANTS" ]; then
    CHK=$(cd "$ROOT" && python3 "$ROOT/bin/helpers/mutants.py" --check "$MUTANTS" 2>&1)
    if [ $? -ne 0 ]; then
      echo "  STOP  past guards no longer match the code -- re-anchor them:"
      echo "$CHK" | sed 's/^/          /'
      BAD=1
    fi
  fi
  # ...and so must a PAST guard on a file this tick changed. Tick 12 of the
  # CRM loop (01.10.2026) narrowed Crm.tsx's "recent" row to the chip; an
  # old test then passed with or without the line a guard mutates, and only
  # tick 13's start found it -- a whole tick late, blamed on nobody. The
  # files come from the HEAD `start` recorded; TRI_GUARD_ALL=1 runs every
  # guard (a change to a TEST file can weaken a guard too, unseen here).
  # A guard adopted this tick must die under the loop-tests marker, not only
  # under the files the tick ran it with. Tick 11 (01.10.2026) adopted three
  # guards killed by crmMatches.test.ts, which the marker did not name: the
  # next start would have stopped on "a past mutation SURVIVES" -- a false
  # regression, blamed on the wrong tick. Only the new ones: ten took 95 s
  # (each runs the whole marker suite), the full list would take minutes.
  if [ "$BAD" = 0 ] && [ -n "$TESTS" ] && [ -f "$MUTANTS" ] && [ -f "$SNAP" ]; then
    NEW="${TMPDIR:-/tmp}/tri-loop-$NAME-mutants-new.json"
    TOUCHED=""
    if [ -f "$SNAP.head" ]; then
      TOUCHED=$(git -C "$ROOT" diff --name-only "$(cat "$SNAP.head")" HEAD 2>/dev/null)
    fi
    N=$(TOUCHED="$TOUCHED" ALL="${TRI_GUARD_ALL:-}" python3 - "$SNAP" "$MUTANTS" "$NEW" <<'PY'
import json, os, sys
old = json.load(open(sys.argv[1]))
touched = set(os.environ.get("TOUCHED", "").split())
every = os.environ.get("ALL") == "1"
new = [m for m in json.load(open(sys.argv[2]))
       if every or m not in old or m["file"] in touched]
json.dump(new, open(sys.argv[3], "w"), ensure_ascii=False, indent=2)
print(len(new))
PY
)
    if [ "${N:-0}" -gt 0 ]; then
      NLOG="${TMPDIR:-/tmp}/tri-loop-$NAME-mutants-new.log"
      (cd "$ROOT" && python3 "$ROOT/bin/helpers/mutants.py" "$NEW" -- bash -c "$MTESTS") > "$NLOG" 2>&1
      if [ $? -eq 0 ]; then
        echo "  ok    $N guard(s) -- adopted this tick or on a file it changed -- die under the loop-tests marker"
      else
        echo "  STOP  a guard adopted this tick, or on a file it changed, SURVIVES --"
        echo "        a new one: add its killing test to <!-- loop-tests: -->;"
        echo "        an old one: this tick's change let it through ($NLOG):"
        grep -E '^(SURVIVED|survived)' "$NLOG" | head -5 | sed 's/^/          /'
        BAD=1
      fi
    fi
  fi
  UNL=$(unlisted_tests)
  if [ -n "$UNL" ]; then
    echo "  STOP  test file(s) this branch adds that <!-- loop-tests: --> does not run:"
    echo "$UNL" | sed 's/^/          /'
    BAD=1
  fi
  DIRTY=$(dirty_list --untracked-files=normal | head -5)
  if [ -n "$DIRTY" ]; then
    echo "  STOP  uncommitted files -- the next tick would stop on them:"
    echo "$DIRTY" | sed 's/^/          /'
    BAD=1
  fi
  if [ "$BAD" = 1 ]; then
    echo "── lock kept: fix the above, then tri loop-guard end again ──"; exit 1
  fi
  rm -f "$LOCK" "$SNAP" "$SNAP.head"; echo "loop-guard: $NAME released"; exit 0
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
# A session that ended mid-batch (tick 13, 01.10.2026) left useScrollMemory.ts
# holding a mutant: `finally` never ran. The journal in .git knows the exact
# mutant, so put it back before calling the tree dirty -- otherwise the next
# tick stops on, or worse commits, a file it never edited.
HEALED=$(cd "$ROOT" && python3 "$ROOT/bin/helpers/mutants.py" --heal 2>&1) || stop "mutant journal: $HEALED"
[ -n "$HEALED" ] && [ "$STOP" = 0 ] && warn "$HEALED"
DIRTY=$(dirty_list | grep -c . | tr -d ' ')
[ -n "$NOT_MINE" ] && note "not this loop's: $(printf '%s ' $NOT_MINE)"
if [ "$DIRTY" != 0 ]; then
  stop "$DIRTY tracked file(s) uncommitted -- the last tick died mid-edit:"
  dirty_list | head -8 | sed 's/^/          /'
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

# 5b. Tests the marker forgets.
UNL=$(unlisted_tests)
if [ -n "$UNL" ]; then
  stop "test file(s) this branch adds that <!-- loop-tests: --> does not run:"
  echo "$UNL" | sed 's/^/          /'
else
  [ -n "$TESTS" ] && note "every test file this branch adds is in loop-tests"
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
if [ -n "$TESTS" ] && [ -f "$MUTANTS" ] && [ "$STOP" = 0 ]; then
  echo "  ..    past guards: $(basename "$MUTANTS")"
  MLOG="${TMPDIR:-/tmp}/tri-loop-$NAME-mutants.log"
  (cd "$ROOT" && python3 "$ROOT/bin/helpers/mutants.py" "$MUTANTS" -- bash -c "$MTESTS") > "$MLOG" 2>&1
  case $? in
    0) note "past guards: $(grep -E '^-- [0-9]+ of [0-9]+ killed' "$MLOG" | tr -d -)" ;;
    1) stop "a past mutation SURVIVES -- a guard stopped guarding; see $MLOG"
       grep -E '^SURVIVED' "$MLOG" | head -5 | sed 's/^/          /' ;;
    # A stale anchor used to be a warning and a GO: tick 7 started with all
    # 27 guards unchecked because of one line. Unchecked is not green.
    *) stop "past guards NOT checked -- a stale anchor blinds the whole list; re-anchor (tri mutants --check $MUTANTS)"
       tail -3 "$MLOG" | sed 's/^/          /' ;;
  esac
fi

if [ "$STOP" = 1 ]; then
  echo "── STOP: resolve the above; the lock was not taken ──"; exit 1
fi
if [ "$MODE" = start ]; then
  date +%s > "$LOCK"
  if [ -f "$MUTANTS" ]; then cp "$MUTANTS" "$SNAP"; else echo '[]' > "$SNAP"; fi
  git -C "$ROOT" rev-parse HEAD > "$SNAP.head"
  echo "── GO: lock taken; finish with tri loop-guard end ──"
else
  echo "── GO ──"
fi
exit 0
