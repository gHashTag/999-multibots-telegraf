#!/usr/bin/env bash
set -Eeuo pipefail
umask 077
export LC_ALL=C

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd -P)"
VALIDATOR="$SCRIPT_DIR/lib/canonicalize.mjs"
CATALOG_SQL="$SCRIPT_DIR/catalog-snapshot.sql"
EXTRACTOR="$REPO_ROOT/scripts/migrations/root-relational/pgservice-extract.cjs"

readonly IMAGE='supabase/postgres@sha256:ee29d0aaff03d0e12c7aa63437cba25f24246872f0ed3f82a9fd13184d780777'
readonly ARM64_PLATFORM_DIGEST='sha256:54bf97f912a302ced95b8a0b76cb08e0a5640b8b98d98bc5b023da49aaa85a79'
readonly EXPECTED_DUMP_SHA256='7ee6d64c755a84a77563582805a41ce2bb11e457659df306bf882cc45bae6372'
readonly EXPECTED_COMPRESSED_BYTES='717094'
readonly EXPECTED_UNCOMPRESSED_BYTES='2445348'
readonly READER_ROLE='trinity_historical_reader'
readonly READER_SERVICE='historical_source_readonly'
readonly IMAGE_PLATFORM='linux/arm64'
readonly EXPECTED_EXTENSIONS='http
pg_graphql
pg_net
pg_stat_statements
pgcrypto
pgjwt
pgsodium
supabase_vault
uuid-ossp
vector'

fail() {
  printf '%s\n' "$1" >&2
  exit 1
}

require_command() {
  command -v "$1" >/dev/null 2>&1 \
    || fail 'required local historical restore tool is unavailable'
}

path_is_absent() {
  [[ ! -e "$1" && ! -L "$1" ]]
}

: "${HISTORICAL_DUMP_INPUT:?HISTORICAL_DUMP_INPUT is required}"
: "${HISTORICAL_EVIDENCE_DIR:?HISTORICAL_EVIDENCE_DIR is required}"
: "${HISTORICAL_CONTAINER_NAME:?HISTORICAL_CONTAINER_NAME is required}"

[[ -z "${PGPASSWORD+x}" ]] || fail 'PGPASSWORD must be unset'
: "${HISTORICAL_ALLOW_IMAGE_PULL:=0}"
[[ "$HISTORICAL_ALLOW_IMAGE_PULL" == '0' || "$HISTORICAL_ALLOW_IMAGE_PULL" == '1' ]] \
  || fail 'historical image pull opt-in is invalid'
if [[ -n "${HISTORICAL_POSTGRES_IMAGE+x}" ]]; then
  [[ "$HISTORICAL_POSTGRES_IMAGE" == "$IMAGE" ]] \
    || fail 'historical restore image override is invalid'
fi
[[ "$HISTORICAL_CONTAINER_NAME" =~ ^trinity-historical-restore-[A-Za-z0-9._-]{1,96}$ ]] \
  || fail 'historical restore container name is invalid'

for command in docker gzip shasum wc awk tail grep sort comm node mktemp ln cp; do
  require_command "$command"
done
[[ -x "$EXTRACTOR" || -f "$EXTRACTOR" ]] \
  || fail 'fixed four-table extractor is unavailable'

node "$VALIDATOR" --validate-input "$HISTORICAL_DUMP_INPUT" "$REPO_ROOT" \
  >/dev/null || fail 'historical dump input is invalid'
node "$VALIDATOR" --validate-output-dir "$HISTORICAL_EVIDENCE_DIR" "$REPO_ROOT" \
  >/dev/null || fail 'historical evidence directory is invalid'

DUMP_DIR="$(cd "$(dirname "$HISTORICAL_DUMP_INPUT")" && pwd -P)"
DUMP_NAME="$(basename "$HISTORICAL_DUMP_INPUT")"
[[ "$DUMP_NAME" =~ ^[A-Za-z0-9._-]+$ ]] \
  || fail 'historical dump filename is invalid'
DUMP_INPUT="$DUMP_DIR/$DUMP_NAME"

# Snapshot the caller-owned path once, then verify and restore only this private
# immutable-by-convention copy. A concurrent replacement of the original path
# cannot change the bytes later passed to psql.
EARLY_TEMP_ROOT="$(mktemp -d /tmp/trinity-historical-source-extract.XXXXXX)" \
  || fail 'historical extractor workspace could not be created'
chmod 0700 "$EARLY_TEMP_ROOT"
cleanup_early() {
  local status=$?
  trap - EXIT HUP INT TERM
  rm -rf -- "$EARLY_TEMP_ROOT"
  exit "$status"
}
trap cleanup_early EXIT
trap 'exit 129' HUP
trap 'exit 130' INT
trap 'exit 143' TERM
cp -- "$DUMP_INPUT" "$EARLY_TEMP_ROOT/$DUMP_NAME" \
  || fail 'historical dump private snapshot failed'
chmod 0400 "$EARLY_TEMP_ROOT/$DUMP_NAME"
DUMP_DIR="$EARLY_TEMP_ROOT"
DUMP_INPUT="$DUMP_DIR/$DUMP_NAME"

