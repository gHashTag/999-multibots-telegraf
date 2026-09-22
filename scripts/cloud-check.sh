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
set -uo pipefail
SUITES=()
while [ $# -gt 0 ] && [ "$1" != "--" ]; do SUITES+=("$1"); shift; done
[ "${1:-}" = "--" ] && shift
if [ "${CHECKS_LOCAL:-}" != "1" ]; then
  bash bin/helpers/remote-check.sh "$PWD" "${SUITES[@]}"
  code=$?
  [ $code -ne 2 ] && exit $code
  echo "[cloud-check] runner unreachable -- running locally: $*"
fi
exec "$@"
