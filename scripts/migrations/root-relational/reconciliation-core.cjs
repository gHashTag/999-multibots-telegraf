'use strict'

const {
  catalogFingerprint,
  changedColumns,
  digestCanonicalRow,
  digestCanonicalTuple,
  encodeCanonicalTuple,
  normalizeSchema,
  schemaFingerprint,
} = require('./canonical-row.cjs')
const { getTableContract } = require('./table-contracts.cjs')

const MANDATORY_TABLES = ['assets', 'jobs', 'payments_v2', 'users']
const SHA256_FINGERPRINT = /^sha256:[0-9a-f]{64}$/
const INTEGER_TEXT = /^-?(?:0|[1-9][0-9]*)$/

class ReconciliationError extends Error {
  constructor(code, message, details = {}) {
    super(message)
    this.name = 'ReconciliationError'
    this.code = code
    this.details = Object.freeze({ ...details })
  }

  toJSON() {
    return {
      code: this.code,
      message: this.message,
      details: this.details,
    }
  }
}

function sameStrings(left, right) {
  return (
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  )
}

function fail(code, message, details) {
  throw new ReconciliationError(code, message, details)
}

function assertExactObjectKeys(value, expected, code, message, details = {}) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    fail(code, message, details)
  }
  const prototype = Object.getPrototypeOf(value)
  if (prototype !== Object.prototype && prototype !== null) {
    fail(code, message, details)
  }
  const actual = Object.keys(value).sort()
  const sortedExpected = [...expected].sort()
  if (!sameStrings(actual, sortedExpected)) fail(code, message, details)
}

function normalizeSideSchema(table, sideName, rawSchema) {
  try {
    const schema = normalizeSchema(rawSchema)
    if (schema.table !== table) {
      fail('E_SCHEMA_CONTRACT', 'schema does not match the requested table', {
        table,
        side: sideName,
      })
    }
    return {
      schema,
      fingerprint: schemaFingerprint(schema),
    }
  } catch (error) {
    if (error instanceof ReconciliationError) throw error
    fail('E_SCHEMA_INVALID', 'schema descriptor is invalid', {
      table,
      side: sideName,
    })
  }
}

function assertSchemaContract(table, schema, contract) {
  if (!sameStrings(schema.primaryKey.columns, contract.primaryKey)) {
    fail('E_SCHEMA_CONTRACT', 'primary key does not match the table contract', {
      table,
    })
  }
  if (
    schema.primaryKey.deferrable !== contract.primaryKeyState.deferrable ||
    schema.primaryKey.initiallyDeferred !==
      contract.primaryKeyState.initiallyDeferred ||
    schema.primaryKey.validated !== contract.primaryKeyState.validated
  ) {
    fail('E_SCHEMA_CONTRACT', 'primary-key constraint state changed', { table })
  }

  for (const [name, expected] of Object.entries(contract.requiredColumns)) {
    const actual = schema.columns.find(column => column.name === name)
    if (
      !actual ||
      actual.type !== expected.type ||
      actual.nullable !== expected.nullable
    ) {
      fail(
        'E_SCHEMA_CONTRACT',
        'required column does not match the table contract',
        {
          table,
          column: name,
        }
      )
    }
  }

  for (const expected of contract.alternateKeys) {
    const actual = schema.uniqueKeys.find(key => key.name === expected.name)
    if (
      !actual ||
      !sameStrings(actual.columns, expected.columns) ||
      actual.nullsDistinct !== expected.nullsDistinct ||
      actual.deferrable !== expected.deferrable ||
      actual.initiallyDeferred !== expected.initiallyDeferred ||
      actual.validated !== expected.validated
    ) {
      fail('E_SCHEMA_CONTRACT', 'required alternate key is absent or changed', {
        table,
        constraint: expected.name,
      })
    }
  }

  for (const expected of contract.requiredForeignKeys) {
    const actual = schema.foreignKeys.find(key => key.name === expected.name)
    if (
      !actual ||
      !sameStrings(actual.columns, expected.columns) ||
      actual.referencedTable !== expected.referencedTable ||
      !sameStrings(actual.referencedColumns, expected.referencedColumns) ||
      actual.onUpdate !== expected.onUpdate ||
      actual.onDelete !== expected.onDelete ||
      actual.deferrable !== expected.deferrable ||
      actual.initiallyDeferred !== expected.initiallyDeferred ||
      actual.validated !== expected.validated
    ) {
      fail('E_SCHEMA_CONTRACT', 'required foreign key is absent or changed', {
        table,
        constraint: expected.name,
      })
    }
  }
}

