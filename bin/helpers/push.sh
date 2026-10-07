#!/bin/bash
# tri push [branch] -- push through the pre-push gate and PROVE the ref landed.
#
# 2026-10-03 night: the gate ran 6-13 minutes with the ssh connection idle,
# GitHub dropped it, and git exited 141 / "Connection reset by peer" AFTER every
# check was green -- twice in a row, and a pipe in front of the push made the
# exit code vanish. This does the four things that were done by hand:
#   1. `tri online --wait 300` first, exit code read WITHOUT a pipe;
#   2. the push with ssh keepalive added to the ssh command already chosen
#      (GIT_SSH_COMMAND, then core.sshCommand, then plain ssh);
#   3. `git ls-remote` compared with HEAD -- the only proof (rc lies both ways);
#   4. ONE retry when the ref is still missing (TRI_PUSH_TRIES, default 2).
# Never forces: --force / -f / --force-with-lease are refused (project rule).
set -u
ROOT="${1:?repo root required}"; shift
cd "$ROOT" || exit 1

ONLINE="${TRI_PUSH_ONLINE:-node $ROOT/bin/helpers/online.mjs --wait 300}"
TRIES="${TRI_PUSH_TRIES:-2}"

branch=""
extra=()
for a in "$@"; do
  case "$a" in
    -f|--force|--force-with-lease*|--force-if-includes) echo "tri push: never force-push (project rule)" >&2; exit 2 ;;
    -*) extra+=("$a") ;;
    *) [ -z "$branch" ] && branch="$a" || extra+=("$a") ;;
  esac
done
[ -n "$branch" ] || branch=$(git symbolic-ref --short -q HEAD) || { echo "tri push: detached HEAD, name a branch" >&2; exit 2; }
case "$branch" in main|master) echo "tri push: not to $branch -- use a branch and a PR" >&2; exit 2 ;; esac

head_sha=$(git rev-parse "$branch") || { echo "tri push: no such branch $branch" >&2; exit 2; }

base="${GIT_SSH_COMMAND:-}"
[ -n "$base" ] || base=$(git config --get core.sshCommand 2>/dev/null || true)
[ -n "$base" ] || base=ssh
KEEPALIVE_SSH="$base -o ServerAliveInterval=20 -o ServerAliveCountMax=30 -o TCPKeepAlive=yes"

remote_sha() { git ls-remote origin "refs/heads/$branch" 2>/dev/null | cut -f1; }

attempt=1
while [ "$attempt" -le "$TRIES" ]; do
  out=$(mktemp)
  $ONLINE >"$out" 2>&1; rc=$?
  if [ $rc -ne 0 ]; then
    cat "$out"; rm -f "$out"
    echo "tri push: GitHub not reachable (rc $rc) -- not pushing" >&2
    exit $rc
  fi
  rm -f "$out"
  log=$(mktemp)
  GIT_SSH_COMMAND="$KEEPALIVE_SSH" git push -u origin "$branch" ${extra[@]+"${extra[@]}"} >"$log" 2>&1; prc=$?
  tail -25 "$log"; rm -f "$log"
  landed=$(remote_sha)
  if [ "$landed" = "$head_sha" ]; then
    echo "tri push: OK  origin/$branch = ${head_sha:0:9}  (attempt $attempt, push rc $prc)"
    exit 0
  fi
  echo "tri push: push rc $prc and origin/$branch is '${landed:0:9}', not ${head_sha:0:9} (attempt $attempt/$TRIES)" >&2
  attempt=$((attempt + 1))
done
echo "tri push: FAILED -- the ref did not land" >&2
exit 1
