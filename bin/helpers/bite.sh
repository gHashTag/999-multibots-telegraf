#!/bin/bash
# DO THE NEW TESTS BITE THE OLD CODE?
#
# A test written next to a fix proves something only if it goes red on the
# code before the fix. Done by hand three times in one night (2026-10-03, the
# tee-pipefail gate of trinity-fpga #828): copy the tree, put the checker's
# previous revision back, run the new self-test, count the failures -- 16 of
# 45, then 27 of 77. `tri mutate` breaks one string in place; this puts a whole
# earlier version of the module back, and never touches the working tree: the
# run happens in a throwaway copy.
#
#   tri bite <rev> <file>... -- <test command>
#   BITE_LINES=N        output lines kept from each run (default 15)
#
# Two runs in the copy, the command in the same subdirectory you call from:
#   1. the tree as it is now (tracked + untracked-not-ignored, uncommitted
#      edits included -- the new test usually is one) -- must be GREEN, or the
#      second run proves nothing;
#   2. the same copy with each <file> as it was at <rev> (a file absent at
#      <rev> is removed) -- should be RED.
# node_modules at the repo root is linked into the copy, not copied.
#
# Exit 0 the tests bite (red on <rev>), 1 they do not (green on <rev> too),
# 2 cannot tell (bad arguments, unknown rev, red already on the current tree).
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

# Paths are taken relative to where you stand, as git takes them.
REL=()
for f in "${FILES[@]}"; do
  r=$(cd "$TOP" && git ls-files --full-name --error-unmatch -- "$SUB$f" 2>/dev/null) \
    || r=$(git -C "$TOP" ls-tree --name-only "$REV" -- "$SUB$f" 2>/dev/null)
  [ -n "$r" ] || { echo "bite: $f is neither tracked now nor at $REV"; exit 2; }
  # One file, not a directory: ls-files lists a directory's files, ls-tree
  # names the tree, and `git show` of a tree would write its listing.
  case "$r" in *$'\n'*) echo "bite: $f is a directory -- name the files"; exit 2 ;; esac
  t=$(git -C "$TOP" cat-file -t "$REV:$r" 2>/dev/null) || t=
  [ -z "$t" ] || [ "$t" = blob ] || { echo "bite: $f is a $t at $REV, not a file"; exit 2; }
  REL+=("$r")
done

COPY=$(mktemp -d "${TMPDIR:-/tmp}/tri-bite.XXXXXX")
# The run's output lives outside the copy: a file inside it is one more
# untracked file for any test that counts them.
OUT=$(mktemp "${TMPDIR:-/tmp}/tri-bite-out.XXXXXX")
trap 'rm -rf "$COPY" "$OUT"' EXIT INT TERM

# Tracked and untracked-but-not-ignored files that exist on disk: a file
# deleted in the working tree is listed by ls-files and would stop tar.
( cd "$TOP" && git ls-files -z --cached --others --exclude-standard \
    | while IFS= read -r -d '' p; do [ -e "$p" ] || [ -L "$p" ] && printf '%s\0' "$p"; done \
    | tar --null -T - -cf - ) | tar -xf - -C "$COPY" \
  || { echo "bite: could not copy the tree"; exit 2; }
[ -d "$TOP/node_modules" ] && [ ! -e "$COPY/node_modules" ] && ln -s "$TOP/node_modules" "$COPY/node_modules"

run() {
  ( cd "$COPY/$SUB" && "$@" ) >"$OUT" 2>&1 </dev/null
  local rc=$?
  tail -n "$KEEP" "$OUT" | sed 's/^/    /'
  return $rc
}

dirty=$(git -C "$TOP" status --porcelain --untracked-files=normal 2>/dev/null | head -1)
echo "  now ($(git -C "$TOP" rev-parse --short HEAD)${dirty:+ + uncommitted})"
run "$@"; now=$?
if [ $now -ne 0 ]; then
  echo "  red already on the current tree (exit $now) -- a red on $REV would prove nothing"
  exit 2
fi
echo "  green"

for r in "${REL[@]}"; do
  if git -C "$TOP" cat-file -e "$REV:$r" 2>/dev/null; then
    mkdir -p "$COPY/$(dirname "$r")"
    git -C "$TOP" show "$REV:$r" >"$COPY/$r" || { echo "bite: cannot read $r at $REV"; exit 2; }
    echo "  $r <- $REV"
  else
    rm -f "$COPY/$r"
    echo "  $r removed (absent at $REV)"
  fi
done

run "$@"; old=$?
if [ $old -ne 0 ]; then
  echo "  BITES: red on $REV (exit $old), green now"
  exit 0
fi
echo "  DOES NOT BITE: green on $REV as well -- the tests do not tell the two apart"
exit 1