function prepareRows(table, sideName, side, schema, contract) {
  assertExactObjectKeys(
    side,
    ['rows', 'schema'],
    'E_INPUT_INVALID',
    'table side fields are invalid',
    { table, side: sideName }
  )
  if (!Array.isArray(side.rows)) {
    fail('E_INPUT_INVALID', 'table rows must be an array', {
      table,
      side: sideName,
    })
  }

  const rowsByPrimaryKey = new Map()
  for (let index = 0; index < side.rows.length; index += 1) {
    const row = side.rows[index]
    let rowHash
    let primaryHash
    let primaryBytes
    try {
      rowHash = digestCanonicalRow(schema, row)
      primaryHash = digestCanonicalTuple(
        schema,
        row,
        contract.primaryKey,
        `primary-key:${table}`
      )
      primaryBytes = encodeCanonicalTuple(
        schema,
        row,
        contract.primaryKey,
        `primary-key:${table}`
      )
    } catch {
      fail('E_ROW_INVALID', 'row does not match the typed-text schema', {
        table,
        side: sideName,
        row: index,
      })
    }

    const existing = rowsByPrimaryKey.get(primaryHash)
    if (existing) {
      if (!existing.primaryBytes.equals(primaryBytes)) {
        fail(
          'E_HASH_COLLISION',
          'canonical primary-key hash collision detected',
          {
            table,
            side: sideName,
          }
        )
      }
      fail('E_PRIMARY_KEY_DUPLICATE', 'duplicate primary key in snapshot', {
        table,
        side: sideName,
      })
    }
    rowsByPrimaryKey.set(primaryHash, { row, rowHash, primaryBytes })
  }

  return rowsByPrimaryKey
}

function buildAlternateKeyMap(table, sideName, schema, rows, alternateKey) {
  const map = new Map()
  for (const rowState of rows.values()) {
    if (
      alternateKey.skipIfAnyNull &&
      alternateKey.columns.some(column => rowState.row[column] === null)
    ) {
      continue
    }
    const domain = `alternate-key:${table}:${alternateKey.name}`
    const alternateHash = digestCanonicalTuple(
      schema,
      rowState.row,
      alternateKey.columns,
      domain
    )
    const alternateBytes = encodeCanonicalTuple(
      schema,
      rowState.row,
      alternateKey.columns,
      domain
    )
    const existing = map.get(alternateHash)
    if (existing) {
      if (!existing.alternateBytes.equals(alternateBytes)) {
        fail(
          'E_HASH_COLLISION',
          'canonical alternate-key hash collision detected',
          {
            table,
            side: sideName,
            constraint: alternateKey.name,
          }
        )
      }
      if (!existing.primaryBytes.equals(rowState.primaryBytes)) {
        fail(
          'E_ALTERNATE_KEY_CONFLICT',
          'alternate key maps to multiple primary keys',
          {
            table,
            side: sideName,
            constraint: alternateKey.name,
          }
        )
      }
    } else {
      map.set(alternateHash, {
        alternateBytes,
        primaryBytes: rowState.primaryBytes,
      })
    }
  }
  return map
}

function assertAlternateKeys(
  table,
  schema,
  contract,
  sourceRows,
  destinationRows
) {
  for (const alternateKey of contract.alternateKeys) {
    const source = buildAlternateKeyMap(
      table,
      'source',
      schema,
      sourceRows,
      alternateKey
    )
    const destination = buildAlternateKeyMap(
      table,
      'destination',
      schema,
      destinationRows,
      alternateKey
    )
    for (const [alternateHash, sourceState] of source) {
      const destinationState = destination.get(alternateHash)
      if (!destinationState) continue
      if (!sourceState.alternateBytes.equals(destinationState.alternateBytes)) {
        fail(
          'E_HASH_COLLISION',
          'canonical alternate-key hash collision detected',
          {
            table,
            constraint: alternateKey.name,
          }
        )
      }
      if (!sourceState.primaryBytes.equals(destinationState.primaryBytes)) {
        fail(
          'E_ALTERNATE_KEY_CONFLICT',
          'alternate key changed primary-key ownership',
          {
            table,
            constraint: alternateKey.name,
          }
        )
      }
    }
  }
}

