#!/bin/bash
# tri runner -- is the cloud check-runner running the code main has for it?
#
# 2026-10-03: every render-types hook was sent to the cloud, answered
# "unknown suite: render-types", and ran locally anyway. The case had been on
# main since 09-27 (f81287871); the service was last deployed 09-22. Nothing
# redeploys it: it is uploaded with `railway up`, not linked to the repo, so a
# change to deployment/check-runner sits on main until somebody notices.
#
#   tri runner           # health, last deploy vs last change on main (1 = stale, 2 = cannot tell)
#   tri runner deploy    # upload deployment/check-runner as it is on origin/main
#   tri runner deploy --wait   # ...and wait for the NEW deploy to be SUCCESS + /health ok (exit 1 if not)
set -u
. "$(dirname "${BASH_SOURCE[0]}")/fetch.sh"  # tfetch: a failed fetch says so
ROOT="${1:?repo root required}"
shift
cd "$ROOT" || exit 2
# Explicit IDs on every call: a bare `railway` follows whatever is linked
# (railway-link-flapping).
. "$(dirname "${BASH_SOURCE[0]}")/rail.sh"
P=$RAIL_PROJECT
E=$RAIL_ENV
S=1c27f8e4-ecc8-48fe-a6cd-556e5b50365a
URL=https://check-runner-production.up.railway.app

if [ "${1:-}" = "deploy" ]; then
  tfetch origin || { echo "cannot fetch origin -- not deployed"; exit 2; }
  # `railway up` uploads the directory as it lies on disk, so an untracked
  # file counts as much as a changed one (bee review of #3415).
  if ! git diff --quiet origin/main -- deployment/check-runner/ ||
    [ -n "$(git status --porcelain --untracked-files=all -- deployment/check-runner/)" ]; then
    echo "deployment/check-runner here differs from origin/main (changed or untracked files) -- refusing to upload a tree main does not have"
    exit 1
  fi
  # Newest deployment id BEFORE the upload: the wait below must see a NEW one,
  # or it would report the old deploy's SUCCESS as this one's.
  newest() {
    railway deployment list --project "$P" --environment "$E" --service "$S" 2>/dev/null |
      grep -m1 -E 'SUCCESS|FAILED|CRASHED|REMOVED|BUILDING|DEPLOYING|INITIALIZING|QUEUED|WAITING' |
      sed 's/^[^A-Za-z0-9]*//'
  }
  before=$(newest | awk '{print $1}')
  out=$(railway up deployment/check-runner --path-as-root --detach \
    --project "$P" --environment "$E" --service "$S" 2>&1)
  rc=$?
  echo "$out" | grep -v -i 'config as code\|migrate\|keep working'
  if [ $rc -ne 0 ]; then
    echo "upload FAILED (railway exit $rc) -- nothing was deployed"
    exit 1
  fi
  if [ "${2:-}" != "--wait" ]; then
    echo "uploaded; check again in ~2 min: tri runner   (or: tri runner deploy --wait)"
    exit 0
  fi
  # --wait: a NEW deployment reaches SUCCESS and /health answers ok, or say why not.
  limit=${TRI_RUNNER_WAIT:-600}
  t0=$(date +%s)
  while :; do
    line=$(newest)
    id=$(echo "$line" | awk '{print $1}')
    if [ -n "$id" ] && [ "$id" != "$before" ]; then
      case "$line" in
        *SUCCESS*)
          health=$(curl -s -m 10 "$URL/health" || true)
          if echo "$health" | grep -q '"ok"[[:space:]]*:[[:space:]]*true'; then
            echo "deployed and healthy: $id  $health"; exit 0
          fi
          echo "deploy $id is SUCCESS but /health says: ${health:-no answer}" ;;
        *FAILED*|*CRASHED*|*REMOVED*)
          echo "deploy $id ended badly: $line  -> railway logs --deployment $id"; exit 1 ;;
      esac
    fi
    [ $(( $(date +%s) - t0 )) -ge "$limit" ] && { echo "still not healthy after ${limit}s (newest: ${line:-none}) -- tri runner"; exit 1; }
    sleep 10
  done
fi

health=$(curl -s -m 10 "$URL/health" || true)
echo "health: ${health:-no answer}"
line=$(railway deployment list --project "$P" --environment "$E" --service "$S" 2>/dev/null | grep -m1 SUCCESS)
[ -n "$line" ] || { echo "no SUCCESS deploy listed -- cannot tell"; exit 2; }
deployed=$(echo "$line" | awk -F'|' '{gsub(/^ +| +$/,"",$3); print $3}')
tfetch origin
changed=$(git log -1 --format='%cI %h %s' origin/main -- deployment/check-runner/)
echo "deployed:        $deployed"
echo "changed on main: $changed"
dep_s=$(python3 -c "import sys,datetime;print(int(datetime.datetime.strptime(sys.argv[1],'%Y-%m-%d %H:%M:%S %z').timestamp()))" "$deployed" 2>/dev/null)
chg_s=$(git log -1 --format=%ct origin/main -- deployment/check-runner/)
[ -n "$dep_s" ] && [ -n "$chg_s" ] || { echo "cannot compare dates -- cannot tell"; exit 2; }
if [ "$chg_s" -gt "$dep_s" ]; then
  echo "STALE: main changed the runner after its last deploy -> tri runner deploy"
  exit 1
fi
echo "current"