CATALOG_NAME='historical-source-catalog.ndjson'
EXTENSIONS_NAME='historical-source-extension-versions.json'
SNAPSHOT_NAME='historical-source-four-table-snapshot.json'
MISSING_TABLES_NAME='historical-source-missing-tables.json'
CATALOG_FINAL="$HISTORICAL_EVIDENCE_DIR/$CATALOG_NAME"
EXTENSIONS_FINAL="$HISTORICAL_EVIDENCE_DIR/$EXTENSIONS_NAME"
SNAPSHOT_FINAL="$HISTORICAL_EVIDENCE_DIR/$SNAPSHOT_NAME"
MISSING_TABLES_FINAL="$HISTORICAL_EVIDENCE_DIR/$MISSING_TABLES_NAME"
for destination in \
  "$CATALOG_FINAL" \
  "$CATALOG_FINAL.sha256" \
  "$EXTENSIONS_FINAL" \
  "$EXTENSIONS_FINAL.sha256" \
  "$SNAPSHOT_FINAL" \
  "$SNAPSHOT_FINAL.sha256" \
  "$MISSING_TABLES_FINAL" \
  "$MISSING_TABLES_FINAL.sha256"; do
  path_is_absent "$destination" || fail 'historical evidence destination exists'
done

COMPRESSED_BYTES="$(wc -c <"$DUMP_INPUT" | tr -d '[:space:]')"
[[ "$COMPRESSED_BYTES" == "$EXPECTED_COMPRESSED_BYTES" ]] \
  || fail 'historical dump compressed size verification failed'

if ! HASH_LINE="$(cd "$DUMP_DIR" && shasum -a 256 "$DUMP_NAME")"; then
  fail 'historical dump checksum verification failed'
fi
ACTUAL_HASH="${HASH_LINE%% *}"
[[ "$ACTUAL_HASH" =~ ^[0-9a-f]{64}$ && "$ACTUAL_HASH" == "$EXPECTED_DUMP_SHA256" ]] \
  || fail 'historical dump checksum verification failed'

gzip -t -- "$DUMP_INPUT" >/dev/null 2>&1 \
  || fail 'historical dump gzip integrity verification failed'
if ! UNCOMPRESSED_BYTES="$(gzip -cd -- "$DUMP_INPUT" | wc -c | tr -d '[:space:]')"; then
  fail 'historical dump uncompressed size verification failed'
fi
[[ "$UNCOMPRESSED_BYTES" == "$EXPECTED_UNCOMPRESSED_BYTES" ]] \
  || fail 'historical dump uncompressed size verification failed'
if ! gzip -cd -- "$DUMP_INPUT" \
  | awk 'NR <= 16 && $0 == "-- PostgreSQL database cluster dump" { found = 1 } END { exit(found ? 0 : 1) }'; then
  fail 'historical dump header verification failed'
fi
if ! gzip -cd -- "$DUMP_INPUT" \
  | tail -n 16 \
  | grep -Fqx -- '-- PostgreSQL database cluster dump complete'; then
  fail 'historical dump completion verification failed'
fi

DOCKER_CONTEXT_ERROR="$EARLY_TEMP_ROOT/docker-context-errors"
: >"$DOCKER_CONTEXT_ERROR"
chmod 0600 "$DOCKER_CONTEXT_ERROR"
[[ -z "${DOCKER_HOST+x}" && -z "${DOCKER_CONTEXT+x}" ]] \
  || fail 'historical restore requires the local Docker context'
if ! DOCKER_CONTEXT_NAME="$(docker context show 2>"$DOCKER_CONTEXT_ERROR")" \
  || [[ ! "$DOCKER_CONTEXT_NAME" =~ ^[A-Za-z0-9._-]{1,128}$ ]]; then
  fail 'historical restore Docker context check failed'
