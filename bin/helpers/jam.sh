#!/bin/bash
# tri jam [--json] [--summary] [--threshold MIN] [--fresh MIN] [--limit N]
# The Queen's review-jam detector: every open PR, one state, one next move.
# Read-only (gh reads only). rc 0 no jam, 1 jam, 2 unmeasured.
# The logic and its reasons are in jam.py next to this file.
ROOT="${1:?usage: jam.sh ROOT [args]}"
shift
cd "$ROOT" || exit 2
command -v python3 >/dev/null 2>&1 || { echo "jam: UNMEASURED -- no python3"; exit 2; }
exec python3 "$ROOT/bin/helpers/jam.py" "$@"
