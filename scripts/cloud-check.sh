#!/bin/bash
# A HOOK'S HEAVY CHECK, RUN IN THE CLOUD FIRST.
#
#   scripts/cloud-check.sh <suite ...> -- <the same check, run locally>
#
# Owner, 2026-09-22: "everything in the cloud, on Railway". The Mac swapped
# to 9 of 10 GB with several sessions each running tsc and vitest in their
# hooks. The suite runs on the check-runner service (tri remote-check); only
# when the runner cannot be reached (exit 2) does the local command run, so a
# network blip never blocks work -- and never lets a failure through either:
# a runner that answered "failed" fails the hook.
#
# CHECKS_LOCAL=1 skips the cloud entirely.
#
# A QUEUE IS NOT A REASON TO WAIT FOREVER (2026-09-24). The runner takes one
# job at a time, and a night of small commits turned every hook into a
# fifteen-minute wait behind its own earlier jobs -- slower than the Mac it
# was meant to spare. So the cloud gets CHECK_CLOUD_WAIT seconds (four
# minutes by default, enough for a job that starts at once); past that the
# same check runs locally and the hook keeps its meaning. Nothing is skipped:
# a cloud run that ANSWERED "failed" still fails the hook.
set -uo pipefail
SUITES=()
while [ $# -gt 0 ] && [ "$1" != "--" ]; do SUITES+=("$1"); shift; done
[ "${1:-}" = "--" ] && shift
WAIT="${CHECK_CLOUD_WAIT:-240}"
if [ "${CHECKS_LOCAL:-}" != "1" ]; then
  # `timeout` is not on every Mac; a watchdog in the shell is.
  # The cloud's own output is held until we know whether it finished: a run
  # we killed for being slow must not leave half a report on the screen.
  said=$(mktemp)
  bash bin/helpers/remote-check.sh "$PWD" "${SUITES[@]}" >"$said" 2>&1 &
  cloud=$!
  # THE WATCHDOG MUST NOT HOLD THE HOOK'S PIPE (2026-10-03). Its `sleep`
  # inherited our stdout, and killing the subshell left the sleep alive: lefthook
  # reads to EOF, so every hook waited the full $WAIT even when the cloud had
  # answered in a second -- render-types and root-types both "took" 240.0 s.
  # Measured with a runner that answers at once: 15 of 15 s through a pipe,
  # 0 s without one. The watchdog now writes nowhere, and its sleep is
  # killed with it.
  ( sleep "$WAIT" & s=$!; trap 'kill "$s" 2>/dev/null; exit 0' TERM; wait "$s"; kill -TERM "$cloud" 2>/dev/null ) >/dev/null 2>&1 &
  watchdog=$!
  wait "$cloud"
  code=$?
  kill -TERM "$watchdog" 2>/dev/null
  wait "$watchdog" 2>/dev/null
  # 143 is the watchdog's own SIGTERM: the cloud was too slow, not wrong.
  if [ $code -eq 143 ]; then
    rm -f "$said"
    echo "[cloud-check] the runner is busy (> ${WAIT}s) -- running locally: $*"
  elif [ $code -ne 2 ]; then
    cat "$said"
    rm -f "$said"
    exit $code
  else
    cat "$said"
    rm -f "$said"
    echo "[cloud-check] runner unreachable -- running locally: $*"
  fi
fi
exec "$@"