function assertOwnerLinks(table, sideName, schema, contract, rows) {
  for (const ownerLink of contract.ownerLinks) {
    const domain = `owner-link:${table}:${ownerLink.name}`
    const referenced = new Map()
    for (const rowState of rows.values()) {
      const hash = digestCanonicalTuple(
        schema,
        rowState.row,
        ownerLink.referencedColumns,
        domain
      )
      const bytes = encodeCanonicalTuple(
        schema,
        rowState.row,
        ownerLink.referencedColumns,
        domain
      )
      const existing = referenced.get(hash)
      if (existing && !existing.equals(bytes)) {
        fail(
          'E_HASH_COLLISION',
          'canonical owner-link hash collision detected',
          {
            table,
            side: sideName,
            link: ownerLink.name,
          }
        )
      }
      referenced.set(hash, bytes)
    }

    for (const rowState of rows.values()) {
      if (
        ownerLink.skipIfAnyNull &&
        ownerLink.columns.some(column => rowState.row[column] === null)
      ) {
        continue
      }
      const hash = digestCanonicalTuple(
        schema,
        rowState.row,
        ownerLink.columns,
        domain
      )
      const bytes = encodeCanonicalTuple(
        schema,
        rowState.row,
        ownerLink.columns,
        domain
      )
      const target = referenced.get(hash)
      if (!target || !target.equals(bytes)) {
        fail(
          'E_OWNER_LINK_ORPHAN',
          'owner link has no target in the same snapshot',
          {
            table,
            side: sideName,
            link: ownerLink.name,
          }
        )
      }
    }
  }
}

function parseIntegerText(value, table, side, field) {
  if (typeof value !== 'string' || !INTEGER_TEXT.test(value)) {
    fail('E_SEQUENCE_PROOF', 'sequence proof contains invalid integer text', {
      table,
      side,
      field,
    })
  }
  return BigInt(value)
}

function actualMaximum(table, sideName, rows, column) {
  let maximum = null
  for (const rowState of rows.values()) {
    const value = parseIntegerText(
      rowState.row[column],
      table,
      sideName,
      'row_primary_key'
    )
    if (maximum === null || value > maximum) maximum = value
  }
  return maximum
}

function assertSequenceState(
  table,
  sideName,
  rawState,
  expectedName,
  actualMax,
  schemaSequence
) {
  assertExactObjectKeys(
    rawState,
    ['maxValue', 'name', 'nextValue'],
    'E_SEQUENCE_PROOF',
    'sequence state fields are invalid',
    { table, side: sideName }
  )
  if (rawState.name !== expectedName) {
    fail('E_SEQUENCE_PROOF', 'sequence state names the wrong sequence', {
      table,
      side: sideName,
    })
  }
  if (rawState.maxValue !== null && typeof rawState.maxValue !== 'string') {
    fail('E_SEQUENCE_PROOF', 'sequence maximum must be integer text or null', {
      table,
      side: sideName,
    })
  }
  const declaredMax =
    rawState.maxValue === null
      ? null
      : parseIntegerText(rawState.maxValue, table, sideName, 'maxValue')
  if (declaredMax !== actualMax) {
    fail('E_SEQUENCE_PROOF', 'sequence maximum does not match snapshot rows', {
      table,
      side: sideName,
    })
  }
  const nextValue = parseIntegerText(
    rawState.nextValue,
    table,
    sideName,
    'nextValue'
  )
  const sequenceMin = BigInt(schemaSequence.min)
  const sequenceMax = BigInt(schemaSequence.max)
  if (nextValue < sequenceMin || nextValue > sequenceMax) {
    fail('E_SEQUENCE_PROOF', 'sequence next value is outside schema bounds', {
      table,
      side: sideName,
    })
  }
  if (
    actualMax !== null &&
    (actualMax < sequenceMin || actualMax > sequenceMax)
  ) {
    fail(
      'E_SEQUENCE_PROOF',
      'table maximum is outside schema sequence bounds',
      {
        table,
        side: sideName,
      }
    )
  }
  if (actualMax !== null && nextValue <= actualMax) {
    fail(
      'E_SEQUENCE_PROOF',
      'sequence next value does not clear the table maximum',
      {
        table,
        side: sideName,
      }
    )
  }
  return true
}