fi
if ! DOCKER_ENDPOINT="$(docker context inspect \
  --format '{{.Endpoints.docker.Host}}' "$DOCKER_CONTEXT_NAME" \
  2>"$DOCKER_CONTEXT_ERROR")" \
  || [[ ! "$DOCKER_ENDPOINT" =~ ^unix:///[^[:space:][:cntrl:]]+$ ]]; then
  fail 'historical restore Docker endpoint is not local'
fi
DOCKER=(docker --host "$DOCKER_ENDPOINT")

if ! EXISTING_CONTAINERS="$("${DOCKER[@]}" container ls --all --format '{{.Names}}' \
  | awk -v expected="$HISTORICAL_CONTAINER_NAME" '$0 == expected { print }')"; then
  fail 'historical restore container freshness check failed'
fi
[[ -z "$EXISTING_CONTAINERS" ]] \
  || fail 'historical restore container name is not fresh'
CONTAINER_ATTEMPTED=0
CONTAINER_ID=''
VOLUME_ID=''
CATALOG_PARTIAL=''
CATALOG_SHA_PARTIAL=''
EXTENSIONS_PARTIAL=''
EXTENSIONS_SHA_PARTIAL=''
SNAPSHOT_PARTIAL=''
SNAPSHOT_SHA_PARTIAL=''
MISSING_TABLES_PARTIAL=''
MISSING_TABLES_SHA_PARTIAL=''
ERROR_FILE=''
TEMP_ROOT="$EARLY_TEMP_ROOT"
RUN_ID=''

cleanup() {
  local status=$?
  local cleanup_failed=0
  trap - EXIT HUP INT TERM

  [[ -z "$CATALOG_PARTIAL" ]] || rm -f "$CATALOG_PARTIAL"
  [[ -z "$CATALOG_SHA_PARTIAL" ]] || rm -f "$CATALOG_SHA_PARTIAL"
  [[ -z "$EXTENSIONS_PARTIAL" ]] || rm -f "$EXTENSIONS_PARTIAL"
  [[ -z "$EXTENSIONS_SHA_PARTIAL" ]] || rm -f "$EXTENSIONS_SHA_PARTIAL"
  [[ -z "$SNAPSHOT_PARTIAL" ]] || rm -f "$SNAPSHOT_PARTIAL"
  [[ -z "$SNAPSHOT_SHA_PARTIAL" ]] || rm -f "$SNAPSHOT_SHA_PARTIAL"
  [[ -z "$MISSING_TABLES_PARTIAL" ]] || rm -f "$MISSING_TABLES_PARTIAL"
  [[ -z "$MISSING_TABLES_SHA_PARTIAL" ]] || rm -f "$MISSING_TABLES_SHA_PARTIAL"
  [[ -z "$ERROR_FILE" ]] || rm -f "$ERROR_FILE"
  [[ -z "$TEMP_ROOT" ]] || rm -rf "$TEMP_ROOT"

  if [[ "$CONTAINER_ATTEMPTED" == '1' ]]; then
    local owned_ids=''
    local remaining_container=''
    local remaining_volume=''
    if [[ -z "$CONTAINER_ID" ]]; then
      if ! owned_ids="$("${DOCKER[@]}" container ls --all --no-trunc \
        --filter "label=trinity.restore-run=$RUN_ID" --format '{{.ID}}' \
        2>/dev/null)"; then
        cleanup_failed=1
      elif [[ "$owned_ids" =~ ^[0-9a-f]{64}$ ]]; then
        CONTAINER_ID="$owned_ids"
      elif [[ -n "$owned_ids" ]]; then
        cleanup_failed=1
      fi
    fi
    if [[ -n "$CONTAINER_ID" ]]; then
      if [[ ! "$CONTAINER_ID" =~ ^[0-9a-f]{64}$ ]] \
        || ! "${DOCKER[@]}" rm --force --volumes "$CONTAINER_ID" \
          >/dev/null 2>&1; then
        cleanup_failed=1
      fi
      if ! remaining_container="$("${DOCKER[@]}" container ls --all --no-trunc \
        --format '{{.ID}}' 2>/dev/null \
        | awk -v expected="$CONTAINER_ID" '$0 == expected { print }')" \
        || [[ -n "$remaining_container" ]]; then
        cleanup_failed=1
      fi
    fi
    if [[ -n "$VOLUME_ID" ]]; then
      if [[ ! "$VOLUME_ID" =~ ^[0-9a-f]{64}$ ]] \
        || ! remaining_volume="$("${DOCKER[@]}" volume ls --format '{{.Name}}' \
          2>/dev/null \
          | awk -v expected="$VOLUME_ID" '$0 == expected { print }')" \
        || [[ -n "$remaining_volume" ]]; then
        cleanup_failed=1
      fi
    fi
  fi

  if [[ "$cleanup_failed" == '1' ]]; then
    printf '%s\n' 'disposable historical restore cleanup failed' >&2
    exit 1
  fi
  if [[ "$status" == '0' ]]; then
    printf '%s\n' 'disposable cleanup complete'
  fi
  exit "$status"
}
trap cleanup EXIT
trap 'exit 129' HUP
trap 'exit 130' INT
trap 'exit 143' TERM

ERROR_FILE="$(mktemp "$HISTORICAL_EVIDENCE_DIR/.historical-restore-errors.XXXXXX")" \
  || fail 'private historical restore error file could not be created'
chmod 0600 "$ERROR_FILE"
RUN_ID="$(basename "$TEMP_ROOT")"
[[ "$RUN_ID" =~ ^trinity-historical-source-extract\.[A-Za-z0-9]+$ ]] \
  || fail 'historical restore run identity is invalid'
if ! gzip -cd -- "$DUMP_INPUT" \
  | awk '
      $1 == "CREATE" && $2 == "ROLE" {
        value = $0
        sub(/^CREATE ROLE[[:space:]]+/, "", value)
        sub(/;[[:space:]]*$/, "", value)
        print value
      }
    ' \
  | sort -u >"$TEMP_ROOT/dump-roles"; then
  fail 'historical dump role inventory failed'
fi
chmod 0600 "$TEMP_ROOT/dump-roles"
[[ -s "$TEMP_ROOT/dump-roles" ]] \
  || fail 'historical dump role inventory is empty'

if ! LOCAL_IMAGE="$({
  "${DOCKER[@]}" image inspect \
    --format '{{.Architecture}} {{.Os}} {{.Id}}' \
    "$IMAGE"
} 2>"$ERROR_FILE")"; then
  [[ "$HISTORICAL_ALLOW_IMAGE_PULL" == '1' ]] \
    || fail 'verified historical restore image is not available locally'
  "${DOCKER[@]}" pull --platform "$IMAGE_PLATFORM" "$IMAGE" \
    >/dev/null 2>"$ERROR_FILE" \
    || fail 'immutable historical restore image pull failed'
  if ! LOCAL_IMAGE="$({
    "${DOCKER[@]}" image inspect \
      --format '{{.Architecture}} {{.Os}} {{.Id}}' \
      "$IMAGE"
  } 2>"$ERROR_FILE")"; then
    fail 'immutable historical restore image inspection failed'
  fi
