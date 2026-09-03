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
  command -v "$1" >/dev/null 2>&1 || fail 'required local backup tool is unavailable'
}

valid_service_name() {
  [[ "$1" =~ ^[A-Za-z0-9._-]+$ ]] || fail 'PGSERVICE name is invalid'
}

: "${MIGRATION_EVIDENCE_DIR:?MIGRATION_EVIDENCE_DIR is required}"
: "${SOURCE_PGSERVICE:?SOURCE_PGSERVICE is required}"
: "${SOURCE_PGPASSFILE:?SOURCE_PGPASSFILE is required}"
: "${BACKUP_RECIPIENT:?BACKUP_RECIPIENT is required}"
[[ -z "${PGPASSWORD+x}" ]] || fail 'PGPASSWORD must be unset; use PGPASSFILE only'

require_command node
require_command psql
require_command pg_dump
require_command gpg
require_command shasum
require_command mktemp
require_command ln
valid_service_name "$SOURCE_PGSERVICE"

node "$VALIDATOR" --validate-output-dir "$MIGRATION_EVIDENCE_DIR" "$REPO_ROOT" \
  >/dev/null
node "$VALIDATOR" --validate-pgpass "$SOURCE_PGPASSFILE" "$REPO_ROOT" \
  >/dev/null

FINAL_NAME='source.dump.gpg'
FINAL="$MIGRATION_EVIDENCE_DIR/$FINAL_NAME"
PARTIAL_GUARD="$FINAL.partial"
SHA_FINAL="$FINAL.sha256"
SHA_PARTIAL_GUARD="$SHA_FINAL.partial"
PARTIAL=''
SHA_PARTIAL=''
ERROR_FILE=''
FINAL_OWNED=0
SHA_FINAL_OWNED=0
COMPLETE=0

path_is_absent() {
  [[ ! -e "$1" && ! -L "$1" ]]
}

cleanup() {
  local status=$?
  if [[ -n "$PARTIAL" ]]; then
    if [[ "$FINAL_OWNED" == '1' || ( -e "$FINAL" && "$FINAL" -ef "$PARTIAL" ) ]]; then
      rm -f "$FINAL"
    fi
    rm -f "$PARTIAL"
  elif [[ "$FINAL_OWNED" == '1' && "$COMPLETE" != '1' ]]; then
    rm -f "$FINAL"
  fi
  if [[ -n "$SHA_PARTIAL" ]]; then
    if [[ "$SHA_FINAL_OWNED" == '1' || ( -e "$SHA_FINAL" && "$SHA_FINAL" -ef "$SHA_PARTIAL" ) ]]; then
      rm -f "$SHA_FINAL"
    fi
    rm -f "$SHA_PARTIAL"
  elif [[ "$SHA_FINAL_OWNED" == '1' && "$COMPLETE" != '1' ]]; then
    rm -f "$SHA_FINAL"
  fi
  if [[ -n "$ERROR_FILE" ]]; then rm -f "$ERROR_FILE"; fi
  return "$status"
}

path_is_absent "$FINAL" \
  && path_is_absent "$PARTIAL_GUARD" \
  && path_is_absent "$SHA_FINAL" \
  && path_is_absent "$SHA_PARTIAL_GUARD" \
  || fail 'backup destination or partial path already exists'
ERROR_FILE="$(mktemp "$MIGRATION_EVIDENCE_DIR/.backup-source-errors.XXXXXX")" \
  || fail 'backup error log could not be created'
trap cleanup EXIT
trap 'exit 129' HUP
trap 'exit 130' INT
trap 'exit 143' TERM
chmod 0600 "$ERROR_FILE"
PARTIAL="$(mktemp "$MIGRATION_EVIDENCE_DIR/.source.dump.gpg.partial.XXXXXX")" \
  || fail 'backup partial could not be reserved'
chmod 0600 "$PARTIAL"

if ! SOURCE_VERSION_NUM="$({
  PGPASSFILE="$SOURCE_PGPASSFILE" \
    PGOPTIONS='-c default_transaction_read_only=on' \
    psql --no-password --dbname="service=$SOURCE_PGSERVICE" -X -qAt -v ON_ERROR_STOP=1 \
      -c "select current_setting('server_version_num')"
} 2>"$ERROR_FILE")"; then
  fail 'source version probe failed'
fi
SOURCE_VERSION_NUM="${SOURCE_VERSION_NUM//$'\n'/}"
[[ "$SOURCE_VERSION_NUM" =~ ^[0-9]{5,6}$ ]] || fail 'source version probe was invalid'
SOURCE_MAJOR=$((10#$SOURCE_VERSION_NUM / 10000))

if ! CLIENT_VERSION_TEXT="$(pg_dump --version 2>>"$ERROR_FILE")"; then
  fail 'pg_dump version probe failed'
fi
if [[ "$CLIENT_VERSION_TEXT" =~ ([0-9]+)(\.[0-9]+)? ]]; then
  CLIENT_MAJOR="${BASH_REMATCH[1]}"
else
  fail 'pg_dump version probe was invalid'
fi
((CLIENT_MAJOR >= SOURCE_MAJOR)) || fail 'unsupported pg_dump/source major combination'

if ! {
  PGPASSFILE="$SOURCE_PGPASSFILE" \
    PGOPTIONS='-c default_transaction_read_only=on' \
    pg_dump \
      --no-password \
      --dbname="service=$SOURCE_PGSERVICE" \
      --format=custom \
      --no-owner \
      --no-privileges \
      --serializable-deferrable \
    | gpg \
      --batch \
      --quiet \
      --no-auto-key-locate \
      --no-auto-key-retrieve \
      --encrypt \
      --recipient "$BACKUP_RECIPIENT" \
      --output - \
      >"$PARTIAL"
} 2>>"$ERROR_FILE"; then
  fail 'encrypted database backup failed'
fi

[[ -s "$PARTIAL" ]] || fail 'encrypted database backup was empty'
chmod 0600 "$PARTIAL"
if ! ln "$PARTIAL" "$FINAL" 2>>"$ERROR_FILE"; then
  fail 'backup destination could not be reserved'
fi
FINAL_OWNED=1
rm -f "$PARTIAL"
PARTIAL=''
SHA_PARTIAL="$(mktemp "$MIGRATION_EVIDENCE_DIR/.source.dump.gpg.sha256.partial.XXXXXX")" \
  || fail 'checksum partial could not be reserved'
if ! (cd "$MIGRATION_EVIDENCE_DIR" && shasum -a 256 "$FINAL_NAME") \
  >"$SHA_PARTIAL" 2>>"$ERROR_FILE"; then
  fail 'ciphertext checksum failed'
fi
chmod 0600 "$SHA_PARTIAL"
if ! ln "$SHA_PARTIAL" "$SHA_FINAL" 2>>"$ERROR_FILE"; then
  fail 'checksum destination could not be reserved'
fi
SHA_FINAL_OWNED=1
rm -f "$SHA_PARTIAL"
SHA_PARTIAL=''
COMPLETE=1
printf '%s\n' 'encrypted database backup complete; ciphertext checksum recorded'
