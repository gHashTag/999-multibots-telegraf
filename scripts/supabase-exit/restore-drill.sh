#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd -P)"
VALIDATOR="$SCRIPT_DIR/lib/canonicalize.mjs"

fail() {
  printf '%s\n' "$1" >&2
  exit 1
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || fail 'required local restore tool is unavailable'
}

: "${RESTORE_INPUT:?RESTORE_INPUT is required}"
: "${RESTORE_PGSERVICE:?RESTORE_PGSERVICE is required}"
: "${RESTORE_PGPASSFILE:?RESTORE_PGPASSFILE is required}"
: "${RESTORE_TARGET_KIND:?RESTORE_TARGET_KIND is required}"
: "${RESTORE_TARGET_ACK:?RESTORE_TARGET_ACK is required}"
[[ -z "${PGPASSWORD+x}" ]] || fail 'PGPASSWORD must be unset; use PGPASSFILE only'

[[ "$RESTORE_TARGET_KIND" == 'disposable' ]] || fail 'restore target must be disposable'
[[ "$RESTORE_TARGET_ACK" == 'I_UNDERSTAND_THIS_TARGET_IS_DISPOSABLE' ]] \
  || fail 'RESTORE_TARGET_ACK is invalid'
[[ "$RESTORE_PGSERVICE" =~ ^[A-Za-z0-9._-]+$ ]] || fail 'restore PGSERVICE name is invalid'
[[ "$RESTORE_PGSERVICE" == *restore* ]] || fail 'restore PGSERVICE must identify a restore fixture'
if [[ -n "${SOURCE_PGSERVICE:-}" && "$RESTORE_PGSERVICE" == "$SOURCE_PGSERVICE" ]]; then
  fail 'restore target must differ from the source'
fi

require_command node
require_command gpg
require_command pg_restore
require_command shasum
require_command mktemp

node "$VALIDATOR" --validate-input "$RESTORE_INPUT" "$REPO_ROOT" >/dev/null
node "$VALIDATOR" --validate-input "$RESTORE_INPUT.sha256" "$REPO_ROOT" >/dev/null
node "$VALIDATOR" --validate-pgpass "$RESTORE_PGPASSFILE" "$REPO_ROOT" >/dev/null

INPUT_DIR="$(dirname "$RESTORE_INPUT")"
INPUT_NAME="$(basename "$RESTORE_INPUT")"
if ! EXPECTED_HASH="$(
  node "$VALIDATOR" --checksum-hash "$RESTORE_INPUT.sha256" "$INPUT_NAME"
)"; then
  fail 'encrypted backup checksum sidecar was invalid'
fi

ERROR_FILE="$(mktemp /tmp/trinity-root-restore-errors.XXXXXX)" \
  || fail 'restore error log could not be created'
cleanup() {
  local status=$?
  rm -f "$ERROR_FILE"
  return "$status"
}
trap cleanup EXIT
trap 'exit 129' HUP
trap 'exit 130' INT
trap 'exit 143' TERM
chmod 0600 "$ERROR_FILE"

if ! ACTUAL_CHECKSUM="$(
  cd "$INPUT_DIR" && shasum -a 256 "$INPUT_NAME"
)" 2>"$ERROR_FILE"; then
  fail 'encrypted backup checksum verification failed'
fi
ACTUAL_HASH="${ACTUAL_CHECKSUM%% *}"
[[ "$ACTUAL_HASH" =~ ^[0-9a-f]{64}$ && "$ACTUAL_HASH" == "$EXPECTED_HASH" ]] \
  || fail 'encrypted backup checksum verification failed'

if ! {
  gpg \
    --batch \
    --quiet \
    --no-auto-key-locate \
    --no-auto-key-retrieve \
    --decrypt "$RESTORE_INPUT" \
    | PGPASSFILE="$RESTORE_PGPASSFILE" \
      pg_restore \
        --no-password \
        --exit-on-error \
        --single-transaction \
        --no-owner \
        --no-privileges \
        --dbname="service=$RESTORE_PGSERVICE"
} 2>"$ERROR_FILE"; then
  fail 'disposable restore drill failed'
fi

printf '%s\n' 'disposable restore completed; logical verification is still required'
