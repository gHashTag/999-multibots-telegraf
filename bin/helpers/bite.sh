#!/bin/bash
# DO THE NEW TESTS BITE THE OLD CODE?
#
# A test written next to a fix proves something only if it goes red on the
# code before the fix. Done by hand three times in one night (2026-10-03, the
# tee-pipefail gate of trinity-fpga #828): copy the tree, put the checker's
# previous revision back, run the new self-test, count the failures -- 16 of
# 45, then 27 of 77. `tri mutate` breaks one string in place; this puts a whole
# earlier version of the module back, and never touches the working tree: each
# run happens in its own throwaway copy.
#
#   tri bite <rev> <file>... -- <test command>
#   BITE_LINES=N        output lines kept from each run (default 15)
#
# Two runs, the command in the same subdirectory you call from:
#   1. a copy of the tree as it is now (tracked + untracked-not-ignored,
#      uncommitted edits included -- the new test usually is one) -- must be
#      GREEN, or the second run proves nothing;
#   2. a FRESH copy with each <file> as it was at <rev>, mode and symlinks
#      included (a file absent at <rev> is removed) -- should be RED. Fresh,
#      because a test that caches its result in the tree would otherwise read
#      the first run's answer (review of #3462).
# node_modules at the repo root is linked into each copy, not copied.
#
# Exit 0 the tests bite (red on <rev>), 1 they do not (green on <rev> too),
# 2 cannot tell (bad arguments, unknown rev, red already on the current tree,
# interrupted).
set -uo pipefail

