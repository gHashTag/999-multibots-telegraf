import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  truncateSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const here = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(here, '../..')
const restoreTool = resolve(
  repoRoot,
  'scripts/supabase-exit/restore-historical-sql.sh'
)

const IMAGE =
  'supabase/postgres@sha256:ee29d0aaff03d0e12c7aa63437cba25f24246872f0ed3f82a9fd13184d780777'
const DUMP_SHA256 =
  '7ee6d64c755a84a77563582805a41ce2bb11e457659df306bf882cc45bae6372'
const COMPRESSED_BYTES = 717_094
const UNCOMPRESSED_BYTES = 2_445_348
const EXTENSIONS = [
  'http',
  'pg_graphql',
  'pg_net',
  'pg_stat_statements',
  'pgcrypto',
  'pgjwt',
  'pgsodium',
  'supabase_vault',
  'uuid-ossp',
  'vector',
]
const TABLES = ['assets', 'jobs', 'payments_v2', 'users']

function column(name, type, ordinal, nullable = true) {
  return {
    name,
    type,
    ordinal,
    nullable,
    default: null,
    identity: '',
    generated: '',
    collation: null,
  }
}

function constraintState() {
  return {
    deferrable: false,
    initiallyDeferred: false,
    validated: true,
  }
}

function schema(table, columns, options = {}) {
  return {
    table,
    columns,
    primaryKey: {
      name: `${table}_pkey`,
      columns: options.primaryKey ?? ['id'],
      ...constraintState(),
    },
    uniqueKeys: options.uniqueKeys ?? [],
    foreignKeys: options.foreignKeys ?? [],
    checks: [],
    enums: [],
    sequences: options.sequences ?? [],
  }
}

function uniqueKey(name, columns) {
  return {
    name,
    columns,
    nullsDistinct: true,
    ...constraintState(),
  }
}

function foreignKey(name, columns, referencedTable, referencedColumns) {
  return {
    name,
    columns,
    referencedTable,
    referencedColumns,
    onUpdate: 'NO ACTION',
    onDelete: 'NO ACTION',
    ...constraintState(),
  }
}

function sequence(name, columnName) {
  return {
    name,
    column: columnName,
    increment: '1',
    start: '1',
    min: '1',
    max: '2147483647',
    cycle: false,
  }
}

function extractorRecords() {
  const schemas = {
    assets: schema(
      'assets',
      [
        column('id', 'integer', 1, false),
        column('storage_path', 'text', 2, false),
        column('public_url', 'text', 3, false),
      ],
      { sequences: [sequence('assets_id_seq', 'id')] }
    ),
    jobs: schema(
      'jobs',
      [
        column('id', 'text', 1, false),
        column('template_id', 'text', 2),
        column('user_id', 'text', 3, false),
      ],
      {
        foreignKeys: [
          foreignKey('jobs_template_id_fkey', ['template_id'], 'templates', [
            'id',
          ]),
        ],
      }
    ),
    payments_v2: schema(
      'payments_v2',
      [
        column('id', 'integer', 1, false),
        column('inv_id', 'character varying(100)', 2),
        column('stars', 'numeric(12,2)', 3, false),
      ],
      {
        uniqueKeys: [uniqueKey('payments_v2_inv_id_key', ['inv_id'])],
        sequences: [sequence('payments_v2_id_seq', 'id')],
      }
    ),
    users: schema(
      'users',
      [
        column('id', 'uuid', 1, false),
        column('user_id', 'uuid', 2, false),
        column('inviter', 'uuid', 3),
        column('display_name', 'text', 4),
      ],
      {
        uniqueKeys: [uniqueKey('users_user_id_key', ['user_id'])],
        foreignKeys: [
          foreignKey('users_inviter_fkey', ['inviter'], 'users', ['user_id']),
        ],
      }
    ),
  }
  const rows = {
    assets: [
      {
        id: '1',
        storage_path: 'private-fixture/path.jpg',
        public_url: 'https://media.invalid/private-fixture',
      },
    ],
    jobs: [
      {
        id: 'private-job-value',
        template_id: 'template-1',
        user_id: 'private-owner-value',
      },
    ],
    payments_v2: [{ id: '7', inv_id: 'private-invoice-value', stars: '15.00' }],
    users: [
      {
        id: '00000000-0000-4000-8000-000000000001',
        user_id: '00000000-0000-4000-8000-000000000011',
        inviter: null,
        display_name: 'private-display-value',
      },
    ],
  }
  const records = []
  for (const table of TABLES) {
    records.push({ kind: 'schema', table, value: schemas[table] })
    for (const row of rows[table]) {
      records.push({ kind: 'row', table, value: row })
    }
    if (table === 'assets') {
      records.push({
        kind: 'sequence_state',
        table,
        value: { name: 'assets_id_seq', maxValue: '1', nextValue: '2' },
      })
    }
    if (table === 'payments_v2') {
      records.push({
        kind: 'sequence_state',
        table,
        value: { name: 'payments_v2_id_seq', maxValue: '7', nextValue: '8' },
      })
    }
    if (table === 'jobs') {
      records.push({
        kind: 'reference_shape',
        table,
        value: {
          referencedTable: 'templates',
          relationKind: 'ordinary_non_inherited',
          constraint: 'jobs_template_id_fkey',
          localColumns: ['template_id'],
          referencedColumns: ['id'],
        },
      })
      records.push({ kind: 'reference', table, value: 'template-1' })
    }
  }
  records.push({ kind: 'snapshot_complete', version: 1, tables: TABLES })
  return `${records.map(record => JSON.stringify(record)).join('\n')}\n`
}