function assertSequenceProof(
  table,
  schema,
  contract,
  proof,
  sourceRows,
  destinationRows
) {
  if (contract.sequence === null) {
    if (proof !== null || schema.sequences.length !== 0) {
      fail(
        'E_SEQUENCE_PROOF',
        'non-sequence table must carry an explicit null proof',
        {
          table,
        }
      )
    }
    return true
  }

  assertExactObjectKeys(
    proof,
    ['column', 'destination', 'source', 'version'],
    'E_SEQUENCE_PROOF',
    'sequence proof fields are invalid',
    { table }
  )
  if (proof.version !== 1 || proof.column !== contract.sequence.column) {
    fail('E_SEQUENCE_PROOF', 'sequence proof version or column is invalid', {
      table,
    })
  }
  const schemaSequences = schema.sequences.filter(
    sequence =>
      sequence.name === contract.sequence.name &&
      sequence.column === contract.sequence.column
  )
  if (
    schemaSequences.length !== 1 ||
    schemaSequences[0].increment !== contract.sequence.increment ||
    schemaSequences[0].cycle !== contract.sequence.cycle
  ) {
    fail(
      'E_SEQUENCE_PROOF',
      'schema sequence does not match the table contract',
      {
        table,
      }
    )
  }

  const sourceMax = actualMaximum(
    table,
    'source',
    sourceRows,
    contract.sequence.column
  )
  const destinationMax = actualMaximum(
    table,
    'destination',
    destinationRows,
    contract.sequence.column
  )
  assertSequenceState(
    table,
    'source',
    proof.source,
    contract.sequence.name,
    sourceMax,
    schemaSequences[0]
  )
  assertSequenceState(
    table,
    'destination',
    proof.destination,
    contract.sequence.name,
    destinationMax,
    schemaSequences[0]
  )
  return true
}

function referenceSet(table, sideName, rawIds) {
  if (!Array.isArray(rawIds)) {
    fail('E_REFERENCE_PROOF', 'reference IDs must be an array', {
      table,
      side: sideName,
    })
  }
  const values = new Set()
  for (const value of rawIds) {
    if (typeof value !== 'string' || values.has(value)) {
      fail('E_REFERENCE_PROOF', 'reference IDs must be unique typed text', {
        table,
        side: sideName,
      })
    }
    values.add(value)
  }
  return values
}

function assertReferenceProof(
  table,
  contract,
  proof,
  sourceRows,
  destinationRows
) {
  if (contract.externalReferences === null) {
    if (proof !== null) {
      fail(
        'E_REFERENCE_PROOF',
        'table without external references requires null proof',
        {
          table,
        }
      )
    }
    return true
  }

  assertExactObjectKeys(
    proof,
    ['templates', 'version'],
    'E_REFERENCE_PROOF',
    'reference proof fields are invalid',
    { table }
  )
  if (proof.version !== 1) {
    fail('E_REFERENCE_PROOF', 'reference proof version is unsupported', {
      table,
    })
  }
  assertExactObjectKeys(
    proof.templates,
    ['destinationIds', 'sourceIds'],
    'E_REFERENCE_PROOF',
    'template reference proof fields are invalid',
    { table }
  )
  const sourceIds = referenceSet(table, 'source', proof.templates.sourceIds)
  const destinationIds = referenceSet(
    table,
    'destination',
    proof.templates.destinationIds
  )

  for (const [sideName, rows, ids] of [
    ['source', sourceRows, sourceIds],
    ['destination', destinationRows, destinationIds],
  ]) {
    for (const rowState of rows.values()) {
      const reference = rowState.row[contract.externalReferences.column]
      if (reference !== null && !ids.has(reference)) {
        fail(
          'E_REFERENCE_ORPHAN',
          'row reference is absent from same-side evidence',
          {
            table,
            side: sideName,
            reference: contract.externalReferences.name,
          }
        )
      }
    }
  }
  return true
}