fi
[[ "$LOCAL_IMAGE" =~ ^arm64[[:space:]]+linux[[:space:]]+sha256:[0-9a-f]{64}$ ]] \
  || fail 'immutable historical restore local platform verification failed'

# The registry lookup proves that the pinned multi-arch index contains the
# independently verified linux/arm64 platform manifest. Local RepoDigests are
# deliberately not used: Docker may retain a platform digest instead of the
# index digest after a platform-specific pull.
if ! "${DOCKER[@]}" manifest inspect --verbose "$IMAGE" \
  >"$TEMP_ROOT/image-manifest.json" 2>"$ERROR_FILE"; then
  fail 'immutable historical restore platform manifest inspection failed'
fi
chmod 0600 "$TEMP_ROOT/image-manifest.json"
node - "$TEMP_ROOT/image-manifest.json" "$ARM64_PLATFORM_DIGEST" >/dev/null <<'NODE' \
  || fail 'immutable historical restore arm64 platform verification failed'
const fs = require('node:fs')
const manifest = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'))
const expectedDigest = process.argv[3]
const entries = Array.isArray(manifest) ? manifest : [manifest]
const matched = entries.some(entry => {
  const descriptor = entry?.Descriptor ?? entry?.descriptor ?? entry
  const platform = descriptor?.platform ?? entry?.platform
  return descriptor?.digest === expectedDigest &&
    platform?.architecture === 'arm64' && platform?.os === 'linux'
})
if (!matched) process.exit(1)
NODE

CONTAINER_ATTEMPTED=1
if ! CONTAINER_ID="$("${DOCKER[@]}" run \
  --detach \
  --name "$HISTORICAL_CONTAINER_NAME" \
  --platform "$IMAGE_PLATFORM" \
  --pull never \
  --network none \
  --read-only \
  --tmpfs '/tmp:rw,noexec,nosuid,size=64m' \
  --tmpfs '/run:rw,nosuid,size=16m' \
  --tmpfs '/var/run/postgresql:rw,nosuid,size=16m' \
  --tmpfs '/docker-entrypoint-initdb.d:rw,noexec,nosuid,size=1m' \
  --mount 'type=volume,target=/var/lib/postgresql/data,volume-nocopy' \
  --label 'trinity.scope=historical-local-restore' \
  --label "trinity.restore-run=$RUN_ID" \
  --entrypoint /bin/bash \
  "$IMAGE" \
  -ceu 'install -d -m 0700 -o postgres -g postgres /var/lib/postgresql/data/pgdata
exec gosu postgres bash -ceu '\''
  umask 077
  export PGDATA=/var/lib/postgresql/data/pgdata
  initdb --pgdata="$PGDATA" --username=trinity_restore_bootstrap --auth-local=trust --auth-host=reject
  exec postgres -D "$PGDATA" -c listen_addresses= -c unix_socket_directories=/var/run/postgresql
'\''' \
  2>"$ERROR_FILE")"; then
  fail 'disposable historical restore container start failed'
fi
CONTAINER_ID="${CONTAINER_ID//$'\r'/}"
CONTAINER_ID="${CONTAINER_ID//$'\n'/}"
[[ "$CONTAINER_ID" =~ ^[0-9a-f]{64}$ ]] \
  || fail 'disposable historical restore container identity is invalid'
if ! CONTAINER_OWNERSHIP="$("${DOCKER[@]}" container inspect \
  --format '{{ index .Config.Labels "trinity.restore-run" }} {{range .Mounts}}{{if eq .Destination "/var/lib/postgresql/data"}}{{.Name}}{{end}}{{end}}' \
  "$CONTAINER_ID" 2>"$ERROR_FILE")"; then
  fail 'disposable historical restore container ownership verification failed'
fi
CONTAINER_LABEL="${CONTAINER_OWNERSHIP%% *}"
VOLUME_ID="${CONTAINER_OWNERSHIP#* }"
if [[ "$CONTAINER_LABEL" != "$RUN_ID" ]] \
  || [[ ! "$VOLUME_ID" =~ ^[0-9a-f]{64}$ ]]; then
  fail 'disposable historical restore container ownership verification failed'
fi

