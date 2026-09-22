#!/bin/bash
# RUN THE CHECKS IN THE CLOUD, NOT ON THIS MAC.
#
# Owner, 2026-09-22: "everything in the cloud, on Railway". The Mac (8 GB)
# swapped to 9 of 10 GB with three sessions each running tsc and vitest,
# and tests timed out. The check-runner service (deployment/check-runner)
# does the work; this sends it the code and prints what it says.
#
#   tri remote-check [render|player|root|guard|boots|types ...] [-- file.test.ts ...]
# Default suite: render. The code is the working tree AS IT IS -- committed
# or not (git stash create), without the avatar lab, backups, vaults and
# video (no test opens them), about 22 MB. Files are given relative to the suite's own package.
# Exit 0 every suite passed, 1 one failed, 2 could not reach the runner.
set -uo pipefail
ROOT="$1"; shift
SUITES=(); FILES=()
while [ $# -gt 0 ]; do
  case "$1" in
    --) shift; FILES=("$@"); break ;;
    *) SUITES+=("$1"); shift ;;
  esac
done
[ ${#SUITES[@]} -eq 0 ] && SUITES=(render)
MAIN=$(git -C "$ROOT" worktree list --porcelain | awk 'NR==1{print $2}')
VARS=$( (cd "${MAIN:-$ROOT}" && railway variables --service check-runner --kv 2>/dev/null) )
KEY=$(printf '%s\n' "$VARS" | grep -E '^CHECK_RUNNER_KEY=' | cut -d= -f2-)
URL="${CHECK_RUNNER_URL:-https://$(printf '%s\n' "$VARS" | grep -E '^RAILWAY_PUBLIC_DOMAIN=' | cut -d= -f2-)}"
[ -z "$KEY" ] || [ "$URL" = "https://" ] && { echo "remote-check: no runner key or address (railway login?)"; exit 2; }
REF=$(git -C "$ROOT" stash create 2>/dev/null); REF=${REF:-HEAD}
SUITE_Q=$(IFS=,; echo "${SUITES[*]}"); FILE_Q=$(IFS=,; echo "${FILES[*]:-}")
echo "  -> $URL  suites=$SUITE_Q  ref=${REF:0:9}${FILE_Q:+  files=$FILE_Q}"
TMP=$(mktemp); LIST=$(mktemp -d); trap 'rm -rf "$TMP" "$LIST"' EXIT
# The pre-push gate needs the push's files, and only this side has git.
( cd "$ROOT" && node scripts/test-guard.cjs --print-files 2>/dev/null ) > "$LIST/.check-files" || : > "$LIST/.check-files"

# The whole repository -- tests read deploy manifests, nginx, Swift, docs --
# minus the ballast no test opens: the avatar lab, backups, vaults, video.
git -C "$ROOT" archive --format=tar.gz --add-file="$LIST/.check-files" "$REF" -- . \
  ':(exclude)avatar_brain' ':(exclude)data/backups' ':(exclude)vaults' \
  ':(exclude)*.mp4' ':(exclude)*.webm' ':(exclude)*.mov' \
  | curl -sN --fail-with-body -X POST --data-binary @- \
      -H "X-Check-Key: $KEY" -H 'Content-Type: application/gzip' \
      "$URL/run?suites=$SUITE_Q&files=$FILE_Q" | tee "$TMP" | grep -v '^:: still working$'
RESULT=$(grep '^::result ' "$TMP" | tail -1 | cut -d' ' -f2-)
[ -z "$RESULT" ] && { echo "remote-check: the runner gave no result"; exit 2; }
RESULT="$RESULT" python3 - <<'PY'
import json, os, sys
r = json.loads(os.environ["RESULT"])
if not r or "error" in r:
    print("  == " + str(r)); sys.exit(1)
print("  == " + "  ".join(f"{k}:{'ok' if v == 0 else f'FAIL({v})'}" for k, v in r.items()))
sys.exit(0 if all(v == 0 for v in r.values()) else 1)
PY