function reconcileTable(input) {
  assertExactObjectKeys(
    input,
    ['destination', 'referenceProof', 'sequenceProof', 'source', 'table'],
    'E_INPUT_INVALID',
    'table reconciliation fields are invalid'
  )
  const table = input.table
  const contract = typeof table === 'string' ? getTableContract(table) : null
  if (!contract)
    fail('E_TABLE_UNSUPPORTED', 'table is outside the reconciliation scope')

  const sourceSchemaState = normalizeSideSchema(
    table,
    'source',
    input.source?.schema
  )
  const destinationSchemaState = normalizeSideSchema(
    table,
    'destination',
    input.destination?.schema
  )
  if (sourceSchemaState.fingerprint !== destinationSchemaState.fingerprint) {
    fail(
      'E_SCHEMA_MISMATCH',
      'source and destination schema fingerprints differ',
      {
        table,
        sourceFingerprint: sourceSchemaState.fingerprint,
        destinationFingerprint: destinationSchemaState.fingerprint,
      }
    )
  }

  assertSchemaContract(table, sourceSchemaState.schema, contract)
  const sourceRows = prepareRows(
    table,
    'source',
    input.source,
    sourceSchemaState.schema,
    contract
  )
  const destinationRows = prepareRows(
    table,
    'destination',
    input.destination,
    sourceSchemaState.schema,
    contract
  )

  assertSequenceProof(
    table,
    sourceSchemaState.schema,
    contract,
    input.sequenceProof,
    sourceRows,
    destinationRows
  )
  assertReferenceProof(
    table,
    contract,
    input.referenceProof,
    sourceRows,
    destinationRows
  )

  assertAlternateKeys(
    table,
    sourceSchemaState.schema,
    contract,
    sourceRows,
    destinationRows
  )
  assertOwnerLinks(
    table,
    'source',
    sourceSchemaState.schema,
    contract,
    sourceRows
  )
  assertOwnerLinks(
    table,
    'destination',
    sourceSchemaState.schema,
    contract,
    destinationRows
  )

  const counts = {
    source_only: 0,
    destination_only: 0,
    equal: 0,
    true_conflict: 0,
  }
  const changedColumnCounts = new Map()
  const primaryHashes = [
    ...new Set([...sourceRows.keys(), ...destinationRows.keys()]),
  ].sort()

  for (const primaryHash of primaryHashes) {
    const source = sourceRows.get(primaryHash)
    const destination = destinationRows.get(primaryHash)
    if (!source) {
      counts.destination_only += 1
      continue
    }
    if (!destination) {
      counts.source_only += 1
      continue
    }
    if (!source.primaryBytes.equals(destination.primaryBytes)) {
      fail(
        'E_HASH_COLLISION',
        'canonical primary-key hash collision detected',
        { table }
      )
    }

    const differences = changedColumns(
      sourceSchemaState.schema,
      source.row,
      destination.row
    )
    if (differences.length === 0) {
      if (source.rowHash !== destination.rowHash) {
        fail(
          'E_CANONICALIZATION',
          'equal rows produced different canonical hashes',
          {
            table,
          }
        )
      }
      counts.equal += 1
      continue
    }
    if (source.rowHash === destination.rowHash) {
      fail(
        'E_HASH_COLLISION',
        'different rows produced the same canonical hash',
        { table }
      )
    }
    if (contract.criticalConflicts) {
      fail(
        'E_CRITICAL_ROW_CONFLICT',
        'critical table contains a true row conflict',
        {
          table,
          changedColumns: differences,
        }
      )
    }
    counts.true_conflict += 1
    for (const column of differences) {
      changedColumnCounts.set(
        column,
        (changedColumnCounts.get(column) ?? 0) + 1
      )
    }
  }

  const changedColumnsSummary = Object.fromEntries(
    [...changedColumnCounts.entries()].sort(([left], [right]) =>
      left < right ? -1 : left > right ? 1 : 0
    )
  )
  const tableConverged =
    counts.source_only === 0 &&
    counts.destination_only === 0 &&
    counts.true_conflict === 0

  return {
    table,
    schemaFingerprint: sourceSchemaState.fingerprint,
    counts,
    changedColumns: changedColumnsSummary,
    sequenceProofVerified: true,
    referenceProofVerified: true,
    tableConverged,
  }
}

function assertFingerprint(value, code, message, details = {}) {
  if (typeof value !== 'string' || !SHA256_FINGERPRINT.test(value)) {
    fail(code, message, details)
  }
  return value
}