READY=0
for ((_attempt = 1; _attempt <= 60; _attempt += 1)); do
  if "${DOCKER[@]}" exec "$CONTAINER_ID" \
    pg_isready --username=trinity_restore_bootstrap --dbname=postgres \
      >/dev/null 2>"$ERROR_FILE"; then
    READY=1
    break
  fi
  sleep 1
done
[[ "$READY" == '1' ]] || fail 'disposable historical database readiness failed'

EXTENSION_QUERY="SELECT name FROM pg_catalog.pg_available_extensions WHERE name IN ('http','pg_graphql','pg_net','pg_stat_statements','pgcrypto','pgjwt','pgsodium','supabase_vault','uuid-ossp','vector') ORDER BY name;"
if ! AVAILABLE_EXTENSIONS="$(
  "${DOCKER[@]}" exec "$CONTAINER_ID" \
    psql -X --no-psqlrc --tuples-only --no-align --set=ON_ERROR_STOP=1 \
      --username=trinity_restore_bootstrap --dbname=postgres \
      --command="$EXTENSION_QUERY" \
      2>"$ERROR_FILE"
)"; then
  fail 'historical extension preflight failed'
fi
AVAILABLE_EXTENSIONS="${AVAILABLE_EXTENSIONS//$'\r'/}"
[[ "$AVAILABLE_EXTENSIONS" == "$EXPECTED_EXTENSIONS" ]] \
  || fail 'historical extension preflight is incomplete'

if ! "${DOCKER[@]}" exec "$CONTAINER_ID" \
  psql -X --no-psqlrc --set=ON_ERROR_STOP=1 \
    --username=trinity_restore_bootstrap --dbname=postgres \
    --command='CREATE DATABASE trinity_extension_preflight;' \
    >/dev/null 2>"$ERROR_FILE"; then
  fail 'historical extension runtime database creation failed'
fi
RUNTIME_PREFLIGHT_FAILED=0
if ! RUNTIME_EXTENSIONS="$(
  "${DOCKER[@]}" exec --interactive "$CONTAINER_ID" \
    psql -X --no-psqlrc --quiet --tuples-only --no-align \
      --set=ON_ERROR_STOP=1 \
      --username=trinity_restore_bootstrap \
      --dbname=trinity_extension_preflight 2>"$ERROR_FILE" <<'SQL'
CREATE EXTENSION pg_net;
CREATE EXTENSION pgsodium;
CREATE EXTENSION http;
CREATE EXTENSION pg_graphql;
CREATE EXTENSION pg_stat_statements;
CREATE EXTENSION pgcrypto;
CREATE EXTENSION pgjwt;
CREATE EXTENSION supabase_vault;
CREATE EXTENSION "uuid-ossp";
CREATE EXTENSION vector;
SELECT extname
FROM pg_catalog.pg_extension
WHERE extname IN ('http','pg_graphql','pg_net','pg_stat_statements','pgcrypto','pgjwt','pgsodium','supabase_vault','uuid-ossp','vector')
ORDER BY extname;
SQL
)"; then
  RUNTIME_PREFLIGHT_FAILED=1
fi
"${DOCKER[@]}" exec "$CONTAINER_ID" \
  psql -X --no-psqlrc --set=ON_ERROR_STOP=1 \
    --username=trinity_restore_bootstrap --dbname=postgres \
    --command='DROP DATABASE trinity_extension_preflight WITH (FORCE);' \
    >/dev/null 2>"$ERROR_FILE" \
  || fail 'historical extension runtime database cleanup failed'
[[ "$RUNTIME_PREFLIGHT_FAILED" == '0' ]] \
  || fail 'historical extension runtime preflight failed'
RUNTIME_EXTENSIONS="${RUNTIME_EXTENSIONS//$'\r'/}"
[[ "$RUNTIME_EXTENSIONS" == "$EXPECTED_EXTENSIONS" ]] \
  || fail 'historical extension runtime preflight is incomplete'

if ! "${DOCKER[@]}" exec "$CONTAINER_ID" \
  psql -X --no-psqlrc --tuples-only --no-align --set=ON_ERROR_STOP=1 \
    --username=trinity_restore_bootstrap --dbname=postgres \
    --command='SELECT quote_ident(rolname) FROM pg_catalog.pg_roles ORDER BY 1;' \
    >"$TEMP_ROOT/bootstrap-roles" 2>"$ERROR_FILE"; then
  fail 'historical bootstrap role inventory failed'
fi
chmod 0600 "$TEMP_ROOT/bootstrap-roles"
sort -u "$TEMP_ROOT/bootstrap-roles" -o "$TEMP_ROOT/bootstrap-roles"
comm -12 "$TEMP_ROOT/dump-roles" "$TEMP_ROOT/bootstrap-roles" \
  >"$TEMP_ROOT/role-intersection" \
  || fail 'historical role intersection verification failed'
chmod 0600 "$TEMP_ROOT/role-intersection"
ROLE_INTERSECTION_COUNT="$(wc -l <"$TEMP_ROOT/role-intersection" | tr -d '[:space:]')"
[[ "$ROLE_INTERSECTION_COUNT" == '0' ]] \
  || fail 'historical bootstrap roles conflict with dump roles'

