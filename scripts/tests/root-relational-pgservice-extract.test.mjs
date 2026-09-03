import assert from 'node:assert/strict'
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import test from 'node:test'

const here = dirname(fileURLToPath(import.meta.url))
const cli = resolve(here, '../migrations/root-relational/pgservice-extract.cjs')
const require = createRequire(import.meta.url)

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

function schemas() {
  return {
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
}

function validRecords() {
  const definitions = schemas()
  const records = []
  const rows = {
    assets: [
      {
        id: '1',
        storage_path: 'safe/path.jpg',
        public_url: 'https://media.invalid/1',
      },
    ],
    jobs: [{ id: 'job-1', template_id: 'template-1', user_id: 'owner-1' }],
    payments_v2: [{ id: '7', inv_id: 'invoice-7', stars: '15.00' }],
    users: [
      {
        id: '00000000-0000-4000-8000-000000000001',
        user_id: '00000000-0000-4000-8000-000000000011',
        inviter: null,
        display_name: 'Owner',
      },
    ],
  }

  for (const table of TABLES) {
    records.push({ kind: 'schema', table, value: definitions[table] })
    for (const row of rows[table])
      records.push({ kind: 'row', table, value: row })
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
  return records
}

function asNdjson(records) {
  return `${records.map(record => JSON.stringify(record)).join('\n')}\n`
}

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'root-relational-pgservice-'))
  const bin = join(root, 'bin')
  mkdirSync(bin)
  const fakePsql = join(bin, 'psql')
  writeFileSync(
    fakePsql,
    `#!/usr/bin/env node
const fs = require('node:fs')
const path = require('node:path')
const fixtureRoot = path.dirname(path.dirname(__filename))
const chunks = []
process.stdin.on('data', chunk => chunks.push(chunk))
process.stdin.on('end', () => {
  const sql = Buffer.concat(chunks).toString('utf8')
  fs.appendFileSync(path.join(fixtureRoot, 'psql.log'), JSON.stringify({
    argv: process.argv.slice(2),
    env: {
      PGSERVICE: process.env.PGSERVICE ?? null,
      PGPASSFILE: process.env.PGPASSFILE ?? null,
      PGPASSWORD: process.env.PGPASSWORD ?? null,
      PGHOST: process.env.PGHOST ?? null,
      DATABASE_URL: process.env.DATABASE_URL ?? null,
      PGCONNECT_TIMEOUT: process.env.PGCONNECT_TIMEOUT ?? null,
      PGOPTIONS: process.env.PGOPTIONS ?? null,
    },
    sql,
  }) + '\\n')
  const failPath = path.join(fixtureRoot, 'fail')
  if (fs.existsSync(failPath)) {
    process.stderr.write(fs.readFileSync(failPath, 'utf8'))
    process.exitCode = 2
    return
  }
  process.stdout.write(fs.readFileSync(path.join(fixtureRoot, 'output.ndjson')))
})
`,
    { mode: 0o755 }
  )
  chmodSync(fakePsql, 0o755)

  const pgpass = join(root, 'pgpass')
  writeFileSync(pgpass, 'fixture:5432:fixture:fixture:never-used\n', {
    mode: 0o600,
  })
  chmodSync(pgpass, 0o600)
  const output = join(root, 'output.ndjson')
  writeFileSync(output, asNdjson(validRecords()), { mode: 0o600 })
  const log = join(root, 'psql.log')
  writeFileSync(log, '', { mode: 0o600 })
  const fail = join(root, 'fail')

  return {
    root,
    output,
    log,
    fail,
    pgpass,
    env: {
      ...process.env,
      PATH: `${bin}:${process.env.PATH}`,
      HOME: root,
      SOURCE_PGSERVICE: 'source_fixture',
      SOURCE_PGPASSFILE: pgpass,
      DESTINATION_PGSERVICE: 'destination_fixture',
      DESTINATION_PGPASSFILE: pgpass,
      DATABASE_URL: 'postgresql://must-not-reach-child.invalid/value',
      PGHOST: 'must-not-reach-child.invalid',
    },
  }
}

