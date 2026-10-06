#!/bin/bash
# Railway by explicit UUIDs -- the one home of project 999's ids for tri.
#
# Sourced, never run. A bare `railway service X` RELINKS the directory, and a
# bare `railway variables` reads (or, in `tri secret`, WRITES) whatever project
# the directory happens to be linked to: variables have gone to the wrong
# project that way (memory railway-link-flapping). Until 2026-10-03 the ids
# were hand-copied into three helpers and missing from about forty other calls.
# `tri rail` lists any call that bypasses this file.
RAIL_PROJECT=564d9ebd-7aa8-44fe-93ec-e0b03c87158d   # project 999
RAIL_ENV=e4d200ad-b8a9-4edf-9b25-190a32613b32       # production

# rvars SERVICE -> the service's variables as KEY=VALUE lines. Never printed by
# a caller: each one greps the line it needs.
#
# An empty answer is retried (3 tries, RVARS_PAUSE s apart, 3 by default): the
# DNS proxy on this Mac blinks, and on 2026-10-03 `tri blog-share` said "no
# DATABASE_PUBLIC_URL" while the variable was there and Railway simply did not
# answer. When every try is empty, stderr says so, so a caller's "variable
# missing" can be read as "Railway silent" instead. rc 1 then.
#
# "Unauthorized" is not a blink and is not retried: it is the CLI on PATH not
# being logged in. On 2026-10-03 launchd's PATH found an old railway 4.5.4 at
# /usr/local/bin that cannot read the newer CLI's login, and the hourly
# relays watch called that "a network blink" three times an hour.
rvars() {
  local svc="${1:?service required}" out err try
  err=$(mktemp)
  for try in 1 2 3; do
    out=$(railway variables --kv --project "$RAIL_PROJECT" \
      --environment "$RAIL_ENV" --service "$svc" 2>"$err")
    [ -n "$out" ] && { rm -f "$err"; printf '%s\n' "$out"; return 0; }
    if grep -qi unauthorized "$err"; then
      rm -f "$err"
      echo "rvars: $(command -v railway) is not logged in ($(railway --version 2>/dev/null)) -- a different CLI on PATH, not a network blink" >&2
      return 1
    fi
    [ "$try" -lt 3 ] && sleep "${RVARS_PAUSE:-3}"
  done
  rm -f "$err"
  echo "rvars: railway did not answer for $svc (3 tries) -- a network blink, not a missing variable" >&2
  return 1
}

# rlogs SERVICE [railway logs args...] -> that service's logs, no relink.
rlogs() {
  local svc="${1:?service required}"
  shift
  railway logs --project "$RAIL_PROJECT" --environment "$RAIL_ENV" --service "$svc" "$@"
}

# rdeploy_ids SERVICE HOURS -> ids of every deploy that ran inside the last
# HOURS, space-separated. `railway logs` without an id reads only the current
# deployment: the first `tri relays` said "no failures in 24 h" eight hours
# after 401s that lived in the deploy before. Empty output = Railway silent.
rdeploy_ids() {
  local svc="${1:?service required}" hours="${2:-24}"
  railway deployment list --json --project "$RAIL_PROJECT" \
    --environment "$RAIL_ENV" --service "$svc" 2>/dev/null |
    HOURS="$hours" python3 -c 'import json,os,sys,datetime as d
cut = d.datetime.now(d.timezone.utc) - d.timedelta(hours=int(os.environ["HOURS"]))
rows = [x for x in json.load(sys.stdin) if x.get("status") in ("SUCCESS","REMOVED","CRASHED")]
# A deploy that ran inside the window: created after the cut, or the last one before it.
before = [x for x in rows if d.datetime.fromisoformat(x["createdAt"].replace("Z","+00:00")) < cut]
keep = [x for x in rows if x not in before] + before[:1]
print(" ".join(x["id"] for x in keep))' 2>/dev/null
}