if ! gzip -cd -- "$DUMP_INPUT" \
  | "${DOCKER[@]}" exec --interactive "$CONTAINER_ID" \
      psql -X --no-psqlrc --set=ON_ERROR_STOP=1 \
        --username=trinity_restore_bootstrap --dbname=postgres \
        >/dev/null 2>"$ERROR_FILE"; then
  fail 'historical plain SQL restore failed'
fi

EXTENSIONS_PARTIAL="$(mktemp "$HISTORICAL_EVIDENCE_DIR/.historical-source-extensions.partial.XXXXXX")" \
  || fail 'historical extension evidence partial could not be created'
chmod 0600 "$EXTENSIONS_PARTIAL"
if ! "${DOCKER[@]}" exec "$CONTAINER_ID" \
  psql -X --no-psqlrc --tuples-only --no-align --set=ON_ERROR_STOP=1 \
    --username=trinity_restore_bootstrap --dbname=postgres \
    --command="SELECT jsonb_build_object('kind','extension_versions','extensions',jsonb_object_agg(extname,extversion ORDER BY extname))::text FROM pg_catalog.pg_extension WHERE extname IN ('http','pg_graphql','pg_net','pg_stat_statements','pgcrypto','pgjwt','pgsodium','supabase_vault','uuid-ossp','vector');" \
    >"$EXTENSIONS_PARTIAL" 2>"$ERROR_FILE"; then
  fail 'historical post-restore extension evidence failed'
fi
node - "$EXTENSIONS_PARTIAL" >/dev/null <<'NODE' \
  || fail 'historical post-restore extension set is incomplete'
const fs = require('node:fs')
const value = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'))
const expected = [
  'http', 'pg_graphql', 'pg_net', 'pg_stat_statements', 'pgcrypto',
  'pgjwt', 'pgsodium', 'supabase_vault', 'uuid-ossp', 'vector',
]
const extensions = value?.extensions
if (
  value?.kind !== 'extension_versions' ||
  !extensions || typeof extensions !== 'object' || Array.isArray(extensions) ||
  JSON.stringify(Object.keys(extensions).sort()) !== JSON.stringify(expected) ||
  Object.values(extensions).some(version => typeof version !== 'string' || version.length === 0)
) process.exit(1)
NODE
ln "$EXTENSIONS_PARTIAL" "$EXTENSIONS_FINAL" 2>"$ERROR_FILE" \
  || fail 'historical extension evidence could not be sealed'
rm -f "$EXTENSIONS_PARTIAL"
EXTENSIONS_PARTIAL=''
chmod 0600 "$EXTENSIONS_FINAL"
EXTENSIONS_SHA_PARTIAL="$(mktemp "$HISTORICAL_EVIDENCE_DIR/.historical-source-extensions.sha256.partial.XXXXXX")" \
  || fail 'historical extension checksum partial could not be created'
(cd "$HISTORICAL_EVIDENCE_DIR" && shasum -a 256 "$EXTENSIONS_NAME") \
  >"$EXTENSIONS_SHA_PARTIAL" 2>"$ERROR_FILE" \
  || fail 'historical extension checksum failed'
chmod 0600 "$EXTENSIONS_SHA_PARTIAL"
ln "$EXTENSIONS_SHA_PARTIAL" "$EXTENSIONS_FINAL.sha256" 2>"$ERROR_FILE" \
  || fail 'historical extension checksum could not be sealed'
rm -f "$EXTENSIONS_SHA_PARTIAL"
EXTENSIONS_SHA_PARTIAL=''
chmod 0600 "$EXTENSIONS_FINAL.sha256"

if ! "${DOCKER[@]}" exec --interactive "$CONTAINER_ID" \
  psql -X --no-psqlrc --set=ON_ERROR_STOP=1 \
    --username=trinity_restore_bootstrap --dbname=postgres \
    >/dev/null 2>"$ERROR_FILE" <<'SQL'
CREATE ROLE trinity_historical_reader NOLOGIN;
ALTER ROLE trinity_historical_reader SET default_transaction_read_only = on;
GRANT CONNECT ON DATABASE postgres TO trinity_historical_reader;
GRANT USAGE ON SCHEMA public TO trinity_historical_reader;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO trinity_historical_reader;
SQL
then
  fail 'historical read-only extractor role creation failed'
fi

CATALOG_PARTIAL="$(mktemp "$HISTORICAL_EVIDENCE_DIR/.historical-source-catalog.partial.XXXXXX")" \
  || fail 'historical catalog partial could not be created'
chmod 0600 "$CATALOG_PARTIAL"
if ! {
  {
    printf '%s\n' \
      'SET default_transaction_read_only = on;' \
      'SET ROLE trinity_historical_reader;'
    cat "$CATALOG_SQL"
  } \
    | "${DOCKER[@]}" exec --interactive "$CONTAINER_ID" \
        psql -X --no-psqlrc --quiet --tuples-only --no-align \
          --set=ON_ERROR_STOP=1 --username=trinity_restore_bootstrap \
          --dbname=postgres \
    | node "$VALIDATOR" --canonicalize-ndjson \
    >"$CATALOG_PARTIAL"
} 2>"$ERROR_FILE"; then
  fail 'historical source catalog extraction failed safely'
