#!/bin/bash
# DID THIS PR (OR COMMIT) REACH PRODUCTION?
#
# Written by hand about ten times on 2026-09-22 as a wait loop, and once it
# waited for nothing: the commit was looked up by a message that did not
# quite match, came back empty, and the loop ran its full ten minutes. Here
# the commit comes from the PR itself (gh), never from a message.
#
#   tri deployed <PR number | sha> [service ...]   default: vibee-render
#                                                   vibee-editor 999-multibots-telegraf
# Waits (up to DEPLOYED_WAIT_S, default 600) until each service has a
# deployment naming that commit, and prints its status. SKIPPED means
# Railway saw it and nothing that service watches changed -- shipped as far
# as that service is concerned. Exit 0 all SUCCESS/SKIPPED, 1 a FAILED or
# CRASHED, 2 could not tell (unknown PR, not merged, no answer in time).
set -uo pipefail
ROOT="$1"; shift
REF="${1:?usage: tri deployed <PR number | sha> [service ...]}"; shift
SERVICES=("$@"); [ ${#SERVICES[@]} -eq 0 ] && SERVICES=(vibee-render vibee-editor 999-multibots-telegraf)
WAIT="${DEPLOYED_WAIT_S:-600}"
if [[ "$REF" =~ ^[0-9]+$ ]]; then
  SHA=$(cd "$ROOT" && gh pr view "$REF" --json mergeCommit,state -q 'select(.state=="MERGED") | .mergeCommit.oid' 2>/dev/null)
  [ -z "$SHA" ] && { echo "deployed: PR #$REF is not merged (or unknown) -- nothing to wait for"; exit 2; }
else
  SHA=$(git -C "$ROOT" rev-parse "$REF" 2>/dev/null) || { echo "deployed: unknown commit $REF"; exit 2; }
fi
MAIN=$(git -C "$ROOT" worktree list --porcelain | awk 'NR==1{print $2}')
echo "  commit ${SHA:0:9}"
worst=0
for svc in "${SERVICES[@]}"; do
  end=$(( $(date +%s) + WAIT )); st=none
  while :; do
    st=$( (cd "${MAIN:-$ROOT}" && railway deployment list --service "$svc" --json 2>/dev/null) \
      | SHA="$SHA" python3 -c 'import json,os,sys
try: d=json.load(sys.stdin)
except Exception: print("noanswer"); sys.exit()
x=next((x for x in d if (x.get("meta") or {}).get("commitHash","")==os.environ["SHA"]),None)
print(x["status"] if x else "none")')
    case "$st" in SUCCESS|SKIPPED|FAILED|CRASHED|REMOVED) break;; esac
    [ "$(date +%s)" -ge "$end" ] && break
    sleep 15
  done
  printf '  %-24s %s\n' "$svc" "$st"
  case "$st" in SUCCESS|SKIPPED|REMOVED) ;; FAILED|CRASHED) worst=1;; *) [ $worst = 0 ] && worst=2;; esac
done
exit $worst
