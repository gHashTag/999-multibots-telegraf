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
#
#   tri remote-check mutants -- render/src/spec/x.mutants.json [...]
#   tri remote-check spec -- render/src/spec/x.t27 [...]
# The experiments, run there too (deployment/check-runner/suites.mjs). Names
# are paths from the repository root, each run alone: a mutant list with
# `tri mutants` (reverted by git in the runner's own tree), a spec with
# `t27c test-report` and then its <id>.controls.json. Exit 0 all killed /
# all pass, 1 a survivor / a FAIL row / a missed control, 2 unmeasured (no
# t27c, no zig, no table, no test to run) -- never green.
#
#   tri remote-check [--repo DIR] website -- check:queen-castle [typecheck:ratchet ...]
# gHashTag/trinity's site checks, run there too (owner, 2026-10-04: "run all
# experiments on Railway, the computer here is choking" -- load average 800).
# The code is the trinity checkout named by --repo, else the one this is run
# from. The names after -- are apps/website npm scripts, check:* and
# typecheck:* only; the runner refuses any other. All of trinity packs to
# 262 MB, over the runner's 64 MB, so only what the checks read is sent --
# 26.5 MB measured 2026-10-04 at trinity 3cf399fc (apps/website alone 18.7):
#   apps/website       the site and its checks
#   apps/queen-proxy   check:queen-chat-gate imports it
#   .github/workflows  check:discovery and check:crons-catalog read them
#   src/**/*.zig       check:api and check:tools-coverage read tri's source
set -uo pipefail
. "$(dirname "${BASH_SOURCE[0]}")/rail.sh"  # rvars: Railway by explicit ids
ROOT="$1"; shift
SUITES=(); FILES=(); SRC=""
while [ $# -gt 0 ]; do
  case "$1" in
    --) shift; FILES=("$@"); break ;;
    --repo) [ $# -ge 2 ] || { echo "remote-check: --repo needs a directory"; exit 2; }
            SRC="$2"; shift 2 ;;
    *) SUITES+=("$1"); shift ;;
  esac
done
[ ${#SUITES[@]} -eq 0 ] && SUITES=(render)
WEBSITE=""; case " ${SUITES[*]} " in *" website "*) WEBSITE=1 ;; esac
if [ -n "$WEBSITE" ]; then
  SRC="${SRC:-$(git rev-parse --show-toplevel 2>/dev/null)}"
  [ -f "$SRC/apps/website/package.json" ] || {
    echo "remote-check: website checks a gHashTag/trinity checkout: run it from one, or give --repo DIR"; exit 2; }
fi
SRC="${SRC:-$ROOT}"
MAIN=$(git -C "$ROOT" worktree list --porcelain | awk 'NR==1{print $2}')
VARS=$(rvars check-runner )
KEY=$(printf '%s\n' "$VARS" | grep -E '^CHECK_RUNNER_KEY=' | cut -d= -f2-)
URL="${CHECK_RUNNER_URL:-https://$(printf '%s\n' "$VARS" | grep -E '^RAILWAY_PUBLIC_DOMAIN=' | cut -d= -f2-)}"
[ -z "$KEY" ] || [ "$URL" = "https://" ] && { echo "remote-check: no runner key or address (railway login?)"; exit 2; }
REF=$(git -C "$SRC" stash create 2>/dev/null); REF=${REF:-HEAD}
SUITE_Q=$(IFS=,; echo "${SUITES[*]}"); FILE_Q=$(IFS=,; echo "${FILES[*]:-}")
echo "  -> $URL  suites=$SUITE_Q  ref=${REF:0:9}${FILE_Q:+  files=$FILE_Q}"
TMP=$(mktemp); LIST=$(mktemp -d); trap 'rm -rf "$TMP" "$LIST"' EXIT
if [ -n "$WEBSITE" ]; then
  # trinity: what its website checks read, listed above. No gate list.
  OPTS=(); PATHS=(apps/website apps/queen-proxy .github/workflows ':(glob)src/**/*.zig')
else
  # The pre-push gate needs the push's files, and only this side has git.
  ( cd "$ROOT" && node scripts/test-guard.cjs --print-files 2>/dev/null ) > "$LIST/.check-files" || : > "$LIST/.check-files"
  # The whole repository -- tests read deploy manifests, nginx, Swift, docs --
  # minus the ballast no test opens: the avatar lab, backups, vaults, video.
  OPTS=(--add-file="$LIST/.check-files"); PATHS=(.
    ':(exclude)avatar_brain' ':(exclude)data/backups' ':(exclude)vaults'
    ':(exclude)*.mp4' ':(exclude)*.webm' ':(exclude)*.mov')
fi
# ${OPTS[@]+...}: bash 3.2 (macOS) calls an empty array unbound under set -u.
git -C "$SRC" archive --format=tar.gz ${OPTS[@]+"${OPTS[@]}"} "$REF" -- "${PATHS[@]}" \
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
# A mutants or spec name that could not be measured (2) is neither a pass
# nor a failure: the whole run then says 2. Any other non-zero -- a 2 from
# tsc or vitest included -- is a failure.
EXP = ("mutants:", "spec:")
unmeasured = [k for k, v in r.items() if v == 2 and k.startswith(EXP)]
failed = [k for k, v in r.items() if v != 0 and k not in unmeasured]
label = lambda k, v: "ok" if v == 0 else "UNMEASURED" if k in unmeasured else f"FAIL({v})"
print("  == " + "  ".join(f"{k}:{label(k, v)}" for k, v in r.items()))
sys.exit(1 if failed else 2 if unmeasured else 0)
PY