fi
[[ -s "$CATALOG_PARTIAL" ]] || fail 'historical source catalog is empty'
ln "$CATALOG_PARTIAL" "$CATALOG_FINAL" 2>"$ERROR_FILE" \
  || fail 'historical source catalog could not be sealed'
rm -f "$CATALOG_PARTIAL"
CATALOG_PARTIAL=''
chmod 0600 "$CATALOG_FINAL"

CATALOG_SHA_PARTIAL="$(mktemp "$HISTORICAL_EVIDENCE_DIR/.historical-source-catalog.sha256.partial.XXXXXX")" \
  || fail 'historical catalog checksum partial could not be created'
(cd "$HISTORICAL_EVIDENCE_DIR" && shasum -a 256 "$CATALOG_NAME") \
  >"$CATALOG_SHA_PARTIAL" 2>"$ERROR_FILE" \
  || fail 'historical catalog checksum failed'
chmod 0600 "$CATALOG_SHA_PARTIAL"
ln "$CATALOG_SHA_PARTIAL" "$CATALOG_FINAL.sha256" 2>"$ERROR_FILE" \
  || fail 'historical catalog checksum could not be sealed'
rm -f "$CATALOG_SHA_PARTIAL"
CATALOG_SHA_PARTIAL=''
chmod 0600 "$CATALOG_FINAL.sha256"

PRESENT_TABLES_FILE="$TEMP_ROOT/present-mandatory-tables"
if ! "${DOCKER[@]}" exec "$CONTAINER_ID" \
  psql -X --no-psqlrc --quiet --tuples-only --no-align \
    --set=ON_ERROR_STOP=1 --username=trinity_restore_bootstrap \
    --dbname=postgres \
    --command="/* historical_required_tables */ SELECT relation.relname FROM pg_catalog.pg_class AS relation JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = relation.relnamespace WHERE namespace.nspname = 'public' AND relation.relkind IN ('r','p') AND relation.relname IN ('assets','jobs','payments_v2','users') ORDER BY relation.relname;" \
    >"$PRESENT_TABLES_FILE" 2>"$ERROR_FILE"; then
  fail 'historical mandatory table presence check failed'
fi
chmod 0600 "$PRESENT_TABLES_FILE"

MISSING_TABLES_PARTIAL="$(mktemp "$HISTORICAL_EVIDENCE_DIR/.historical-source-missing-tables.partial.XXXXXX")" \
  || fail 'historical missing-table evidence partial could not be created'
chmod 0600 "$MISSING_TABLES_PARTIAL"
node - "$PRESENT_TABLES_FILE" >"$MISSING_TABLES_PARTIAL" <<'NODE' \
  || fail 'historical missing-table evidence validation failed'
const fs = require('node:fs')
const expected = ['assets', 'jobs', 'payments_v2', 'users']
const input = fs.readFileSync(process.argv[2], 'utf8').replaceAll('\r', '')
const present = input.split('\n').filter(Boolean)
if (
  present.some((value, index) => !expected.includes(value) ||
    (index > 0 && present[index - 1] >= value))
) process.exit(1)
const presentSet = new Set(present)
const missing = expected.filter(value => !presentSet.has(value))
process.stdout.write(`${JSON.stringify({
  kind: 'mandatory_table_presence',
  expected,
  present,
  missing,
})}\n`)
NODE
ln "$MISSING_TABLES_PARTIAL" "$MISSING_TABLES_FINAL" 2>"$ERROR_FILE" \
  || fail 'historical missing-table evidence could not be sealed'
rm -f "$MISSING_TABLES_PARTIAL"
MISSING_TABLES_PARTIAL=''
chmod 0600 "$MISSING_TABLES_FINAL"
MISSING_TABLES_SHA_PARTIAL="$(mktemp "$HISTORICAL_EVIDENCE_DIR/.historical-source-missing-tables.sha256.partial.XXXXXX")" \
  || fail 'historical missing-table checksum partial could not be created'
(cd "$HISTORICAL_EVIDENCE_DIR" && shasum -a 256 "$MISSING_TABLES_NAME") \
  >"$MISSING_TABLES_SHA_PARTIAL" 2>"$ERROR_FILE" \
  || fail 'historical missing-table checksum failed'
chmod 0600 "$MISSING_TABLES_SHA_PARTIAL"
ln "$MISSING_TABLES_SHA_PARTIAL" "$MISSING_TABLES_FINAL.sha256" 2>"$ERROR_FILE" \
  || fail 'historical missing-table checksum could not be sealed'
rm -f "$MISSING_TABLES_SHA_PARTIAL"
MISSING_TABLES_SHA_PARTIAL=''
chmod 0600 "$MISSING_TABLES_FINAL.sha256"

node - "$MISSING_TABLES_FINAL" >/dev/null <<'NODE' \
  || fail 'mandatory historical tables are missing; source snapshot withheld'
