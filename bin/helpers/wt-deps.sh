#!/bin/bash
# tri wt-deps [tree] -- make a linked worktree's node_modules ready for gates.
#
# WHY. A fresh `git worktree add` has no render node_modules (or a symlink
# to the main checkout's). The pre-push related-tests gate then fails three
# render suites -- "Cannot find package 'undici'", "Cannot find module
# '@vibee/atoms'" -- and blames the change. 2026-10-06 it blocked three
# pushes in one night; the cure each time was the same hand-made clone (#3674).
#
#   root   node_modules -> symlink to the main checkout (never a root install
#          in a linked tree: it writes through the symlink)
#   render node_modules -> a REAL directory: a symlink is removed (atoms
#          would resolve into the other tree); a missing one is an APFS clone
#          (`cp -c`, near-free; on Linux `cp --reflink=auto`) from a donor
#          whose render/package-lock.json is byte-identical -- the main
#          checkout first, then any sibling worktree; with no donor,
#          `npm ci` in render only.
#
# rc 0 = ready, 1 = still broken. Seam: TRI_WT_MAIN (the main checkout).
set -u
TREE=$(cd "${1:-.}" && git rev-parse --show-toplevel 2>/dev/null) || {
  echo "wt-deps: ${1:-.} is not inside a git tree"
  exit 1
}
MAIN=${TRI_WT_MAIN:-$(dirname "$(cd "$TREE" && git rev-parse --path-format=absolute --git-common-dir)")}
R=apps/vibee-editor/render
if [ "$TREE" = "$MAIN" ]; then
  echo "wt-deps: $TREE is the main checkout -- use \`tri deps\` there"
  exit 1
fi

fail=0
# Root: present means it RESOLVES; a dangling link is relinked, and a main
# checkout with nothing to link to is a failure, not "present" (#3675 review).
if [ -e "$TREE/node_modules" ]; then
  echo "  root    present"
elif [ ! -d "$MAIN/node_modules" ]; then
  echo "  FAIL    root: the main checkout has no node_modules -- \`bun install\` there first"
  fail=1
else
  [ -L "$TREE/node_modules" ] && rm "$TREE/node_modules"
  if ln -s "$MAIN/node_modules" "$TREE/node_modules"; then
    echo "  root    linked to the main checkout"
  else
    echo "  FAIL    root: could not link node_modules"
    fail=1
  fi
fi

if [ -L "$TREE/$R/node_modules" ]; then
  rm "$TREE/$R/node_modules"
  echo "  render  was a symlink into another tree -- removed"
fi

if [ ! -d "$TREE/$R/node_modules" ]; then
  lock=$(shasum -a 256 <"$TREE/$R/package-lock.json" | cut -c1-16)
  donor=""
  for t in "$MAIN" $(cd "$TREE" && git worktree list --porcelain | sed -n 's/^worktree //p'); do
    [ "$t" = "$TREE" ] && continue
    [ -d "$t/$R/node_modules" ] && [ ! -L "$t/$R/node_modules" ] || continue
    [ -d "$t/$R/node_modules/undici" ] || continue
    [ "$(shasum -a 256 <"$t/$R/package-lock.json" 2>/dev/null | cut -c1-16)" = "$lock" ] || continue
    donor=$t
    break
  done
  if [ -n "$donor" ]; then
    # `cp -c` is the macOS clone; GNU cp has no -c and refused the whole
    # copy, so on Linux (the cloud container, the Railway runner) the tree
    # was left without render deps. There a reflink clone where the file
    # system has one, a plain copy where it does not.
    if cp -cR "$donor/$R/node_modules" "$TREE/$R/node_modules" 2>/dev/null; then
      echo "  render  cloned (APFS) from $donor"
    else
      rm -rf "$TREE/$R/node_modules"
      cp -R --reflink=auto "$donor/$R/node_modules" "$TREE/$R/node_modules" &&
        echo "  render  cloned (reflink or copy) from $donor"
    fi
  else
    echo "  render  no donor with this lock -- npm ci in render only"
    (cd "$TREE/$R" && npm ci --no-audit --no-fund >/dev/null 2>&1) ||
      echo "  render  npm ci FAILED"
  fi
else
  echo "  render  present"
fi

# The proof is resolution from inside this tree, not a directory listing.
for pkg in undici @vibee/atoms; do
  where=$(cd "$TREE/$R" && node -e "console.log(require.resolve('$pkg'))" 2>/dev/null)
  if [ -z "$where" ]; then
    echo "  FAIL    $pkg does not resolve from $R"
    fail=1
  fi
done
atoms=$(cd "$TREE/$R/node_modules/@vibee/atoms" 2>/dev/null && pwd -P)
case "$fail:$atoms" in
  0:"$(cd "$TREE" && pwd -P)"/*) echo "  ok      undici and @vibee/atoms resolve; atoms is this tree's" ;;
  0:*) echo "  FAIL    @vibee/atoms points outside this tree: ${atoms:-nowhere}"; fail=1 ;;
esac
exit "$fail"
