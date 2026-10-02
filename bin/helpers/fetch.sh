#!/bin/bash
# tfetch [git fetch args...] -- `git fetch -q` that says so when it fails.
#
# Sourced, never run. Until 2026-10-03 seven helpers ran
# `git fetch ... 2>/dev/null` and went on: with the network down they judged
# against origin/main as of the last good fetch and never said so -- an error
# toward "all is well", the wrong side to err on (landing.sh alone warned).
# The fetch's own code is returned, so a caller that must stop still can.
# `tri online` tells a network outage (wait) from a refusal (look).
tfetch() {
  local err rc ref at age=unknown
  err=$(git fetch -q "$@" 2>&1)
  rc=$?
  [ "$rc" -eq 0 ] && return 0
  # Not FETCH_HEAD's mtime: a FAILED fetch rewrites that file too, and it then
  # reads "0 min ago" (seen while writing this). The remote ref's reflog moves
  # only when a fetch brought something.
  ref="refs/remotes/${1:-origin}/${2:-main}"
  at=$(git log -g -1 --date=unix --format=%gd "$ref" 2>/dev/null | tr -dc 0-9)
  [ -n "$at" ] && age="${ref#refs/remotes/} last moved $((($(date +%s) - at) / 60)) min ago"
  echo "  ⚠  git fetch $* failed (${err%%$'\n'*}): what follows reads origin as of the last good fetch ($age); \`tri online\` says why" >&2
  return "$rc"
}