const fs = require('node:fs')
const value = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'))
if (!Array.isArray(value?.missing) || value.missing.length !== 0) process.exit(1)
NODE

mkdir -m 0700 "$TEMP_ROOT/bin" "$TEMP_ROOT/home"
printf '%s\n' \
  "[$READER_SERVICE]" \
  'host=/var/run/postgresql' \
  'dbname=postgres' \
  "user=$READER_ROLE" \
  >"$TEMP_ROOT/home/.pg_service.conf"
chmod 0600 "$TEMP_ROOT/home/.pg_service.conf"
: >"$TEMP_ROOT/pgpass"
chmod 0600 "$TEMP_ROOT/pgpass"

DOCKER_BIN="$(command -v docker)"
{
  printf '%s\n' '#!/usr/bin/env bash' 'set -Eeuo pipefail'
  printf 'DOCKER_BIN=%q\n' "$DOCKER_BIN"
  printf 'DOCKER_ENDPOINT=%q\n' "$DOCKER_ENDPOINT"
  printf 'CONTAINER_ID=%q\n' "$CONTAINER_ID"
  cat <<'WRAPPER'
INPUT="$(mktemp /tmp/trinity-historical-psql-input.XXXXXX)"
cleanup_wrapper() { rm -f "$INPUT"; }
trap cleanup_wrapper EXIT HUP INT TERM
chmod 0600 "$INPUT"
cat >"$INPUT"
{
  printf '%s\n' \
    'SET default_transaction_read_only = on;' \
    "SET statement_timeout = '30s';" \
    "SET lock_timeout = '5s';" \
    'SET ROLE trinity_historical_reader;'
  cat "$INPUT"
} | "$DOCKER_BIN" --host "$DOCKER_ENDPOINT" exec --interactive "$CONTAINER_ID" \
  psql -X --no-psqlrc --username=trinity_restore_bootstrap --dbname=postgres \
    --set=ON_ERROR_STOP=1 "$@"
WRAPPER
} >"$TEMP_ROOT/bin/psql"
chmod 0700 "$TEMP_ROOT/bin/psql"

SNAPSHOT_PARTIAL="$(mktemp "$HISTORICAL_EVIDENCE_DIR/.historical-source-four-table.partial.XXXXXX")" \
  || fail 'historical four-table partial could not be created'
chmod 0600 "$SNAPSHOT_PARTIAL"
if ! HOME="$TEMP_ROOT/home" \
  PATH="$TEMP_ROOT/bin:$PATH" \
  SOURCE_PGSERVICE="$READER_SERVICE" \
  SOURCE_PGPASSFILE="$TEMP_ROOT/pgpass" \
  node "$EXTRACTOR" --side source \
    >"$SNAPSHOT_PARTIAL" 2>"$ERROR_FILE"; then
  fail 'historical exact four-table extraction failed safely'
fi
[[ -s "$SNAPSHOT_PARTIAL" ]] \
  || fail 'historical exact four-table snapshot is empty'

node - "$SNAPSHOT_PARTIAL" >/dev/null <<'NODE' \
  || fail 'historical source-only reconciliation input validation failed'
const fs = require('node:fs')
const path = process.argv[2]
const value = JSON.parse(fs.readFileSync(path, 'utf8'))
const expected = ['assets', 'jobs', 'payments_v2', 'users']
if (
  value?.version !== 1 ||
  value?.side !== 'source' ||
  JSON.stringify(Object.keys(value?.tables ?? {})) !== JSON.stringify(expected) ||
  JSON.stringify(Object.keys(value?.catalog?.tables ?? {})) !== JSON.stringify(expected) ||
  !/^sha256:[0-9a-f]{64}$/.test(value?.catalog?.fingerprint ?? '')
) process.exit(1)
NODE

ln "$SNAPSHOT_PARTIAL" "$SNAPSHOT_FINAL" 2>"$ERROR_FILE" \
  || fail 'historical four-table snapshot could not be sealed'
rm -f "$SNAPSHOT_PARTIAL"
SNAPSHOT_PARTIAL=''
chmod 0600 "$SNAPSHOT_FINAL"

SNAPSHOT_SHA_PARTIAL="$(mktemp "$HISTORICAL_EVIDENCE_DIR/.historical-source-four-table.sha256.partial.XXXXXX")" \
  || fail 'historical four-table checksum partial could not be created'
(cd "$HISTORICAL_EVIDENCE_DIR" && shasum -a 256 "$SNAPSHOT_NAME") \
  >"$SNAPSHOT_SHA_PARTIAL" 2>"$ERROR_FILE" \
  || fail 'historical four-table checksum failed'
chmod 0600 "$SNAPSHOT_SHA_PARTIAL"
ln "$SNAPSHOT_SHA_PARTIAL" "$SNAPSHOT_FINAL.sha256" 2>"$ERROR_FILE" \
  || fail 'historical four-table checksum could not be sealed'
rm -f "$SNAPSHOT_SHA_PARTIAL"
SNAPSHOT_SHA_PARTIAL=''
chmod 0600 "$SNAPSHOT_FINAL.sha256"

printf '%s\n' 'historical local restore and source validation complete'