KEEP="${BITE_LINES:-15}"
REV="${1:-}"; shift 2>/dev/null || true
FILES=()
while [ $# -gt 0 ] && [ "$1" != "--" ]; do FILES+=("$1"); shift; done
[ "${1:-}" = "--" ] && shift
if [ -z "$REV" ] || [ ${#FILES[@]} -eq 0 ] || [ $# -eq 0 ]; then
  echo 'tri bite <rev> <file>... -- <test command>'
  echo 'example: tri bite origin/main tools/check.py -- python3 tools/test_check.py'
  exit 2
fi

TOP=$(git rev-parse --show-toplevel 2>/dev/null) || { echo "bite: not inside a git repository"; exit 2; }
SUB=$(git rev-parse --show-prefix)
git rev-parse --verify --quiet "$REV^{commit}" >/dev/null || { echo "bite: unknown revision: $REV"; exit 2; }

# Paths are taken relative to where you stand. Normalised by python, not by
# git: `git ls-files` quotes any name with a non-ASCII byte, a quote or a
# backslash, and a quoted name used as a path swaps nothing -- a false
# "does not bite" (review of #3462). Names travel NUL-separated.
REL=()
while IFS= read -r -d '' r; do REL+=("$r"); done < <(
  python3 - "$SUB" "${FILES[@]}" <<'PY'
import os, sys
sub = sys.argv[1]
for f in sys.argv[2:]:
    sys.stdout.write(os.path.normpath(os.path.join(sub, f)) + "\0")
PY
)
[ ${#REL[@]} -eq ${#FILES[@]} ] || { echo "bite: could not read the file names"; exit 2; }
for r in "${REL[@]}"; do
  case "$r" in ..|../*|/*) echo "bite: $r is outside the repository"; exit 2 ;; esac
  # One file, not a directory -- now or at <rev>. A directory would let the
  # swap below write a tree listing, or swap nothing at all.
  if [ -d "$TOP/$r" ] && [ ! -L "$TOP/$r" ]; then echo "bite: $r is a directory -- name the files"; exit 2; fi
  t=$(git -C "$TOP" cat-file -t "$REV:$r" 2>/dev/null) || t=
  [ -z "$t" ] || [ "$t" = blob ] || { echo "bite: $r is a $t at $REV, not a file"; exit 2; }
  [ -n "$t" ] || [ -e "$TOP/$r" ] || [ -L "$TOP/$r" ] \
    || { echo "bite: $r is neither in the tree now nor at $REV"; exit 2; }
done

WORK=$(mktemp -d "${TMPDIR:-/tmp}/tri-bite.XXXXXX")
# INT and TERM must END the run, not only clean up: a trap that only deleted
# the copies let the script go on and print BITES (review of #3462). bash runs
# the trap after the foreground command returns, so the verdict line is never
# reached.
trap 'rm -rf "$WORK"' EXIT
trap 'echo "  interrupted -- cannot tell"; exit 2' INT TERM HUP

# A copy of the tree as it is on disk: tracked and untracked-not-ignored files
# that exist (a file deleted in the working tree is still listed by ls-files).
copy() {
  local dest="$1"
  mkdir -p "$dest"
  ( cd "$TOP" && git ls-files -z --cached --others --exclude-standard \
      | while IFS= read -r -d '' p; do
          if [ -e "$p" ] || [ -L "$p" ]; then printf '%s\0' "$p"; fi
        done \
      | tar --null -T - -cf - ) | tar -xf - -C "$dest" \
    || { echo "bite: could not copy the tree"; exit 2; }
  if [ -d "$TOP/node_modules" ] && [ ! -e "$dest/node_modules" ]; then
    ln -s "$TOP/node_modules" "$dest/node_modules"
  fi
}

# Run in a copy, outside it the output: a file inside it is one more untracked
# file for any test that counts them.
run() {
  local dir="$1"; shift
  ( cd "$dir/$SUB" && "$@" ) >"$WORK/out" 2>&1 </dev/null
  local rc=$?
  tail -n "$KEEP" "$WORK/out" | sed 's/^/    /'
  return $rc
}

# A test killed by a hang-up, Ctrl-C or TERM did not judge anything.
interrupted() { case "$1" in 129|130|143) return 0 ;; esac; return 1; }

dirty=$(git -C "$TOP" status --porcelain --untracked-files=normal 2>/dev/null | head -1)
echo "  now ($(git -C "$TOP" rev-parse --short HEAD)${dirty:+ + uncommitted})"
copy "$WORK/now"
run "$WORK/now" "$@"; now=$?
if interrupted $now; then echo "  interrupted (exit $now) -- cannot tell"; exit 2; fi
if [ $now -ne 0 ]; then
  echo "  red already on the current tree (exit $now) -- a red on $REV would prove nothing"
  exit 2
fi
echo "  green"

OLD="$WORK/old"
copy "$OLD"
REAL_OLD=$(cd "$OLD" && pwd -P)
for r in "${REL[@]}"; do
  dest="$OLD/$r"
  mkdir -p "$(dirname "$dest")"
  # Never write through a link: the copy keeps the tree's symlinks, and one
  # pointing (or sitting in a directory pointing) back into the repository
  # would carry the old version into the real working tree (review of #3462).
  parent=$(cd "$(dirname "$dest")" && pwd -P)
  case "$parent/" in
    "$REAL_OLD"/*) ;;
    *) echo "bite: $r sits under a symlink that leaves the copy -- refusing"; exit 2 ;;
  esac
  rm -f "$dest"
  mode=$(git -C "$TOP" ls-tree "$REV" -- ":(literal)$r" 2>/dev/null | awk '{ print $1; exit }')
  case "$mode" in
    "")
      # Absent, by the object store -- not by an empty ls-tree, which would
      # also be empty if ls-tree failed, and then the module would vanish.
      if git -C "$TOP" cat-file -e "$REV:$r" 2>/dev/null; then
        echo "bite: cannot read the mode of $r at $REV"; exit 2
      fi
      echo "  $r removed (absent at $REV)" ;;
    120000)
      # A symlink at <rev> comes back as a symlink, not as a file holding the
      # target's path.
      ln -s "$(git -C "$TOP" cat-file blob "$REV:$r")" "$dest" \
        || { echo "bite: cannot restore the link $r at $REV"; exit 2; }
      echo "  $r <- $REV (symlink)" ;;
    100644|100755)
      git -C "$TOP" cat-file blob "$REV:$r" >"$dest" \
        || { echo "bite: cannot read $r at $REV"; exit 2; }
      [ "$mode" = 100755 ] && chmod +x "$dest"
      echo "  $r <- $REV" ;;
    *)
      echo "bite: $r has mode $mode at $REV (a submodule?) -- cannot restore it"; exit 2 ;;
  esac
done

run "$OLD" "$@"; old=$?
if interrupted $old; then echo "  interrupted (exit $old) -- cannot tell"; exit 2; fi
if [ $old -ne 0 ]; then
  echo "  BITES: red on $REV (exit $old), green now"
  exit 0
fi
echo "  DOES NOT BITE: green on $REV as well -- the tests do not tell the two apart"
exit 1
