#!/bin/bash
# tri vision-bench [--sizes 448,768] [--fonts 72,44,26] [--image URL --expect "11:30,500"]
#
# Can the render's own vision read the text on a picture, and how fast? Ships
# vision-bench.mjs into the vibee-render container (base64 in the ssh
# argument -- nothing is written to Railway) and runs it there, where
# VISION_* live; no variable value ever reaches this Mac's screen.
#
# Default: synthetic posters (four lines, three font sizes) at a 448 px
# height. --image reads a REAL picture instead and scores --expect against
# what vision quoted. Column "slot" is the vision host's single llama.cpp
# slot just before the read: busy = the media sweep or a chat turn held it.
#
# rc 0 = every read found every expected string, 1 = a miss or a failed
# call, 2 = could not measure (bad args, Railway silent, picture unreachable).
set -u
. "$(dirname "${BASH_SOURCE[0]}")/rail.sh"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

SIZES=448 FONTS=72,44,26 IMAGE='' EXPECT=''
while [ $# -gt 0 ]; do
  case "$1" in
    --sizes) SIZES="${2:-}"; shift 2 ;;
    --fonts) FONTS="${2:-}"; shift 2 ;;
    --image) IMAGE="${2:-}"; shift 2 ;;
    --expect) EXPECT="${2:-}"; shift 2 ;;
    -h | --help) sed -n '2,15p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "  ??    unknown argument: $1 (tri vision-bench --help)"; exit 2 ;;
  esac
done
case "$SIZES" in '' | *[!0-9,]*) echo "  ??    --sizes takes numbers like 448,768"; exit 2 ;; esac
case "$FONTS" in '' | *[!0-9,]*) echo "  ??    --fonts takes numbers like 72,44,26"; exit 2 ;; esac
if [ -n "$IMAGE" ] && [ -z "$EXPECT" ]; then
  echo "  ??    --image needs --expect \"11:30,500\": a reading scored against nothing proves nothing"
  exit 2
fi

# Arguments travel as JSON inside the script, so a URL with & or quotes
# cannot break the remote shell line.
cfg=$(VB_SIZES="$SIZES" VB_FONTS="$FONTS" VB_IMAGE="$IMAGE" VB_EXPECT="$EXPECT" python3 -c '
import json, os
print(json.dumps({k: os.environ[k] for k in ("VB_SIZES", "VB_FONTS", "VB_IMAGE", "VB_EXPECT")}))')
script=$({ printf 'Object.assign(process.env, %s)\n' "$cfg"; cat "$HERE/vision-bench.mjs"; } | base64 | tr -d '\n')

out=$(railway ssh -p "$RAIL_PROJECT" -e "$RAIL_ENV" -s vibee-render -- \
  "echo $script | base64 -d > /tmp/tri-vision-bench.mjs && node /tmp/tri-vision-bench.mjs" 2>&1 |
  tr -d '\r')
# Keep only the bench's own lines: the CLI adds its key and deprecation
# notices, and a node crash prints a stack that the rc check below reports.
rcline=$(printf '%s\n' "$out" | grep -E '^rc [0-9]$' | tail -1)
if [ -z "$rcline" ]; then
  echo "  ??    vibee-render did not run the bench (railway ssh silent or node failed) -- NOT measured"
  exit 2
fi
printf '%s\n' "$out" | grep -E "$(printf '\t')|^could not" | column -t -s "$(printf '\t')"
rc=${rcline#rc }
case "$rc" in
  0) echo "  ok    every read found every expected string" ;;
  1) echo "  FAIL  a read missed an expected string or the call failed (see rows)" ;;
  *) echo "  ??    could not measure" ;;
esac
exit "$rc"
