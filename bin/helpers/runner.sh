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
  out=$(railway up deployment/check-runner --path-as-root --detach \
    --project "$P" --environment "$E" --service "$S" 2>&1)
  rc=$?
  echo "$out" | grep -v -i 'config as code\|migrate\|keep working'
  if [ $rc -ne 0 ]; then
    echo "upload FAILED (railway exit $rc) -- nothing was deployed"
    exit 1
  fi
  echo "uploaded; check again in ~2 min: tri runner"
  exit 0
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
