#!/bin/bash
# tri holders [branch] -- who already holds a branch, one row per worktree.
#
# WHY. 2026-10-06 three agents wrote to PR #3730's branch at once, each from
# its own worktree under $TMPDIR, and one of those trees had the whole repo
# staged as deleted. Run this BEFORE dispatching an author to a branch.
#
# Row: branch (or "detached @sha"), path, uncommitted file count, ALARM when
# more than TRI_HOLDERS_ALARM (default 200) files are staged as deleted (the
# "whole repo staged deleted" index flip), and the age of the newest change
# (mtime of the `git status` entries, else the index mtime).
#
# With a branch: only worktrees on it, plus detached worktrees whose HEAD is
# the tip of <branch> or origin/<branch>.
#
# rc 0 = at most one holder and no ALARM; 1 = more than one holder, or an
# ALARM row; 2 = git error. Read-only: `git --no-optional-locks status`
# never refreshes or locks any index.
set -u

usage() {
  cat <<'EOF'
usage: tri holders [branch]
  one row per worktree: branch | path | uncommitted files | ALARM | newest change
  ALARM = more than 200 files staged as deleted (TRI_HOLDERS_ALARM overrides)
  with a branch: worktrees on it, plus detached worktrees at its tip
  rc 0 = at most one holder and no ALARM, 1 = several holders or an ALARM, 2 = git error
EOF
}

case "${1:-}" in -h | --help) usage; exit 0 ;; esac

BR=${1:-}
BR=${BR#refs/heads/}
REPO=${TRI_HOLDERS_REPO:-.}
LIMIT=${TRI_HOLDERS_ALARM:-200}
NOW=$(date +%s)

LIST=$(git -C "$REPO" worktree list --porcelain 2>&1) || {
  echo "holders: git worktree list failed: $LIST"
  exit 2
}

TIPS=""
if [ -n "$BR" ]; then
  TIPS="$(git -C "$REPO" rev-parse -q --verify "refs/heads/$BR^{commit}" 2>/dev/null)
$(git -C "$REPO" rev-parse -q --verify "refs/remotes/origin/$BR^{commit}" 2>/dev/null)"
fi

if stat -f %m / >/dev/null 2>&1; then STAT=(stat -f %m); else STAT=(stat -c %Y); fi

age() { # seconds -> 42s / 7m / 3h / 2d
  local s=$1
  if [ "$s" -lt 60 ]; then echo "${s}s"
  elif [ "$s" -lt 3600 ]; then echo "$((s / 60))m"
  elif [ "$s" -lt 86400 ]; then echo "$((s / 3600))h"
  else echo "$((s / 86400))d"; fi
}

ROWS=0 HOLD=0 ALARMS=0 GITERR=0
declare -a SEEN=()

row() { # path head branch(or empty)
  local p=$1 head=$2 br=$3 label n=0 del=0 alarm="" newest=0 when="-" e x idx m
  if [ -n "$br" ]; then label=$br; else label="detached @${head:0:9}"; fi
  if [ -n "$BR" ]; then
    if [ -n "$br" ]; then
      [ "$br" = "$BR" ] || return 0
    else
      printf '%s\n' "$TIPS" | grep -qx "$head" || return 0
    fi
  fi
  ROWS=$((ROWS + 1))
  [ -n "$br" ] && SEEN+=("$br")
  if [ ! -d "$p" ]; then
    printf '%-34s %-60s %8s  %-6s %s\n' "$label" "$p" "-" "" "missing"
    return 0
  fi
  local tmp
  tmp=$(mktemp) || return 0
  if ! git -C "$p" --no-optional-locks status --porcelain=v1 -z --no-renames >"$tmp" 2>/dev/null; then
    printf '%-34s %-60s %8s  %-6s %s\n' "$label" "$p" "?" "" "git status failed"
    GITERR=1
    rm -f "$tmp"
    return 0
  fi
  local files=()
  while IFS= read -r -d '' e; do
    n=$((n + 1))
    x=${e:0:1}
    [ "$x" = D ] && del=$((del + 1))
    [ ${#files[@]} -lt 2000 ] && [ -e "$p/${e:3}" ] && files+=("$p/${e:3}")
  done <"$tmp"
  rm -f "$tmp"
  if [ "$del" -gt "$LIMIT" ]; then
    alarm=ALARM
    ALARMS=$((ALARMS + 1))
  fi
  if [ ${#files[@]} -gt 0 ]; then
    newest=$(printf '%s\0' "${files[@]}" | xargs -0 "${STAT[@]}" 2>/dev/null | sort -n | tail -1)
  fi
  if [ -z "$newest" ] || [ "$newest" = 0 ]; then
    idx=$(git -C "$p" rev-parse --path-format=absolute --git-path index 2>/dev/null)
    [ -n "$idx" ] && [ -e "$idx" ] && newest=$("${STAT[@]}" "$idx" 2>/dev/null)
  fi
  if [ -n "$newest" ] && [ "$newest" != 0 ]; then
    m=$((NOW - newest))
    [ "$m" -lt 0 ] && m=0
    when="$(age "$m") ago"
  fi
  [ "$del" -gt 0 ] && alarm="${alarm:+$alarm }(${del} del)"
  printf '%-34s %-60s %8s  %-6s %s\n' "$label" "$p" "$n" "$alarm" "$when"
}

printf '%-34s %-60s %8s  %-6s %s\n' BRANCH PATH DIRTY ALARM NEWEST
P="" H="" B="" BARE=0
while IFS= read -r line || [ -n "$P" ]; do
  case "$line" in
    "worktree "*) P=${line#worktree } ;;
    "HEAD "*) H=${line#HEAD } ;;
    "branch "*) B=${line#branch refs/heads/} ;;
    bare) BARE=1 ;;
    "")
      [ -n "$P" ] && [ "$BARE" = 0 ] && row "$P" "$H" "$B"
      P="" H="" B="" BARE=0
      ;;
  esac
done <<<"$LIST
"

if [ -n "$BR" ]; then
  HOLD=$ROWS
  echo "holders of $BR: $HOLD, alarms: $ALARMS"
  [ "$GITERR" = 1 ] && exit 2
  { [ "$HOLD" -gt 1 ] || [ "$ALARMS" -gt 0 ]; } && exit 1
  exit 0
fi

DUP=""
if [ ${#SEEN[@]} -gt 0 ]; then
  DUP=$(printf '%s\n' "${SEEN[@]}" | sort | uniq -d | tr '\n' ' ')
fi
echo "worktrees: $ROWS, alarms: $ALARMS${DUP:+, branches held twice: $DUP}"
[ "$GITERR" = 1 ] && exit 2
{ [ -n "$DUP" ] || [ "$ALARMS" -gt 0 ]; } && exit 1
exit 0