function run(args, env) {
  return spawnSync(process.execPath, [cli, ...args], {
    cwd: resolve(here, '../..'),
    env,
    encoding: 'utf8',
    timeout: 10_000,
  })
}

test('extracts one complete canonical source snapshot through PGSERVICE only', () => {
  const state = fixture()
  const result = run(['--side', 'source'], state.env)
  assert.equal(result.status, 0, result.stderr)
  assert.equal(result.stderr, '')

  const manifest = JSON.parse(result.stdout)
  assert.equal(manifest.version, 1)
  assert.equal(manifest.side, 'source')
  assert.deepEqual(Object.keys(manifest.tables), TABLES)
  assert.match(manifest.catalog.fingerprint, /^sha256:[0-9a-f]{64}$/)
  assert.deepEqual(Object.keys(manifest.catalog.tables), TABLES)
  for (const table of TABLES) {
    assert.match(
      manifest.catalog.tables[table].schemaFingerprint,
      /^sha256:[0-9a-f]{64}$/
    )
    for (const row of manifest.tables[table].rows) {
      for (const value of Object.values(row)) {
        assert.ok(value === null || typeof value === 'string')
      }
    }
  }
  assert.deepEqual(manifest.tables.jobs.referenceIds, ['template-1'])
  assert.equal(manifest.tables.users.sequenceState, null)

  const call = JSON.parse(readFileSync(state.log, 'utf8').trim())
  assert.ok(call.argv.includes('--no-password'))
  assert.ok(call.argv.includes('--no-psqlrc'))
  assert.ok(call.argv.includes('--tuples-only'))
  assert.ok(call.argv.includes('--no-align'))
  assert.ok(call.argv.includes('--set=ON_ERROR_STOP=1'))
  assert.ok(
    !call.argv.some(value => /(?:postgres|http|service=):?\/\//i.test(value))
  )
  assert.ok(!call.argv.some(value => /dbname/i.test(value)))
  assert.equal(call.env.PGSERVICE, 'source_fixture')
  assert.equal(call.env.PGPASSFILE, realpathSync(state.pgpass))
  assert.equal(call.env.PGPASSWORD, null)
  assert.equal(call.env.PGHOST, null)
  assert.equal(call.env.DATABASE_URL, null)
  assert.equal(call.env.PGCONNECT_TIMEOUT, '10')
  assert.match(call.env.PGOPTIONS, /default_transaction_read_only=on/)
  assert.match(call.env.PGOPTIONS, /statement_timeout=30000/)
  assert.match(call.env.PGOPTIONS, /lock_timeout=5000/)
  assert.match(call.env.PGOPTIONS, /idle_in_transaction_session_timeout=30000/)
  assert.match(
    call.sql,
    /BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;/
  )
  assert.match(call.sql, /SET LOCAL statement_timeout = '30s';/)
  assert.match(call.sql, /SET LOCAL lock_timeout = '5s';/)
  assert.match(
    call.sql,
    /SET LOCAL idle_in_transaction_session_timeout = '30s';/
  )
  for (const table of TABLES) {
    assert.match(call.sql, new RegExp(`public\\."${table}"`))
  }
  assert.doesNotMatch(
    call.sql,
    /\b(?:INSERT|UPDATE|DELETE|MERGE|COPY|CREATE|ALTER|DROP|TRUNCATE)\b/i
  )
})

test('selects destination service references without inheriting direct connection env', () => {
  const state = fixture()
  const result = run(['--side', 'destination'], state.env)
  assert.equal(result.status, 0, result.stderr)
  const manifest = JSON.parse(result.stdout)
  assert.equal(manifest.side, 'destination')
  const call = JSON.parse(readFileSync(state.log, 'utf8').trim())
  assert.equal(call.env.PGSERVICE, 'destination_fixture')
  assert.equal(call.env.PGPASSFILE, realpathSync(state.pgpass))
  assert.equal(call.env.PGHOST, null)
  assert.equal(call.env.DATABASE_URL, null)
})

test('rejects inherited PGPASSWORD before invoking psql and redacts the value', () => {
  const state = fixture()
  const secret = 'fixture-password-that-must-not-leak' // secret-guard-ok: синтетическая фикстура; тест доказывает, что значение НЕ попадает в вывод
  const result = run(['--side', 'source'], { ...state.env, PGPASSWORD: secret })
  assert.notEqual(result.status, 0)
  assert.equal(result.stdout, '')
  assert.equal(result.stderr, 'root relational extraction failed safely\n')
  assert.doesNotMatch(result.stderr, new RegExp(secret))
  assert.equal(readFileSync(state.log, 'utf8'), '')
})

test('rejects URLs, injected service names, unexpected identifiers, and weak pgpass', () => {
  for (const service of [
    'postgresql://database.invalid/name',
    'source_fixture dbname=other',
    'source_fixture;DROP TABLE users',
  ]) {
    const state = fixture()
    const result = run(['--side', 'source'], {
      ...state.env,
      SOURCE_PGSERVICE: service,
    })
    assert.notEqual(result.status, 0)
    assert.equal(result.stdout, '')
    assert.equal(result.stderr, 'root relational extraction failed safely\n')
    assert.equal(readFileSync(state.log, 'utf8'), '')
  }

  const state = fixture()
  const unexpected = run(
    ['--side', 'source', '--table', 'users; DROP TABLE assets'],
    state.env
  )
  assert.notEqual(unexpected.status, 0)
  assert.equal(readFileSync(state.log, 'utf8'), '')

  chmodSync(state.pgpass, 0o644)
  const weakPgpass = run(['--side', 'source'], state.env)
  assert.notEqual(weakPgpass.status, 0)
  assert.equal(weakPgpass.stderr, 'root relational extraction failed safely\n')
  assert.equal(readFileSync(state.log, 'utf8'), '')

  const { buildSql } = require(cli)
  assert.throws(
    () => buildSql(['users; DROP TABLE assets']),
    /mandatory table set/i
  )
})

test('fails closed on a partial snapshot and emits no partial row values', () => {
  const state = fixture()
  const records = validRecords()
  const secretRow = 'row-value-that-must-not-leak' // secret-guard-ok: синтетическая фикстура; тест доказывает, что значение НЕ попадает в вывод
  records.splice(-1, 1)
  records.push({ kind: 'row', table: 'users', value: { secretRow } })
  writeFileSync(state.output, asNdjson(records))

  const result = run(['--side', 'source'], state.env)
  assert.notEqual(result.status, 0)
  assert.equal(result.stdout, '')
  assert.equal(result.stderr, 'root relational extraction failed safely\n')
  assert.doesNotMatch(result.stderr, new RegExp(secretRow))
})

test('redacts psql failures and never forwards child stderr or stdout', () => {
  const state = fixture()
  const secret = 'database-error-containing-sensitive-value' // secret-guard-ok: синтетическая фикстура; тест доказывает, что значение НЕ попадает в вывод
  writeFileSync(state.fail, secret, { mode: 0o600 })
  const result = run(['--side', 'source'], state.env)
  assert.notEqual(result.status, 0)
  assert.equal(result.stdout, '')
  assert.equal(result.stderr, 'root relational extraction failed safely\n')
  assert.doesNotMatch(result.stderr, new RegExp(secret))
})

test('parser enforces byte, row, record, and typed-text bounds before sealing', () => {
  const { parseSnapshot } = require(cli)
  const records = validRecords()
  const text = asNdjson(records)

  assert.throws(
    () => parseSnapshot(text, 'source', { maxBytes: 16, maxRowsPerTable: 10 }),
    /snapshot limit/i
  )
  assert.throws(
    () =>
      parseSnapshot(text, 'source', {
        maxBytes: 1_000_000,
        maxRowsPerTable: 0,
      }),
    /row limit/i
  )

  const numeric = structuredClone(records)
  const paymentRow = numeric.find(
    record => record.kind === 'row' && record.table === 'payments_v2'
  )
  paymentRow.value.stars = 15
  assert.throws(() => parseSnapshot(asNdjson(numeric), 'source'), /typed text/i)

  const unknown = structuredClone(records)
  unknown.splice(-1, 0, { kind: 'schema', table: 'other', value: {} })
  assert.throws(() => parseSnapshot(asNdjson(unknown), 'source'), /table set/i)
})

test('manifest output is deterministic even when row/reference records arrive reordered', () => {
  const { parseSnapshot } = require(cli)
  const records = validRecords()
  records.splice(
    records.findIndex(
      record => record.kind === 'row' && record.table === 'assets'
    ) + 1,
    0,
    {
      kind: 'row',
      table: 'assets',
      value: {
        id: '0',
        storage_path: 'a/path.jpg',
        public_url: 'https://media.invalid/0',
      },
    }
  )
  records.splice(
    records.findIndex(record => record.kind === 'reference') + 1,
    0,
    { kind: 'reference', table: 'jobs', value: 'template-0' }
  )
  const shuffled = [...records.slice(0, -1).reverse(), records.at(-1)]
  const normalizedA = parseSnapshot(asNdjson(records), 'source')
  const normalizedB = parseSnapshot(asNdjson(shuffled), 'source')
  assert.deepEqual(normalizedA, normalizedB)
  assert.deepEqual(
    normalizedA.tables.assets.rows.map(row => row.id),
    ['0', '1']
  )
  assert.deepEqual(normalizedA.tables.jobs.referenceIds, [
    'template-0',
    'template-1',
  ])
})

test('fails closed on partitioned or inherited target/reference relation shapes', () => {
  const { buildSql, parseSnapshot } = require(cli)
  const sql = buildSql()
  assert.doesNotMatch(sql, /relkind IN \('r', 'p'\)/)
  assert.ok((sql.match(/relation\.relkind = 'r'/g) ?? []).length >= 2)
  assert.ok((sql.match(/NOT relation\.relispartition/g) ?? []).length >= 2)
  assert.ok((sql.match(/NOT relation\.relhassubclass/g) ?? []).length >= 2)
  assert.match(sql, /constraint_record\.conrelid = owner_relation\.oid/)
  assert.match(sql, /constraint_record\.confrelid = referenced_relation\.oid/)
  assert.match(sql, /constraint_record\.conname = 'jobs_template_id_fkey'/)
  assert.match(sql, /local_attribute\.attname = 'template_id'/)
  assert.match(sql, /referenced_attribute\.attname = 'id'/)

  const withoutReferenceShape = validRecords().filter(
    record => record.kind !== 'reference_shape'
  )
  assert.throws(
    () => parseSnapshot(asNdjson(withoutReferenceShape), 'source'),
    /reference relation shape/i
  )

  const invalidReferenceShape = validRecords()
  const shape = invalidReferenceShape.find(
    record => record.kind === 'reference_shape'
  )
  shape.value.relationKind = 'partitioned'
  assert.throws(
    () => parseSnapshot(asNdjson(invalidReferenceShape), 'source'),
    /reference relation shape/i
  )

  const wrongForeignKeyShape = validRecords()
  const foreignKeyShape = wrongForeignKeyShape.find(
    record => record.kind === 'reference_shape'
  )
  foreignKeyShape.value.referencedColumns = ['other_id']
  assert.throws(
    () => parseSnapshot(asNdjson(wrongForeignKeyShape), 'source'),
    /reference relation shape/i
  )
})

test('binds sequence state to the exact public target table and id attribute OIDs', () => {
  const { buildSql } = require(cli)
  const sql = buildSql()
  assert.ok(
    (sql.match(/dependency\.refobjid = owner_relation\.oid/g) ?? []).length >= 2
  )
  assert.ok(
    (sql.match(/dependency\.objid = sequence_relation\.oid/g) ?? []).length >= 2
  )
  assert.ok(
    (sql.match(/dependency\.refobjsubid = owner_attribute\.attnum/g) ?? [])
      .length >= 2
  )
  assert.ok(
    (sql.match(/sequence_record\.seqrelid = sequence_relation\.oid/g) ?? [])
      .length >= 2
  )
  assert.ok((sql.match(/owner_attribute\.attname = 'id'/g) ?? []).length >= 2)
  assert.ok(
    (sql.match(/sequence_namespace\.nspname = 'public'/g) ?? []).length >= 2
  )
})