function writeExecutable(path, source) {
  writeFileSync(path, source, { mode: 0o700 })
  chmodSync(path, 0o700)
}

function fixture(t, overrides = {}) {
  const root = mkdtempSync(join(tmpdir(), 'trinity-historical-restore-test-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const bin = join(root, 'bin')
  const evidence = join(root, 'evidence')
  const state = join(root, 'state')
  mkdirSync(bin, { mode: 0o700 })
  mkdirSync(evidence, { mode: 0o700 })
  mkdirSync(state, { mode: 0o700 })
  chmodSync(evidence, 0o700)

  const dump = join(root, 'historical.sql.gz')
  writeFileSync(dump, '', { mode: 0o600 })
  truncateSync(dump, COMPRESSED_BYTES)
  chmodSync(dump, 0o600)

  const sql = join(root, 'historical.sql')
  const header =
    '--\n-- PostgreSQL database cluster dump\n--\nCREATE ROLE postgres;\n'
  const trailer = '\n-- PostgreSQL database cluster dump complete\n'
  const bodyBytes = UNCOMPRESSED_BYTES - Buffer.byteLength(header + trailer)
  writeFileSync(
    sql,
    Buffer.concat([
      Buffer.from(header),
      Buffer.alloc(bodyBytes, 0x20),
      Buffer.from(trailer),
    ]),
    { mode: 0o600 }
  )

  const extractor = join(root, 'extractor.ndjson')
  writeFileSync(extractor, extractorRecords(), { mode: 0o600 })
  const catalog = join(root, 'catalog.ndjson')
  writeFileSync(
    catalog,
    '{"kind":"server","server_version_num":"150006"}\n' +
      '{"kind":"snapshot_complete","value":true}\n',
    { mode: 0o600 }
  )
  const extensions = join(root, 'extensions.txt')
  writeFileSync(extensions, `${EXTENSIONS.join('\n')}\n`, { mode: 0o600 })
  const log = join(root, 'docker.log')
  writeFileSync(log, '', { mode: 0o600 })
  const ioLog = join(root, 'io.log')
  writeFileSync(ioLog, '', { mode: 0o600 })
  const extensionVersions = join(root, 'extension-versions.json')
  writeFileSync(
    extensionVersions,
    `${JSON.stringify({
      kind: 'extension_versions',
      extensions: Object.fromEntries(EXTENSIONS.map(name => [name, 'fixture'])),
    })}\n`,
    { mode: 0o600 }
  )
  const presentTables = join(root, 'present-tables.txt')
  writeFileSync(presentTables, `${TABLES.join('\n')}\n`, { mode: 0o600 })

  writeExecutable(
    join(bin, 'gzip'),
    `#!/usr/bin/env bash
set -euo pipefail
printf 'gzip-input %s\n' "\${*: -1}" >>"\${FAKE_IO_LOG}"
case "\${1:-}" in
  -t)
    [[ "\${FAKE_GZIP_FAIL:-0}" != '1' ]]
    ;;
  -cd)
    [[ "\${FAKE_GZIP_FAIL:-0}" != '1' ]]
    cat "\${FAKE_SQL}"
    ;;
  *) exit 64 ;;
esac
`
  )

  writeExecutable(
    join(bin, 'shasum'),
    `#!/usr/bin/env bash
set -euo pipefail
target="\${*: -1}"
if [[ "$(basename "$target")" == 'historical.sql.gz' ]]; then
  printf '%s  %s\n' "\${FAKE_DUMP_HASH}" "$target"
else
  exec /usr/bin/shasum "$@"
fi
`
  )

  writeExecutable(
    join(bin, 'sleep'),
    `#!/usr/bin/env bash
exit 0
`
  )

  writeExecutable(
    join(bin, 'docker'),
    `#!/usr/bin/env bash
set -euo pipefail
FAKE_LOG=${JSON.stringify(log)}
FAKE_STATE=${JSON.stringify(state)}
FAKE_EXTENSIONS=${JSON.stringify(extensions)}
FAKE_EXTRACTOR=${JSON.stringify(extractor)}
FAKE_CATALOG=${JSON.stringify(catalog)}
FAKE_EXTENSION_VERSIONS=${JSON.stringify(extensionVersions)}
FAKE_PRESENT_TABLES=${JSON.stringify(presentTables)}
log() { printf '%s\n' "$1" >> "$FAKE_LOG"; }
PINNED=0
if [[ "\${1:-}" == '--host' ]]; then
  [[ "\${2:-}" == unix:///* ]] || exit 64
  log 'host-pinned'
  PINNED=1
  shift 2
fi
if [[ "\${1:-}" != 'context' && "$PINNED" != '1' ]]; then exit 66; fi
case "\${1:-}" in
  context)
    case "\${2:-}" in
      show)
        log 'context-show'
        printf '%s\n' 'default'
        ;;
      inspect)
        log 'context-inspect'
        printf '%s\n' "\${FAKE_DOCKER_ENDPOINT:-unix:///var/run/docker.sock}"
        ;;
      *) exit 64 ;;
    esac
    ;;
  container)
    case "\${2:-}" in
      ls)
        log 'container-list'
        if [[ "\${FAKE_DOCKER_LIST_FAIL:-0}" == '1' ||
              ( "\${FAKE_CLEANUP_LIST_FAIL:-0}" == '1' && -e "$FAKE_STATE/cleanup-phase" ) ]]; then
          exit 2
        fi
        if [[ "\${FAKE_EXISTING_CONTAINER:-0}" == '1' || -e "$FAKE_STATE/container" ]]; then
          if [[ "$*" == *'label=trinity.restore-run='* ]]; then
            expected_run="\${*##*label=trinity.restore-run=}"
            expected_run="\${expected_run%% *}"
            actual_run="$(cat "$FAKE_STATE/container-label" 2>/dev/null || true)"
            if [[ "$actual_run" == "$expected_run" ]]; then
              cat "$FAKE_STATE/container-id"
            fi
          elif [[ "$*" == *'{{.ID}}'* ]]; then
            cat "$FAKE_STATE/container-id"
          else
            printf '%s\n' "$HISTORICAL_CONTAINER_NAME"
          fi
        fi
        ;;
      inspect)
        log 'container-label'
        [[ -e "$FAKE_STATE/container" ]] || exit 1
        if [[ "$*" == *'.Mounts'* ]]; then
          printf '%s %s\n' \
            "$(cat "$FAKE_STATE/container-label")" \
            "$(cat "$FAKE_STATE/volume-id")"
          if [[ "\${FAKE_REPLACE_AFTER_INSPECT:-0}" == '1' ]]; then
            printf '%064d\n' 3 >"$FAKE_STATE/container-id"
            printf '%s\n' 'foreign-run' >"$FAKE_STATE/container-label"
          fi
        else
          cat "$FAKE_STATE/container-label"
        fi
        ;;
      *) exit 64 ;;
    esac
    ;;
  volume)
    case "\${2:-}" in
      ls)
        log 'volume-list'
        if [[ "\${FAKE_DOCKER_LIST_FAIL:-0}" == '1' ]]; then
          exit 2
        fi
        if [[ -e "$FAKE_STATE/volume" ]]; then
          cat "$FAKE_STATE/volume-id"
        fi
        ;;
      *) exit 64 ;;
    esac
    ;;
  pull)
    log "pull $*"
    if [[ "$*" != *'--platform linux/arm64'* || "\${*: -1}" != '${IMAGE}' ]]; then
      exit 64
    fi
    if [[ "\${FAKE_PULL_FAIL:-0}" == '1' ]]; then exit 1; fi
    touch "\${FAKE_STATE}/pulled"
    ;;
  manifest)
    if [[ "\${2:-}" != 'inspect' || "\${3:-}" != '--verbose' ]]; then
      exit 64
    fi
    log 'manifest-inspect'
    printf '[{"Descriptor":{"digest":"%s","platform":{"architecture":"arm64","os":"linux"}}}]\n' \
      "\${FAKE_PLATFORM_DIGEST:-sha256:54bf97f912a302ced95b8a0b76cb08e0a5640b8b98d98bc5b023da49aaa85a79}"
    ;;
  image)
    if [[ "\${2:-}" != 'inspect' ]]; then exit 64; fi
    log 'image-inspect'
    if [[ "\${FAKE_LOCAL_IMAGE:-1}" != '1' && ! -e "$FAKE_STATE/pulled" ]]; then
      exit 1
    fi
    printf 'arm64 linux sha256:%064d\n' 1
    ;;
  run)
    log "run $*"
    if [[ "$*" != *'--platform linux/arm64'* ||
          "$*" != *'--network none'* ||
          "$*" != *'--pull never'* ||
          "$*" != *'--entrypoint /bin/bash'* ||
          "$*" != *'/docker-entrypoint-initdb.d'* ||
          "$*" != *'volume-nocopy'* ||
          "$*" == *'source=trinity-historical'* ||
          "$*" != *'initdb'* ||
          "$*" != *'--username=trinity_restore_bootstrap'* ||
          "$*" == *'--publish'* || "$*" == *' -p '* ]]; then
      exit 64
    fi
    if [[ "\${FAKE_CONTAINER_RACE:-0}" == '1' ]]; then
      printf '%s\n' 'foreign-run' >"$FAKE_STATE/container-label"
    else
      for argument in "$@"; do
        case "$argument" in
          trinity.restore-run=*) printf '%s\n' "\${argument#*=}" >"$FAKE_STATE/container-label" ;;
        esac
      done
    fi
    printf '%064d\n' 1 >"$FAKE_STATE/container-id"
    printf '%064d\n' 2 >"$FAKE_STATE/volume-id"
    touch "\${FAKE_STATE}/container"
    touch "\${FAKE_STATE}/volume"
    if [[ "\${FAKE_CONTAINER_RACE:-0}" == '1' ]]; then exit 1; fi
    cat "$FAKE_STATE/container-id"
    ;;
  exec)
    args="$*"
    input="$(cat)"
    current_id="$(cat "$FAKE_STATE/container-id" 2>/dev/null || true)"
    if [[ "$args" != *"$current_id"* || -z "$current_id" ]]; then exit 1; fi
    if [[ "$args" == *'pg_isready'* ]]; then
      log 'ready'
      exit 0
    fi
    if [[ "$args" == *'pg_available_extensions'* ]]; then
      log 'extensions-preflight'
      if [[ "\${FAKE_PREFLIGHT_FAIL:-0}" == '1' ]]; then exit 1; fi
      cat "$FAKE_EXTENSIONS"
      touch "$FAKE_STATE/preflight"
      exit 0
    fi
    if [[ "$args" == *'CREATE DATABASE trinity_extension_preflight'* ]]; then
      log 'extension-db-create'
      exit 0
    fi
    if [[ "$input" == *'CREATE EXTENSION http;'* ]]; then
      log 'extensions-runtime'
      if [[ "\${FAKE_RUNTIME_EXTENSION_FAIL:-0}" == '1' ]]; then exit 1; fi
      cat "$FAKE_EXTENSIONS"
      exit 0
    fi
    if [[ "$args" == *'DROP DATABASE trinity_extension_preflight'* ]]; then
      log 'extension-db-remove'
      exit 0
    fi
    if [[ "$args" == *'quote_ident(rolname)'* ]]; then
      log 'role-preflight'
      if [[ "\${FAKE_ROLE_COLLISION:-0}" == '1' ]]; then
        printf '%s\n' 'postgres'
      else
        printf '%s\n' 'trinity_restore_bootstrap'
      fi
      exit 0
    fi
    if [[ "$args" == *'historical_required_tables'* ]]; then
      log 'required-table-check'
      cat "$FAKE_PRESENT_TABLES"
      exit 0
    fi
    if [[ "$args" == *'extversion'* ]]; then
      log 'postrestore-extensions'
      cat "$FAKE_EXTENSION_VERSIONS"
      exit 0
    fi
    if [[ "$input" == *'PostgreSQL database cluster dump'* ]]; then
      log 'restore'
      if [[ ! -e "$FAKE_STATE/preflight" ]]; then exit 65; fi
      if [[ "\${FAKE_RESTORE_FAIL:-0}" == '1' ]]; then exit 1; fi
      touch "\${FAKE_STATE}/restored"
      exit 0
    fi
    if [[ "$input" == *'CREATE ROLE trinity_historical_reader'* ]]; then
      log 'reader-role'
      if [[ ! -e "$FAKE_STATE/restored" ]]; then exit 65; fi
      exit 0
    fi
    if [[ "$input" == *'reference_shape'* ]]; then
      log 'extractor'
      if [[ "\${FAKE_EXTRACT_FAIL:-0}" == '1' || -e "$FAKE_STATE/extract-fail" ]]; then
        exit 1
      fi
      cat "$FAKE_EXTRACTOR"
      exit 0
    fi
    if [[ "$input" == *'snapshot_complete'* ]]; then
      log 'catalog'
      cat "$FAKE_CATALOG"
      exit 0
    fi
    log 'unexpected-exec'
    exit 65
    ;;
  rm)
    requested_id="\${*: -1}"
    current_id="$(cat "$FAKE_STATE/container-id" 2>/dev/null || true)"
    [[ -n "$current_id" && "$requested_id" == "$current_id" ]] || exit 1
    log 'container-remove'
    touch "$FAKE_STATE/cleanup-phase"
    rm -f "\${FAKE_STATE}/container"
    rm -f "\${FAKE_STATE}/volume"
    ;;
  *) exit 64 ;;
esac
`
  )

  const env = {
    ...process.env,
    PATH: `${bin}:${dirname(process.execPath)}:/usr/bin:/bin`,
    HISTORICAL_DUMP_INPUT: dump,
    HISTORICAL_EVIDENCE_DIR: evidence,
    HISTORICAL_CONTAINER_NAME: 'trinity-historical-restore-fixture',
    FAKE_CATALOG: catalog,
    FAKE_DUMP_HASH: DUMP_SHA256,
    FAKE_EXTENSIONS: extensions,
    FAKE_EXTRACTOR: extractor,
    FAKE_LOG: log,
    FAKE_IO_LOG: ioLog,
    FAKE_PRESENT_TABLES: presentTables,
    FAKE_SQL: sql,
    FAKE_STATE: state,
    ...overrides,
  }
  if (overrides.FAKE_EXTRACT_FAIL === '1') {
    writeFileSync(join(state, 'extract-fail'), '', { mode: 0o600 })
  }
  if (!Object.hasOwn(overrides, 'PGPASSWORD')) delete env.PGPASSWORD
  if (!Object.hasOwn(overrides, 'DOCKER_HOST')) delete env.DOCKER_HOST
  if (!Object.hasOwn(overrides, 'DOCKER_CONTEXT')) delete env.DOCKER_CONTEXT
  return { root, evidence, state, dump, log, ioLog, env, extensionVersions }
}

function run(env) {
  const result = spawnSync(restoreTool, [], {
    cwd: repoRoot,
    env,
    encoding: 'utf8',
    timeout: 20_000,
    maxBuffer: 4 * 1024 * 1024,
  })
  return {
    ...result,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  }
}

function assertCleanup(state, log) {
  assert.equal(existsSync(join(state, 'container')), false)
  assert.equal(existsSync(join(state, 'volume')), false)
  const entries = readFileSync(log, 'utf8').trim().split('\n')
  assert.ok(entries.includes('container-remove'), entries.join('\n'))
  assert.ok(
    entries.lastIndexOf('container-list') > entries.indexOf('container-remove'),
    entries.join('\n')
  )
  assert.ok(
    entries.lastIndexOf('volume-list') > entries.indexOf('container-remove'),
    entries.join('\n')
  )
}

test('helper statically pins the immutable local-only restore contract', () => {
  assert.equal(existsSync(restoreTool), true)
  const source = readFileSync(restoreTool, 'utf8')
  assert.match(source, new RegExp(IMAGE.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
  assert.match(
    source,
    /sha256:54bf97f912a302ced95b8a0b76cb08e0a5640b8b98d98bc5b023da49aaa85a79/
  )
  for (const extension of EXTENSIONS)
    assert.match(source, new RegExp(extension))
  const createdExtensions = [
    ...source.matchAll(/^CREATE EXTENSION (?:(?:"([^"]+)")|([a-z_]+));$/gm),
  ]
    .map(match => match[1] ?? match[2])
    .sort()
  assert.deepEqual(createdExtensions, [...EXTENSIONS].sort())
  assert.match(source, /--network[= ]none/)
  assert.match(source, /readonly IMAGE_PLATFORM='linux\/arm64'/)
  assert.match(source, /--platform "\$IMAGE_PLATFORM"/)
  assert.match(source, /--pull never/)
  assert.match(source, /--entrypoint[= ]\/bin\/bash/)
  assert.match(source, /\/docker-entrypoint-initdb\.d/)
  assert.match(source, /initdb[^\n]*--username=trinity_restore_bootstrap/)
  assert.match(source, /psql[^\n]*-X[^\n]*--no-psqlrc/)
  assert.match(source, /--set=ON_ERROR_STOP=1/)
  assert.match(source, /pgservice-extract\.cjs/)
  assert.match(source, /default_transaction_read_only\s*=\s*on/)
  assert.match(source, /comm -12/)
  assert.match(source, /trinity\.restore-run=\$RUN_ID/)
  assert.match(
    source,
    /--mount 'type=volume,target=\/var\/lib\/postgresql\/data,volume-nocopy'/
  )
  assert.doesNotMatch(source, /HISTORICAL_VOLUME_NAME|source=/)
  assert.ok(
    source.indexOf('cp -- "$DUMP_INPUT"') <
      source.indexOf('COMPRESSED_BYTES="$(')
  )
  assert.match(source, /CREATE DATABASE trinity_extension_preflight/)
  assert.match(source, /DROP DATABASE trinity_extension_preflight/)
  assert.doesNotMatch(source, /railway|DATABASE_URL|SUPABASE_(?:URL|KEY)/i)
  assert.doesNotMatch(source, /public\.ecr\.aws|docker\.io\/supabase/)
  assert.doesNotMatch(source, /POSTGRES_(?:USER|PASSWORD|DB)/)
  assert.doesNotMatch(source, /set -x|--publish|\s-p\s|single-transaction/)
  assert.doesNotMatch(source, /\{\{json \.RepoDigests\}\}/)
})

test('restores only after exact preflight and seals private source evidence', t => {
  const state = fixture(t)
  const result = run(state.env)
  assert.equal(result.status, 0, result.stderr)
  assert.match(
    result.stdout,
    /historical local restore and source validation complete/
  )
  assert.match(result.stdout, /disposable cleanup complete/)
  assert.doesNotMatch(
    result.stdout + result.stderr,
    /private-(?:fixture|job|owner|invoice|display)/
  )

  const catalog = join(state.evidence, 'historical-source-catalog.ndjson')
  const snapshot = join(
    state.evidence,
    'historical-source-four-table-snapshot.json'
  )
  const extensionVersions = join(
    state.evidence,
    'historical-source-extension-versions.json'
  )
  const missingTables = join(
    state.evidence,
    'historical-source-missing-tables.json'
  )
  for (const path of [
    catalog,
    `${catalog}.sha256`,
    extensionVersions,
    `${extensionVersions}.sha256`,
    missingTables,
    `${missingTables}.sha256`,
    snapshot,
    `${snapshot}.sha256`,
  ]) {
    assert.equal(statSync(path).mode & 0o777, 0o600)
  }
  const document = JSON.parse(readFileSync(snapshot, 'utf8'))
  assert.equal(document.side, 'source')
  assert.deepEqual(Object.keys(document.tables), TABLES)
  assert.deepEqual(JSON.parse(readFileSync(missingTables, 'utf8')).missing, [])

  const log = readFileSync(state.log, 'utf8')
  const preflight = log.indexOf('extensions-preflight')
  const restore = log.indexOf('\nrestore\n')
  assert.ok(preflight >= 0 && restore > preflight, log)
  assert.doesNotMatch(log, /^pull /m)
  const ioLog = readFileSync(state.ioLog, 'utf8')
  assert.doesNotMatch(
    ioLog,
    new RegExp(state.dump.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  )
  assert.match(ioLog, /gzip-input \/tmp\/trinity-historical-source-extract\./)
  assert.match(log, /run .*--network none/)
  assert.match(log, /run .*--entrypoint \/bin\/bash/)
  assert.match(log, /initdb .*--username=trinity_restore_bootstrap/)
  assert.doesNotMatch(log, /POSTGRES_(?:USER|PASSWORD)/)
  assert.ok(
    log.indexOf('extension-db-create') < log.indexOf('extensions-runtime') &&
      log.indexOf('extensions-runtime') < log.indexOf('extension-db-remove') &&
      log.indexOf('extension-db-remove') < restore,
    log
  )
  assert.doesNotMatch(log, /--publish|\s-p\s|private-(?:owner|invoice|display)/)
  assertCleanup(state.state, state.log)
})

test('pull is explicit, immutable and arm64-only when the verified image is absent', t => {
  const state = fixture(t, {
    FAKE_LOCAL_IMAGE: '0',
    HISTORICAL_ALLOW_IMAGE_PULL: '1',
  })
  const result = run(state.env)
  assert.equal(result.status, 0, result.stderr)
  const log = readFileSync(state.log, 'utf8')
  assert.match(log, new RegExp(`pull .*--platform linux/arm64 .*${IMAGE}`))
  assertCleanup(state.state, state.log)
})

test('missing local image fails closed unless the exact pull opt-in is set', t => {
  const state = fixture(t, { FAKE_LOCAL_IMAGE: '0' })
  const result = run(state.env)
  assert.notEqual(result.status, 0)
  const log = readFileSync(state.log, 'utf8')
  assert.doesNotMatch(log, /^pull /m)
  assert.doesNotMatch(log, /^run /m)
})

test('rejects an unexpected platform manifest before creating resources', t => {
  const state = fixture(t, { FAKE_PLATFORM_DIGEST: `sha256:${'0'.repeat(64)}` })
  const result = run(state.env)
  assert.notEqual(result.status, 0)
  const log = readFileSync(state.log, 'utf8')
  assert.match(log, /manifest-inspect/)
  assert.doesNotMatch(log, /volume-create|^run /m)
})

test('rejects inherited or non-unix Docker endpoints before image or resource use', async t => {
  for (const overrides of [
    { DOCKER_HOST: 'tcp://remote.invalid:2376' },
    { DOCKER_CONTEXT: 'remote-context' },
    { FAKE_DOCKER_ENDPOINT: 'ssh://remote.invalid' },
  ]) {
    await t.test(Object.keys(overrides)[0], child => {
      const state = fixture(child, overrides)
      const result = run(state.env)
      assert.notEqual(result.status, 0)
      const log = readFileSync(state.log, 'utf8')
      assert.doesNotMatch(log, /image-inspect|volume-create|^run /m)
      assert.doesNotMatch(result.stderr, /remote\.invalid/)
    })
  }
})

test('Docker freshness API failure is not treated as resource absence', t => {
  const state = fixture(t, { FAKE_DOCKER_LIST_FAIL: '1' })
  const result = run(state.env)
  assert.notEqual(result.status, 0)
  const log = readFileSync(state.log, 'utf8')
  assert.doesNotMatch(log, /image-inspect|volume-create|^run /m)
})

test('rejects a mutable or alternate image override before Docker', t => {
  const state = fixture(t, {
    HISTORICAL_POSTGRES_IMAGE: 'supabase/postgres:latest',
  })
  const result = run(state.env)
  assert.notEqual(result.status, 0)
  assert.equal(readFileSync(state.log, 'utf8'), '')
  assert.doesNotMatch(result.stderr, /supabase\/postgres:latest/)
})

test('rejects any non-boolean image pull opt-in before Docker', t => {
  const state = fixture(t, { HISTORICAL_ALLOW_IMAGE_PULL: 'yes' })
  const result = run(state.env)
  assert.notEqual(result.status, 0)
  assert.equal(readFileSync(state.log, 'utf8'), '')
})

test('rejects dump checksum, size, gzip, header, and trailer mismatches before Docker', async t => {
  const cases = [{ FAKE_DUMP_HASH: '0'.repeat(64) }, { FAKE_GZIP_FAIL: '1' }]
  for (const overrides of cases) {
    await t.test(JSON.stringify(overrides), child => {
      const state = fixture(child, overrides)
      const result = run(state.env)
      assert.notEqual(result.status, 0)
      assert.equal(readFileSync(state.log, 'utf8'), '')
    })
  }

  await t.test('compressed byte count', child => {
    const state = fixture(child)
    truncateSync(state.dump, COMPRESSED_BYTES - 1)
    const result = run(state.env)
    assert.notEqual(result.status, 0)
    assert.equal(readFileSync(state.log, 'utf8'), '')
  })

  await t.test('completion trailer', child => {
    const state = fixture(child)
    const badSql = join(state.root, 'bad.sql')
    writeFileSync(badSql, Buffer.alloc(UNCOMPRESSED_BYTES, 0x20), {
      mode: 0o600,
    })
    const result = run({ ...state.env, FAKE_SQL: badSql })
    assert.notEqual(result.status, 0)
    assert.equal(readFileSync(state.log, 'utf8'), '')
  })
})

test('missing extension fails before restore and cleans the isolated resources', t => {
  const state = fixture(t)
  writeFileSync(
    state.env.FAKE_EXTENSIONS,
    `${EXTENSIONS.filter(value => value !== 'vector').join('\n')}\n`,
    { mode: 0o600 }
  )
  const result = run(state.env)
  assert.notEqual(result.status, 0)
  const log = readFileSync(state.log, 'utf8')
  assert.match(log, /extensions-preflight/)
  assert.doesNotMatch(log, /^restore$/m)
  assertCleanup(state.state, state.log)
})

test('extension runtime failure or dump-role collision fails before restore', async t => {
  for (const overrides of [
    { FAKE_RUNTIME_EXTENSION_FAIL: '1' },
    { FAKE_ROLE_COLLISION: '1' },
  ]) {
    await t.test(Object.keys(overrides)[0], child => {
      const state = fixture(child, overrides)
      const result = run(state.env)
      assert.notEqual(result.status, 0)
      const log = readFileSync(state.log, 'utf8')
      assert.doesNotMatch(log, /^restore$/m)
      if (overrides.FAKE_RUNTIME_EXTENSION_FAIL === '1') {
        assert.ok(
          log.indexOf('extensions-runtime') <
            log.indexOf('extension-db-remove'),
          log
        )
      }
      assertCleanup(state.state, state.log)
    })
  }
})

test('rejects incomplete post-restore extension version evidence privately', t => {
  const state = fixture(t)
  writeFileSync(
    state.extensionVersions,
    `${JSON.stringify({
      kind: 'extension_versions',
      extensions: Object.fromEntries(
        EXTENSIONS.filter(name => name !== 'vector').map(name => [
          name,
          'fixture',
        ])
      ),
    })}\n`,
    { mode: 0o600 }
  )
  const result = run(state.env)
  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /post-restore extension set is incomplete/)
  assert.equal(
    existsSync(
      join(state.evidence, 'historical-source-extension-versions.json')
    ),
    false
  )
  assert.deepEqual(
    readdirSync(state.evidence).filter(name => name.includes('partial')),
    []
  )
  assert.doesNotMatch(result.stdout + result.stderr, /fixture/)
  assertCleanup(state.state, state.log)
})

test('restore failure emits no evidence or row values and always cleans up', t => {
  const state = fixture(t, { FAKE_RESTORE_FAIL: '1' })
  const result = run(state.env)
  assert.notEqual(result.status, 0)
  assert.deepEqual(
    [
      'historical-source-catalog.ndjson',
      'historical-source-four-table-snapshot.json',
    ].filter(name => existsSync(join(state.evidence, name))),
    []
  )
  assert.doesNotMatch(result.stdout + result.stderr, /private-/)
  assertCleanup(state.state, state.log)
})

test('extractor failure preserves only the complete catalog and removes partial rows', t => {
  const state = fixture(t, { FAKE_EXTRACT_FAIL: '1' })
  const result = run(state.env)
  assert.notEqual(result.status, 0)
  assert.equal(
    existsSync(join(state.evidence, 'historical-source-catalog.ndjson')),
    true
  )
  assert.equal(
    existsSync(
      join(state.evidence, 'historical-source-four-table-snapshot.json')
    ),
    false
  )
  assert.deepEqual(
    readdirSync(state.evidence).filter(name => name.includes('partial')),
    []
  )
  assert.doesNotMatch(result.stdout + result.stderr, /private-/)
  assertCleanup(state.state, state.log)
})

test('a restored historical schema missing mandatory tables yields no four-table snapshot', t => {
  const state = fixture(t)
  writeFileSync(state.env.FAKE_PRESENT_TABLES, 'assets\nusers\n', {
    mode: 0o600,
  })
  const result = run(state.env)
  assert.notEqual(result.status, 0)
  assert.equal(
    existsSync(
      join(state.evidence, 'historical-source-four-table-snapshot.json')
    ),
    false
  )
  const catalog = join(state.evidence, 'historical-source-catalog.ndjson')
  const extensions = join(
    state.evidence,
    'historical-source-extension-versions.json'
  )
  const missing = join(state.evidence, 'historical-source-missing-tables.json')
  for (const path of [
    catalog,
    `${catalog}.sha256`,
    extensions,
    `${extensions}.sha256`,
    missing,
    `${missing}.sha256`,
  ]) {
    assert.equal(statSync(path).mode & 0o777, 0o600)
  }
  assert.deepEqual(JSON.parse(readFileSync(missing, 'utf8')), {
    kind: 'mandatory_table_presence',
    expected: TABLES,
    present: ['assets', 'users'],
    missing: ['jobs', 'payments_v2'],
  })
  assert.match(result.stderr, /mandatory historical tables are missing/)
  assert.doesNotMatch(readFileSync(state.log, 'utf8'), /^extractor$/m)
  assert.doesNotMatch(result.stdout + result.stderr, /private-/)
  assertCleanup(state.state, state.log)
})

test('cleanup reports Docker proof failure instead of treating it as absence', t => {
  const state = fixture(t, { FAKE_CLEANUP_LIST_FAIL: '1' })
  const result = run(state.env)
  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /disposable historical restore cleanup failed/)
  assert.equal(existsSync(join(state.state, 'container')), false)
  assert.equal(existsSync(join(state.state, 'volume')), false)
})

test('cleanup never operates on a raced foreign container or its anonymous volume', async t => {
  await t.test('replacement after immutable identity capture', child => {
    const state = fixture(child, { FAKE_REPLACE_AFTER_INSPECT: '1' })
    const result = run(state.env)
    assert.notEqual(result.status, 0)
    assert.equal(existsSync(join(state.state, 'container')), true)
    assert.equal(existsSync(join(state.state, 'volume')), true)
    const log = readFileSync(state.log, 'utf8')
    assert.doesNotMatch(log, /extensions-preflight|^restore$|container-remove/m)
    assert.match(result.stderr, /disposable historical restore cleanup failed/)
  })
  await t.test(
    'foreign container wins the requested name during run',
    child => {
      const state = fixture(child, { FAKE_CONTAINER_RACE: '1' })
      const result = run(state.env)
      assert.notEqual(result.status, 0)
      assert.equal(existsSync(join(state.state, 'container')), true)
      assert.equal(existsSync(join(state.state, 'volume')), true)
      assert.doesNotMatch(readFileSync(state.log, 'utf8'), /container-remove/)
    }
  )
})

test('existing container, output, or inherited password fails before mutation', async t => {
  const cases = [
    { FAKE_EXISTING_CONTAINER: '1' },
    { PGPASSWORD: 'private-password-value' }, // secret-guard-ok: deterministic fake regression fixture
  ]
  for (const overrides of cases) {
    await t.test(Object.keys(overrides)[0], child => {
      const state = fixture(child, overrides)
      const result = run(state.env)
      assert.notEqual(result.status, 0)
      assert.doesNotMatch(
        result.stdout + result.stderr,
        /private-password-value/
      )
      const log = readFileSync(state.log, 'utf8')
      assert.doesNotMatch(log, /^pull /m)
    })
  }

  await t.test('existing output', child => {
    const state = fixture(child)
    writeFileSync(
      join(state.evidence, 'historical-source-catalog.ndjson'),
      'do-not-overwrite',
      { mode: 0o600 }
    )
    const result = run(state.env)
    assert.notEqual(result.status, 0)
    assert.equal(readFileSync(state.log, 'utf8'), '')
  })
})