function validateCatalogProof(proof, tables) {
  assertExactObjectKeys(
    proof,
    [
      'destinationCatalogFingerprint',
      'expectedCatalogFingerprint',
      'sourceCatalogFingerprint',
      'tables',
      'version',
    ],
    'E_CATALOG_PROOF',
    'catalog proof fields are invalid'
  )
  if (proof.version !== 1) {
    fail('E_CATALOG_PROOF', 'catalog proof version is unsupported')
  }
  assertExactObjectKeys(
    proof.tables,
    MANDATORY_TABLES,
    'E_CATALOG_PROOF',
    'catalog proof table set is invalid'
  )

  const expectedSeals = {}
  const sourceSeals = {}
  const destinationSeals = {}
  for (const table of MANDATORY_TABLES) {
    const seal = proof.tables[table]
    assertExactObjectKeys(
      seal,
      [
        'destinationSchemaFingerprint',
        'expectedSchemaFingerprint',
        'sourceSchemaFingerprint',
      ],
      'E_CATALOG_PROOF',
      'catalog table seal fields are invalid',
      { table }
    )
    const expected = assertFingerprint(
      seal.expectedSchemaFingerprint,
      'E_CATALOG_PROOF',
      'expected schema fingerprint is invalid',
      { table }
    )
    const source = assertFingerprint(
      seal.sourceSchemaFingerprint,
      'E_CATALOG_PROOF',
      'source schema fingerprint is invalid',
      { table }
    )
    const destination = assertFingerprint(
      seal.destinationSchemaFingerprint,
      'E_CATALOG_PROOF',
      'destination schema fingerprint is invalid',
      { table }
    )

    let actualSource
    let actualDestination
    try {
      actualSource = schemaFingerprint(tables[table].source.schema)
      actualDestination = schemaFingerprint(tables[table].destination.schema)
    } catch {
      fail('E_CATALOG_PROOF', 'catalog table schema cannot be fingerprinted', {
        table,
      })
    }
    if (
      expected !== source ||
      expected !== destination ||
      source !== actualSource ||
      destination !== actualDestination
    ) {
      fail(
        'E_CATALOG_PROOF',
        'catalog table seal does not bind all schema states',
        {
          table,
        }
      )
    }
    expectedSeals[table] = expected
    sourceSeals[table] = source
    destinationSeals[table] = destination
  }

  const expectedCatalog = catalogFingerprint(expectedSeals)
  const sourceCatalog = catalogFingerprint(sourceSeals)
  const destinationCatalog = catalogFingerprint(destinationSeals)
  for (const [field, supplied, actual] of [
    ['expected', proof.expectedCatalogFingerprint, expectedCatalog],
    ['source', proof.sourceCatalogFingerprint, sourceCatalog],
    ['destination', proof.destinationCatalogFingerprint, destinationCatalog],
  ]) {
    assertFingerprint(
      supplied,
      'E_CATALOG_PROOF',
      'catalog fingerprint is invalid',
      { catalog: field }
    )
    if (supplied !== actual) {
      fail(
        'E_CATALOG_PROOF',
        'catalog fingerprint does not match table seals',
        {
          catalog: field,
        }
      )
    }
  }
  if (
    expectedCatalog !== sourceCatalog ||
    expectedCatalog !== destinationCatalog
  ) {
    fail('E_CATALOG_PROOF', 'catalog states do not match the expected catalog')
  }
  return true
}

function reconcileDocument(document) {
  assertExactObjectKeys(
    document,
    ['catalogProof', 'tables', 'version'],
    'E_INPUT_INVALID',
    'reconciliation document fields are invalid'
  )
  if (document.version !== 1) {
    fail(
      'E_VERSION_UNSUPPORTED',
      'reconciliation document version is unsupported'
    )
  }
  assertExactObjectKeys(
    document.tables,
    MANDATORY_TABLES,
    'E_TABLE_SET',
    'reconciliation requires the exact mandatory table set'
  )
  validateCatalogProof(document.catalogProof, document.tables)

  const tables = {}
  for (const table of MANDATORY_TABLES) {
    const value = document.tables[table]
    assertExactObjectKeys(
      value,
      ['destination', 'referenceProof', 'sequenceProof', 'source'],
      'E_INPUT_INVALID',
      'table document fields are invalid',
      { table }
    )
    tables[table] = reconcileTable({ table, ...value })
  }
  const converged = MANDATORY_TABLES.every(
    table => tables[table].tableConverged
  )
  return {
    version: 1,
    catalogProofVerified: true,
    productionReady: false,
    productionReadinessReason: 'catalog_provenance_unauthenticated',
    converged,
    tables,
  }
}

module.exports = {
  ReconciliationError,
  reconcileDocument,
  reconcileTable,
}
