import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import test from 'node:test'

import {
  catalogFingerprint,
  digestCanonicalRow,
  schemaFingerprint,
} from '../migrations/root-relational/canonical-row.cjs'
import {
  ReconciliationError,
  reconcileDocument,
  reconcileTable,
} from '../migrations/root-relational/reconciliation-core.cjs'

const here = dirname(fileURLToPath(import.meta.url))
const cli = resolve(here, '../migrations/root-relational/reconcile-root.cjs')

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

function schema(table, columns, options = {}) {
  return {
    table,
    columns,
    primaryKey: {
      name: `${table}_pkey`,
      columns: options.primaryKey ?? ['id'],
      deferrable: false,
      initiallyDeferred: false,
      validated: true,
    },
    uniqueKeys: options.uniqueKeys ?? [],
    foreignKeys: options.foreignKeys ?? [],
    checks: options.checks ?? [],
    enums: options.enums ?? [],
    sequences: options.sequences ?? [],
  }
}

function uniqueKey(name, columns, nullsDistinct = true) {
  return {
    name,
    columns,
    nullsDistinct,
    deferrable: false,
    initiallyDeferred: false,
    validated: true,
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
    deferrable: false,
    initiallyDeferred: false,
    validated: true,
  }
}

function sequenceDescriptor(name, columnName) {
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

function assetsSchema() {
  return schema(
    'assets',
    [
      column('id', 'integer', 1, false),
      column('storage_path', 'text', 2, false),
      column('public_url', 'text', 3, false),
    ],
    {
      sequences: [sequenceDescriptor('assets_id_seq', 'id')],
    }
  )
}

function jobsSchema() {
  return schema(
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
  )
}

function usersSchema() {
  return schema(
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
  )
}

function paymentsSchema() {
  return schema(
    'payments_v2',
    [
      column('id', 'integer', 1, false),
      column('inv_id', 'character varying(100)', 2),
      column('stars', 'numeric(12,2)', 3, false),
    ],
    {
      uniqueKeys: [uniqueKey('payments_v2_inv_id_key', ['inv_id'])],
      sequences: [sequenceDescriptor('payments_v2_id_seq', 'id')],
    }
  )
}

function side(schemaValue, rows) {
  return { schema: structuredClone(schemaValue), rows }
}

function maxId(rows) {
  if (rows.length === 0) return null
  return rows.reduce((maximum, row) => {
    const value = BigInt(row.id)
    return maximum === null || value > maximum ? value : maximum
  }, null)
}

function sequenceProof(table, sourceRows, destinationRows) {
  if (table !== 'assets' && table !== 'payments_v2') return null
  const name = table === 'assets' ? 'assets_id_seq' : 'payments_v2_id_seq'
  const state = rows => {
    const maximum = maxId(rows)
    return {
      name,
      maxValue: maximum === null ? null : maximum.toString(),
      nextValue: maximum === null ? '1' : (maximum + 1n).toString(),
    }
  }
  return {
    version: 1,
    column: 'id',
    source: state(sourceRows),
    destination: state(destinationRows),
  }
}

function referenceProof(
  table,
  sourceTemplateIds = [],
  destinationTemplateIds = []
) {
  if (table !== 'jobs') return null
  return {
    version: 1,
    templates: {
      sourceIds: sourceTemplateIds,
      destinationIds: destinationTemplateIds,
    },
  }
}

function tableDocument(
  table,
  schemaValue,
  sourceRows,
  destinationRows,
  options = {}
) {
  return {
    source: side(schemaValue, sourceRows),
    destination: side(schemaValue, destinationRows),
    sequenceProof:
      options.sequenceProof === undefined
        ? sequenceProof(table, sourceRows, destinationRows)
        : options.sequenceProof,
    referenceProof:
      options.referenceProof === undefined
        ? referenceProof(
            table,
            options.sourceTemplateIds,
            options.destinationTemplateIds
          )
        : options.referenceProof,
  }
}

function reconcile(
  table,
  schemaValue,
  sourceRows,
  destinationRows,
  options = {}
) {
  return reconcileTable({
    table,
    ...tableDocument(table, schemaValue, sourceRows, destinationRows, options),
  })
}

function buildCatalogProof(tables) {
  const tableSeals = {}
  const expected = {}
  const source = {}
  const destination = {}
  for (const table of ['assets', 'jobs', 'payments_v2', 'users']) {
    const sourceSeal = schemaFingerprint(tables[table].source.schema)
    const destinationSeal = schemaFingerprint(tables[table].destination.schema)
    tableSeals[table] = {
      expectedSchemaFingerprint: sourceSeal,
      sourceSchemaFingerprint: sourceSeal,
      destinationSchemaFingerprint: destinationSeal,
    }
    expected[table] = sourceSeal
    source[table] = sourceSeal
    destination[table] = destinationSeal
  }
  return {
    version: 1,
    expectedCatalogFingerprint: catalogFingerprint(expected),
    sourceCatalogFingerprint: catalogFingerprint(source),
    destinationCatalogFingerprint: catalogFingerprint(destination),
    tables: tableSeals,
  }
}

function fullDocument(overrides = {}) {
  const definitions = {
    users: {
      schema: usersSchema(),
      sourceRows: [],
      destinationRows: [],
    },
    payments_v2: {
      schema: paymentsSchema(),
      sourceRows: [],
      destinationRows: [],
    },
    jobs: {
      schema: jobsSchema(),
      sourceRows: [],
      destinationRows: [],
    },
    assets: {
      schema: assetsSchema(),
      sourceRows: [],
      destinationRows: [],
    },
    ...overrides,
  }
  const tables = Object.fromEntries(
    Object.entries(definitions).map(([table, definition]) => [
      table,
      tableDocument(
        table,
        definition.schema,
        definition.sourceRows,
        definition.destinationRows,
        definition.options
      ),
    ])
  )
  return {
    version: 1,
    catalogProof: buildCatalogProof(tables),
    tables,
  }
}

test('canonical digest is schema-ordered, exact typed text, and collision-safe', () => {
  const fixtureSchema = schema('fixture', [
    column('id', 'text', 1, false),
    column('left_value', 'text', 2),
    column('right_value', 'numeric', 3),
  ])

  const ordered = { id: '1', left_value: 'a|b', right_value: '30.00' }
  const reordered = { right_value: '30.00', id: '1', left_value: 'a|b' }
  assert.equal(
    digestCanonicalRow(fixtureSchema, ordered),
    digestCanonicalRow(fixtureSchema, reordered)
  )

  assert.notEqual(
    digestCanonicalRow(fixtureSchema, ordered),
    digestCanonicalRow(fixtureSchema, {
      id: '1',
      left_value: 'a',
      right_value: 'b|30.00',
    })
  )
  assert.notEqual(
    digestCanonicalRow(fixtureSchema, ordered),
    digestCanonicalRow(fixtureSchema, {
      ...ordered,
      right_value: '30',
    })
  )
  assert.notEqual(
    digestCanonicalRow(fixtureSchema, ordered),
    digestCanonicalRow(fixtureSchema, {
      ...ordered,
      left_value: null,
    })
  )
  assert.throws(
    () => digestCanonicalRow(fixtureSchema, { ...ordered, right_value: 30 }),
    /typed text/i
  )
})

test('schema fingerprint is deterministic but changes on material schema drift', () => {
  const original = assetsSchema()
  const reorderedObjectKeys = {
    sequences: original.sequences.map(value => ({
      cycle: value.cycle,
      max: value.max,
      min: value.min,
      start: value.start,
      increment: value.increment,
      column: value.column,
      name: value.name,
    })),
    enums: [],
    checks: [],
    foreignKeys: [],
    uniqueKeys: [],
    primaryKey: {
      validated: true,
      initiallyDeferred: false,
      deferrable: false,
      columns: ['id'],
      name: 'assets_pkey',
    },
    columns: original.columns.map(value => ({
      nullable: value.nullable,
      ordinal: value.ordinal,
      type: value.type,
      name: value.name,
      generated: value.generated,
      identity: value.identity,
      default: value.default,
      collation: value.collation,
    })),
    table: 'assets',
  }

  assert.equal(
    schemaFingerprint(original),
    schemaFingerprint(reorderedObjectKeys)
  )

  const drifted = structuredClone(original)
  drifted.columns[2].nullable = true
  assert.notEqual(schemaFingerprint(original), schemaFingerprint(drifted))
})

test('classifies source-only, destination-only, equal, and true conflicts independent of input order', () => {
  const schemaValue = assetsSchema()
  const sourceRows = [
    { id: '1', storage_path: 'same', public_url: 'https://media.invalid/1' },
    { id: '2', storage_path: 'source', public_url: 'https://media.invalid/2' },
    {
      id: '4',
      storage_path: 'conflict',
      public_url: 'https://source.invalid/4',
    },
  ]
  const destinationRows = [
    { id: '1', storage_path: 'same', public_url: 'https://media.invalid/1' },
    {
      id: '3',
      storage_path: 'destination',
      public_url: 'https://media.invalid/3',
    },
    {
      id: '4',
      storage_path: 'conflict',
      public_url: 'https://destination.invalid/4',
    },
  ]

  const forward = reconcile('assets', schemaValue, sourceRows, destinationRows)
  const reversed = reconcile(
    'assets',
    schemaValue,
    [...sourceRows].reverse(),
    [...destinationRows].reverse()
  )

  assert.deepEqual(forward, reversed)
  assert.deepEqual(forward.counts, {
    source_only: 1,
    destination_only: 1,
    equal: 1,
    true_conflict: 1,
  })
  assert.equal(forward.tableConverged, false)
  assert.equal(Object.hasOwn(forward, 'converged'), false)
  assert.deepEqual(forward.changedColumns, { public_url: 1 })
  assert.equal(Object.hasOwn(forward, 'entries'), false)

  const swapped = reconcile('assets', schemaValue, destinationRows, sourceRows)
  assert.deepEqual(swapped.counts, {
    source_only: forward.counts.destination_only,
    destination_only: forward.counts.source_only,
    equal: forward.counts.equal,
    true_conflict: forward.counts.true_conflict,
  })
  assert.deepEqual(swapped.changedColumns, forward.changedColumns)
})

test('fails closed on schema mismatch before inspecting invalid row values', () => {
  const sourceSchema = assetsSchema()
  const destinationSchema = structuredClone(sourceSchema)
  destinationSchema.columns[2].type = 'character varying'
  const sourceRows = [
    { id: 1, storage_path: 'invalid-number', public_url: 'secret-url' },
  ]

  assert.throws(
    () =>
      reconcileTable({
        table: 'assets',
        source: side(sourceSchema, sourceRows),
        destination: side(destinationSchema, []),
        sequenceProof: sequenceProof('assets', sourceRows, []),
        referenceProof: null,
      }),
    error =>
      error instanceof ReconciliationError && error.code === 'E_SCHEMA_MISMATCH'
  )
})

test('fails closed when a required alternate-key constraint is absent', () => {
  const schemaValue = usersSchema()
  schemaValue.uniqueKeys = []

  assert.throws(
    () => reconcile('users', schemaValue, [], []),
    error =>
      error instanceof ReconciliationError && error.code === 'E_SCHEMA_CONTRACT'
  )
})

test('users.user_id and payments_v2.inv_id collisions across different PKs are fatal and redacted', () => {
  const cases = [
    {
      table: 'users',
      schema: usersSchema(),
      source: [
        {
          id: '00000000-0000-0000-0000-000000000001',
          user_id: '11111111-1111-1111-1111-owner-secret',
          inviter: null,
          display_name: 'source-name-secret',
        },
      ],
      destination: [
        {
          id: '00000000-0000-0000-0000-000000000002',
          user_id: '11111111-1111-1111-1111-owner-secret',
          inviter: null,
          display_name: 'destination-name-secret',
        },
      ],
      sentinels: [
        'owner-secret',
        'source-name-secret',
        'destination-name-secret',
      ],
    },
    {
      table: 'payments_v2',
      schema: paymentsSchema(),
      source: [{ id: '10', inv_id: 'invoice-secret', stars: '30.00' }],
      destination: [{ id: '11', inv_id: 'invoice-secret', stars: '30.00' }],
      sentinels: ['invoice-secret', '30.00'],
    },
  ]

  for (const fixture of cases) {
    let caught
    try {
      reconcile(
        fixture.table,
        fixture.schema,
        fixture.source,
        fixture.destination
      )
    } catch (error) {
      caught = error
    }
    assert.ok(caught instanceof ReconciliationError)
    assert.equal(caught.code, 'E_ALTERNATE_KEY_CONFLICT')
    const serialized = JSON.stringify({
      message: caught.message,
      details: caught.details,
    })
    for (const sentinel of fixture.sentinels) {
      assert.doesNotMatch(serialized, new RegExp(sentinel, 'i'))
    }
  }
})

test('nullable payment inv_id values are not treated as the same alternate key', () => {
  const result = reconcile(
    'payments_v2',
    paymentsSchema(),
    [{ id: '1', inv_id: null, stars: '10.00' }],
    [{ id: '2', inv_id: null, stars: '10.00' }]
  )

  assert.deepEqual(result.counts, {
    source_only: 1,
    destination_only: 1,
    equal: 0,
    true_conflict: 0,
  })
})

test('empty payment inv_id remains a real non-null alternate key', () => {
  assert.throws(
    () =>
      reconcile(
        'payments_v2',
        paymentsSchema(),
        [{ id: '1', inv_id: '', stars: '10.00' }],
        [{ id: '2', inv_id: '', stars: '10.00' }]
      ),
    error =>
      error instanceof ReconciliationError &&
      error.code === 'E_ALTERNATE_KEY_CONFLICT'
  )
})

test('assets rows with duplicate storage paths remain distinct PK-owned rows', () => {
  const rows = [
    {
      id: '1',
      storage_path: 'shared/path.mp4',
      public_url: 'https://one.invalid',
    },
    {
      id: '2',
      storage_path: 'shared/path.mp4',
      public_url: 'https://two.invalid',
    },
  ]
  const result = reconcile('assets', assetsSchema(), rows, rows)

  assert.deepEqual(result.counts, {
    source_only: 0,
    destination_only: 0,
    equal: 2,
    true_conflict: 0,
  })
  assert.equal(result.tableConverged, true)
  assert.equal(Object.hasOwn(result, 'converged'), false)
})

test('jobs.user_id remains opaque and is never resolved as a users owner link', () => {
  const rows = [
    { id: 'job-1', template_id: null, user_id: 'opaque-not-a-telegram-id' },
  ]
  const result = reconcile('jobs', jobsSchema(), rows, rows)

  assert.equal(result.counts.equal, 1)
  assert.equal(result.tableConverged, true)
  assert.equal(Object.hasOwn(result, 'converged'), false)
})

test('users.inviter is checked against users.user_id and orphan errors are redacted', () => {
  const validRows = [
    {
      id: '00000000-0000-0000-0000-000000000001',
      user_id: '11111111-1111-1111-1111-111111111111',
      inviter: null,
      display_name: 'principal',
    },
    {
      id: '00000000-0000-0000-0000-000000000002',
      user_id: '22222222-2222-2222-2222-222222222222',
      inviter: '11111111-1111-1111-1111-111111111111',
      display_name: 'child',
    },
  ]
  assert.equal(
    reconcile('users', usersSchema(), validRows, validRows).counts.equal,
    2
  )

  const orphanSentinel = '99999999-9999-9999-9999-orphan-secret'
  const orphanRows = [
    {
      ...validRows[1],
      inviter: orphanSentinel,
    },
  ]
  let caught
  try {
    reconcile('users', usersSchema(), orphanRows, [])
  } catch (error) {
    caught = error
  }
  assert.ok(caught instanceof ReconciliationError)
  assert.equal(caught.code, 'E_OWNER_LINK_ORPHAN')
  assert.doesNotMatch(
    JSON.stringify({ message: caught.message, details: caught.details }),
    /orphan-secret/i
  )
})

test('summary exposes only schema hash and aggregate column names, never rows, PKs, or values', () => {
  const pkSentinel = 'job-primary-key-secret'
  const valueSentinel = 'opaque-owner-value-secret'
  const result = reconcile(
    'jobs',
    jobsSchema(),
    [{ id: pkSentinel, template_id: null, user_id: valueSentinel }],
    []
  )
  const output = JSON.stringify(result)

  assert.match(output, /sha256:/)
  assert.doesNotMatch(
    output,
    /job-primary-key-secret|opaque-owner-value-secret/i
  )
  assert.equal(Object.hasOwn(result, 'entries'), false)
})

test('duplicate primary keys are fatal even when the duplicate rows are identical', () => {
  const duplicate = {
    id: '1',
    storage_path: 'same/path',
    public_url: 'https://same.invalid',
  }
  assert.throws(
    () =>
      reconcile('assets', assetsSchema(), [duplicate, { ...duplicate }], []),
    error =>
      error instanceof ReconciliationError &&
      error.code === 'E_PRIMARY_KEY_DUPLICATE'
  )
})

test('missing, extra, or non-text row fields fail closed', () => {
  const valid = {
    id: '1',
    storage_path: 'same/path',
    public_url: 'https://same.invalid',
  }
  for (const invalid of [
    { id: '1', storage_path: 'same/path' },
    { ...valid, unexpected: 'field' },
    { ...valid, id: 1 },
  ]) {
    assert.throws(
      () => reconcile('assets', assetsSchema(), [invalid], []),
      error =>
        error instanceof ReconciliationError && error.code === 'E_ROW_INVALID'
    )
  }
})

test('users inviter self-links and cycles are valid when every user_id exists in the same side', () => {
  const rows = [
    {
      id: '00000000-0000-0000-0000-000000000001',
      user_id: '11111111-1111-1111-1111-111111111111',
      inviter: '22222222-2222-2222-2222-222222222222',
      display_name: null,
    },
    {
      id: '00000000-0000-0000-0000-000000000002',
      user_id: '22222222-2222-2222-2222-222222222222',
      inviter: '11111111-1111-1111-1111-111111111111',
      display_name: null,
    },
    {
      id: '00000000-0000-0000-0000-000000000003',
      user_id: '33333333-3333-3333-3333-333333333333',
      inviter: '33333333-3333-3333-3333-333333333333',
      display_name: null,
    },
  ]

  assert.equal(reconcile('users', usersSchema(), rows, rows).counts.equal, 3)
})

test('document requires exactly all four mandatory tables and never reports partial convergence', () => {
  const document = fullDocument()
  delete document.tables.payments_v2

  assert.throws(
    () => reconcileDocument(document),
    error =>
      error instanceof ReconciliationError && error.code === 'E_TABLE_SET'
  )
})

test('catalog proof binds expected, source, and destination table seals', () => {
  const document = fullDocument()
  document.catalogProof.tables.assets.expectedSchemaFingerprint = `sha256:${'0'.repeat(64)}`

  assert.throws(
    () => reconcileDocument(document),
    error =>
      error instanceof ReconciliationError && error.code === 'E_CATALOG_PROOF'
  )
})

test('internally verified JSON catalog proof remains explicitly non-production provenance', () => {
  const result = reconcileDocument(fullDocument())

  assert.equal(result.catalogProofVerified, true)
  assert.equal(result.converged, true)
  assert.equal(result.productionReady, false)
  assert.equal(
    result.productionReadinessReason,
    'catalog_provenance_unauthenticated'
  )
})

test('malformed foreign-key constraint flags fail schema validation', () => {
  const schemaValue = jobsSchema()
  schemaValue.foreignKeys[0].deferrable = 'false'

  assert.throws(
    () => reconcile('jobs', schemaValue, [], []),
    error =>
      error instanceof ReconciliationError && error.code === 'E_SCHEMA_INVALID'
  )
})

test('required primary and foreign-key constraint states fail closed on semantic drift', () => {
  const invalidPrimary = assetsSchema()
  invalidPrimary.primaryKey.validated = false
  assert.throws(
    () => reconcile('assets', invalidPrimary, [], []),
    error =>
      error instanceof ReconciliationError && error.code === 'E_SCHEMA_CONTRACT'
  )

  const cascadingOwnerLink = usersSchema()
  cascadingOwnerLink.foreignKeys[0].onDelete = 'CASCADE'
  assert.throws(
    () => reconcile('users', cascadingOwnerLink, [], []),
    error =>
      error instanceof ReconciliationError && error.code === 'E_SCHEMA_CONTRACT'
  )
})

test('jobs.template_id requires exact same-side referenced template evidence', () => {
  const templateSentinel = 'private-template-id'
  const job = {
    id: 'job-with-template',
    template_id: templateSentinel,
    user_id: 'opaque-owner',
  }
  let caught
  try {
    reconcile('jobs', jobsSchema(), [job], [], {
      sourceTemplateIds: [],
      destinationTemplateIds: [],
    })
  } catch (error) {
    caught = error
  }

  assert.ok(caught instanceof ReconciliationError)
  assert.equal(caught.code, 'E_REFERENCE_ORPHAN')
  assert.doesNotMatch(
    JSON.stringify({ message: caught.message, details: caught.details }),
    /private-template-id/i
  )

  const valid = reconcile('jobs', jobsSchema(), [job], [job], {
    sourceTemplateIds: [templateSentinel],
    destinationTemplateIds: [templateSentinel],
  })
  assert.equal(valid.counts.equal, 1)
})

test('numeric primary-key tables require validated source and destination sequence state', () => {
  const row = {
    id: '5',
    storage_path: 'path',
    public_url: 'https://media.invalid/5',
  }
  assert.throws(
    () =>
      reconcile('assets', assetsSchema(), [row], [row], {
        sequenceProof: null,
      }),
    error =>
      error instanceof ReconciliationError && error.code === 'E_SEQUENCE_PROOF'
  )

  const invalid = sequenceProof('assets', [row], [row])
  invalid.destination.nextValue = '5'
  assert.throws(
    () =>
      reconcile('assets', assetsSchema(), [row], [row], {
        sequenceProof: invalid,
      }),
    error =>
      error instanceof ReconciliationError && error.code === 'E_SEQUENCE_PROOF'
  )

  const emptyOutOfBounds = sequenceProof('assets', [], [])
  emptyOutOfBounds.source.nextValue = '-1'
  assert.throws(
    () =>
      reconcile('assets', assetsSchema(), [], [], {
        sequenceProof: emptyOutOfBounds,
      }),
    error =>
      error instanceof ReconciliationError && error.code === 'E_SEQUENCE_PROOF'
  )
})

test('non-sequence tables require explicit null sequence proof', () => {
  assert.throws(
    () =>
      reconcile('jobs', jobsSchema(), [], [], {
        sequenceProof: {
          version: 1,
          column: 'id',
          source: { name: 'fake', maxValue: null, nextValue: '1' },
          destination: { name: 'fake', maxValue: null, nextValue: '1' },
        },
      }),
    error =>
      error instanceof ReconciliationError && error.code === 'E_SEQUENCE_PROOF'
  )
})

test('critical users and payments row conflicts fail closed with redacted errors', () => {
  const conflictCases = [
    {
      table: 'payments_v2',
      schema: paymentsSchema(),
      source: [{ id: '7', inv_id: 'invoice-redacted', stars: '30.00' }],
      destination: [{ id: '7', inv_id: 'invoice-redacted', stars: '31.00' }],
      sentinel: /invoice-redacted|30\.00|31\.00/i,
    },
    {
      table: 'users',
      schema: usersSchema(),
      source: [
        {
          id: '00000000-0000-0000-0000-000000000007',
          user_id: '11111111-1111-1111-1111-source-secret',
          inviter: null,
          display_name: null,
        },
      ],
      destination: [
        {
          id: '00000000-0000-0000-0000-000000000007',
          user_id: '22222222-2222-2222-2222-destination-secret',
          inviter: null,
          display_name: null,
        },
      ],
      sentinel: /source-secret|destination-secret/i,
    },
  ]

  for (const fixture of conflictCases) {
    let caught
    try {
      reconcile(
        fixture.table,
        fixture.schema,
        fixture.source,
        fixture.destination
      )
    } catch (error) {
      caught = error
    }
    assert.ok(caught instanceof ReconciliationError)
    assert.equal(caught.code, 'E_CRITICAL_ROW_CONFLICT')
    assert.doesNotMatch(
      JSON.stringify({ message: caught.message, details: caught.details }),
      fixture.sentinel
    )
  }
})

test('inherited-property objects are rejected rather than treated as JSON records', () => {
  const inherited = Object.create({ version: 1, tables: {} })
  assert.throws(
    () => reconcileDocument(inherited),
    error =>
      error instanceof ReconciliationError && error.code === 'E_INPUT_INVALID'
  )
})

test('JSON CLI is dry-run only and emits the same redacted deterministic summary', () => {
  const rows = [
    { id: 'job-secret', template_id: null, user_id: 'owner-secret' },
  ]
  const document = fullDocument({
    jobs: {
      schema: jobsSchema(),
      sourceRows: rows,
      destinationRows: rows,
    },
  })
  const expected = reconcileDocument(document)
  const run = spawnSync(process.execPath, [cli, '-'], {
    encoding: 'utf8',
    input: JSON.stringify(document),
    env: { PATH: process.env.PATH ?? '' },
  })

  assert.equal(run.status, 0, run.stderr)
  assert.equal(run.stderr, '')
  assert.deepEqual(JSON.parse(run.stdout), { ok: true, result: expected })
  assert.doesNotMatch(run.stdout, /job-secret|owner-secret/i)
})

test('CLI exits nonzero for critical payments and users conflicts without leaking values', () => {
  const documents = [
    {
      sentinel: /invoice-cli-secret|90\.00|91\.00/i,
      document: fullDocument({
        payments_v2: {
          schema: paymentsSchema(),
          sourceRows: [
            { id: '9', inv_id: 'invoice-cli-secret', stars: '90.00' },
          ],
          destinationRows: [
            { id: '9', inv_id: 'invoice-cli-secret', stars: '91.00' },
          ],
        },
      }),
    },
    {
      sentinel: /user-cli-source|user-cli-destination/i,
      document: fullDocument({
        users: {
          schema: usersSchema(),
          sourceRows: [
            {
              id: '00000000-0000-0000-0000-000000000009',
              user_id: '11111111-1111-1111-user-cli-source',
              inviter: null,
              display_name: null,
            },
          ],
          destinationRows: [
            {
              id: '00000000-0000-0000-0000-000000000009',
              user_id: '22222222-2222-2222-user-cli-destination',
              inviter: null,
              display_name: null,
            },
          ],
        },
      }),
    },
  ]

  for (const fixture of documents) {
    const run = spawnSync(process.execPath, [cli, '-'], {
      encoding: 'utf8',
      input: JSON.stringify(fixture.document),
      env: { PATH: process.env.PATH ?? '' },
    })
    assert.equal(run.status, 1)
    assert.equal(run.stdout, '')
    const output = JSON.parse(run.stderr)
    assert.equal(output.error.code, 'E_CRITICAL_ROW_CONFLICT')
    assert.doesNotMatch(run.stderr, fixture.sentinel)
  }
})

test('JSON CLI accepts stdin only and never treats an argument as a readable path', () => {
  const run = spawnSync(
    process.execPath,
    [cli, '/tmp/should-never-be-read.json'],
    {
      encoding: 'utf8',
      env: { PATH: process.env.PATH ?? '' },
    }
  )

  assert.equal(run.status, 2)
  const output = JSON.parse(run.stderr)
  assert.equal(output.ok, false)
  assert.equal(output.error.code, 'E_USAGE')
})
