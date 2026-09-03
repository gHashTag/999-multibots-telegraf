'use strict'

const { createHash } = require('node:crypto')

const TOP_LEVEL_SCHEMA_KEYS = new Set([
  'table',
  'columns',
  'primaryKey',
  'uniqueKeys',
  'foreignKeys',
  'checks',
  'enums',
  'sequences',
])
const COLUMN_KEYS = new Set([
  'name',
  'type',
  'ordinal',
  'nullable',
  'default',
  'identity',
  'generated',
  'collation',
])
const PRIMARY_KEY_KEYS = new Set([
  'name',
  'columns',
  'deferrable',
  'initiallyDeferred',
  'validated',
])
const UNIQUE_KEY_KEYS = new Set([
  'name',
  'columns',
  'nullsDistinct',
  'deferrable',
  'initiallyDeferred',
  'validated',
])
const FOREIGN_KEY_KEYS = new Set([
  'name',
  'columns',
  'referencedTable',
  'referencedColumns',
  'onUpdate',
  'onDelete',
  'deferrable',
  'initiallyDeferred',
  'validated',
])
const CHECK_KEYS = new Set(['name', 'expression', 'validated'])
const ENUM_KEYS = new Set(['name', 'labels'])
const SEQUENCE_KEYS = new Set([
  'name',
  'column',
  'increment',
  'start',
  'min',
  'max',
  'cycle',
])
const FK_ACTIONS = new Set([
  'NO ACTION',
  'RESTRICT',
  'CASCADE',
  'SET NULL',
  'SET DEFAULT',
])
const CATALOG_TABLES = ['assets', 'jobs', 'payments_v2', 'users']
const INTEGER_TEXT = /^-?(?:0|[1-9][0-9]*)$/

function assertPlainObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`${label} must be a plain object`)
  }
  const prototype = Object.getPrototypeOf(value)
  if (prototype !== Object.prototype && prototype !== null) {
    throw new TypeError(`${label} must not inherit application properties`)
  }
}

function assertKnownKeys(value, allowed, label) {
  for (const key of Object.keys(value)) {
    if (!allowed.has(key))
      throw new TypeError(`${label} contains unknown field ${key}`)
  }
}

function assertString(value, label) {
  if (typeof value !== 'string' || value.length === 0) {
    throw new TypeError(`${label} must be a non-empty string`)
  }
  return value
}

function normalizeStringArray(value, label) {
  if (!Array.isArray(value) || value.length === 0) {
    throw new TypeError(`${label} must be a non-empty string array`)
  }
  return value.map((item, index) => assertString(item, `${label}[${index}]`))
}

function normalizeConstraintState(raw, label) {
  for (const field of ['deferrable', 'initiallyDeferred', 'validated']) {
    if (typeof raw[field] !== 'boolean') {
      throw new TypeError(`${label}.${field} must be boolean`)
    }
  }
  if (raw.initiallyDeferred && !raw.deferrable) {
    throw new TypeError(
      `${label} cannot be initially deferred when not deferrable`
    )
  }
  return {
    deferrable: raw.deferrable,
    initiallyDeferred: raw.initiallyDeferred,
    validated: raw.validated,
  }
}

function normalizeIntegerText(value, label) {
  if (typeof value !== 'string' || !INTEGER_TEXT.test(value)) {
    throw new TypeError(`${label} must be canonical integer text`)
  }
  return value
}

function stableValue(value, label = 'value') {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'boolean'
  ) {
    return value
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value))
      throw new TypeError(`${label} must be finite JSON`)
    return value
  }
  if (Array.isArray(value)) {
    return value.map((item, index) => stableValue(item, `${label}[${index}]`))
  }
  assertPlainObject(value, label)
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map(key => [key, stableValue(value[key], `${label}.${key}`)])
  )
}

function stableStringify(value) {
  return JSON.stringify(stableValue(value))
}

function sortCanonical(values) {
  return values
    .map(value => stableValue(value))
    .sort((left, right) => {
      const leftText = stableStringify(left)
      const rightText = stableStringify(right)
      return leftText < rightText ? -1 : leftText > rightText ? 1 : 0
    })
}

function normalizeSchema(schema) {
  assertPlainObject(schema, 'schema')
  assertKnownKeys(schema, TOP_LEVEL_SCHEMA_KEYS, 'schema')

  const table = assertString(schema.table, 'schema.table')
  if (!Array.isArray(schema.columns) || schema.columns.length === 0) {
    throw new TypeError('schema.columns must be a non-empty array')
  }

  const columnNames = new Set()
  const ordinals = new Set()
  const columns = schema.columns
    .map((raw, index) => {
      assertPlainObject(raw, `schema.columns[${index}]`)
      assertKnownKeys(raw, COLUMN_KEYS, `schema.columns[${index}]`)
      const name = assertString(raw.name, `schema.columns[${index}].name`)
      const type = assertString(raw.type, `schema.columns[${index}].type`)
      if (!Number.isInteger(raw.ordinal) || raw.ordinal < 1) {
        throw new TypeError(
          `schema.columns[${index}].ordinal must be a positive integer`
        )
      }
      if (typeof raw.nullable !== 'boolean') {
        throw new TypeError(`schema.columns[${index}].nullable must be boolean`)
      }
      if (columnNames.has(name))
        throw new TypeError(`schema has duplicate column ${name}`)
      if (ordinals.has(raw.ordinal)) {
        throw new TypeError(`schema has duplicate ordinal ${raw.ordinal}`)
      }
      columnNames.add(name)
      ordinals.add(raw.ordinal)

      for (const field of ['default', 'collation']) {
        if (raw[field] !== null && typeof raw[field] !== 'string') {
          throw new TypeError(
            `schema.columns[${index}].${field} must be string or null`
          )
        }
      }
      for (const field of ['identity', 'generated']) {
        if (typeof raw[field] !== 'string') {
          throw new TypeError(
            `schema.columns[${index}].${field} must be string`
          )
        }
      }

      return {
        name,
        type,
        ordinal: raw.ordinal,
        nullable: raw.nullable,
        default: raw.default,
        identity: raw.identity,
        generated: raw.generated,
        collation: raw.collation,
      }
    })
    .sort((left, right) => left.ordinal - right.ordinal)

  assertPlainObject(schema.primaryKey, 'schema.primaryKey')
  assertKnownKeys(schema.primaryKey, PRIMARY_KEY_KEYS, 'schema.primaryKey')
  const primaryKey = {
    name: assertString(schema.primaryKey.name, 'schema.primaryKey.name'),
    columns: normalizeStringArray(
      schema.primaryKey.columns,
      'schema.primaryKey.columns'
    ),
    ...normalizeConstraintState(schema.primaryKey, 'schema.primaryKey'),
  }

  for (const name of primaryKey.columns) {
    const pkColumn = columns.find(column => column.name === name)
    if (!pkColumn)
      throw new TypeError(`primary key references unknown column ${name}`)
    if (pkColumn.nullable)
      throw new TypeError(`primary key column ${name} is nullable`)
  }

  const uniqueKeys = normalizeConstraints(
    schema.uniqueKeys,
    'schema.uniqueKeys',
    UNIQUE_KEY_KEYS,
    raw => ({
      name: assertString(raw.name, 'unique key name'),
      columns: normalizeStringArray(raw.columns, 'unique key columns'),
      nullsDistinct: assertBoolean(
        raw.nullsDistinct,
        'unique key nullsDistinct'
      ),
      ...normalizeConstraintState(raw, 'unique key'),
    }),
    columnNames
  )
  const foreignKeys = normalizeConstraints(
    schema.foreignKeys,
    'schema.foreignKeys',
    FOREIGN_KEY_KEYS,
    raw => ({
      name: assertString(raw.name, 'foreign key name'),
      columns: normalizeStringArray(raw.columns, 'foreign key columns'),
      referencedTable: assertString(
        raw.referencedTable,
        'foreign key referencedTable'
      ),
      referencedColumns: normalizeStringArray(
        raw.referencedColumns,
        'foreign key referencedColumns'
      ),
      onUpdate: raw.onUpdate ?? null,
      onDelete: raw.onDelete ?? null,
      ...normalizeConstraintState(raw, 'foreign key'),
    }),
    columnNames
  )
  for (const foreignKey of foreignKeys) {
    if (foreignKey.columns.length !== foreignKey.referencedColumns.length) {
      throw new TypeError(
        `foreign key ${foreignKey.name} has mismatched column arity`
      )
    }
    if (
      !FK_ACTIONS.has(foreignKey.onUpdate) ||
      !FK_ACTIONS.has(foreignKey.onDelete)
    ) {
      throw new TypeError(`foreign key ${foreignKey.name} has invalid action`)
    }
  }

  const checks = normalizeChecks(schema.checks)
  const enums = normalizeEnums(schema.enums)
  const sequences = normalizeSequences(schema.sequences, columnNames)

  return {
    table,
    columns,
    primaryKey,
    uniqueKeys,
    foreignKeys,
    checks,
    enums,
    sequences,
  }
}

function normalizeConstraints(
  rawValue,
  label,
  allowedKeys,
  mapper,
  columnNames
) {
  if (!Array.isArray(rawValue)) throw new TypeError(`${label} must be an array`)
  const names = new Set()
  const normalized = rawValue.map((raw, index) => {
    assertPlainObject(raw, `${label}[${index}]`)
    assertKnownKeys(raw, allowedKeys, `${label}[${index}]`)
    const value = mapper(raw)
    if (names.has(value.name))
      throw new TypeError(`${label} has duplicate name ${value.name}`)
    names.add(value.name)
    for (const name of value.columns) {
      if (!columnNames.has(name)) {
        throw new TypeError(`${label} references unknown column ${name}`)
      }
    }
    return value
  })
  return sortCanonical(normalized)
}

function assertBoolean(value, label) {
  if (typeof value !== 'boolean')
    throw new TypeError(`${label} must be boolean`)
  return value
}

function normalizeChecks(rawValue) {
  if (!Array.isArray(rawValue))
    throw new TypeError('schema.checks must be an array')
  const names = new Set()
  const checks = rawValue.map((raw, index) => {
    assertPlainObject(raw, `schema.checks[${index}]`)
    assertKnownKeys(raw, CHECK_KEYS, `schema.checks[${index}]`)
    const name = assertString(raw.name, `schema.checks[${index}].name`)
    if (names.has(name))
      throw new TypeError(`schema.checks has duplicate name ${name}`)
    names.add(name)
    return {
      name,
      expression: assertString(
        raw.expression,
        `schema.checks[${index}].expression`
      ),
      validated: assertBoolean(
        raw.validated,
        `schema.checks[${index}].validated`
      ),
    }
  })
  return sortCanonical(checks)
}

function normalizeEnums(rawValue) {
  if (!Array.isArray(rawValue))
    throw new TypeError('schema.enums must be an array')
  const names = new Set()
  const enums = rawValue.map((raw, index) => {
    assertPlainObject(raw, `schema.enums[${index}]`)
    assertKnownKeys(raw, ENUM_KEYS, `schema.enums[${index}]`)
    const name = assertString(raw.name, `schema.enums[${index}].name`)
    if (names.has(name))
      throw new TypeError(`schema.enums has duplicate name ${name}`)
    names.add(name)
    const labels = normalizeStringArray(
      raw.labels,
      `schema.enums[${index}].labels`
    )
    if (new Set(labels).size !== labels.length) {
      throw new TypeError(`schema.enums[${index}].labels contains duplicates`)
    }
    return { name, labels }
  })
  return sortCanonical(enums)
}

function normalizeSequences(rawValue, columnNames) {
  if (!Array.isArray(rawValue))
    throw new TypeError('schema.sequences must be an array')
  const names = new Set()
  const sequences = rawValue.map((raw, index) => {
    assertPlainObject(raw, `schema.sequences[${index}]`)
    assertKnownKeys(raw, SEQUENCE_KEYS, `schema.sequences[${index}]`)
    const name = assertString(raw.name, `schema.sequences[${index}].name`)
    if (names.has(name))
      throw new TypeError(`schema.sequences has duplicate name ${name}`)
    names.add(name)
    const column = assertString(raw.column, `schema.sequences[${index}].column`)
    if (!columnNames.has(column)) {
      throw new TypeError(
        `schema.sequences[${index}] references unknown column ${column}`
      )
    }
    const increment = normalizeIntegerText(
      raw.increment,
      `schema.sequences[${index}].increment`
    )
    const start = normalizeIntegerText(
      raw.start,
      `schema.sequences[${index}].start`
    )
    const min = normalizeIntegerText(raw.min, `schema.sequences[${index}].min`)
    const max = normalizeIntegerText(raw.max, `schema.sequences[${index}].max`)
    if (BigInt(increment) === 0n) {
      throw new TypeError(
        `schema.sequences[${index}].increment must not be zero`
      )
    }
    if (
      BigInt(min) > BigInt(max) ||
      BigInt(start) < BigInt(min) ||
      BigInt(start) > BigInt(max)
    ) {
      throw new TypeError(`schema.sequences[${index}] bounds are invalid`)
    }
    return {
      name,
      column,
      increment,
      start,
      min,
      max,
      cycle: assertBoolean(raw.cycle, `schema.sequences[${index}].cycle`),
    }
  })
  return sortCanonical(sequences)
}

function schemaFingerprint(schema) {
  const normalized = normalizeSchema(schema)
  return `sha256:${createHash('sha256').update(stableStringify(normalized)).digest('hex')}`
}

function catalogFingerprint(tableFingerprints) {
  assertPlainObject(tableFingerprints, 'catalog table fingerprints')
  const tables = Object.keys(tableFingerprints).sort()
  if (
    tables.length !== CATALOG_TABLES.length ||
    tables.some((table, index) => table !== CATALOG_TABLES[index])
  ) {
    throw new TypeError(
      'catalog fingerprint requires the exact mandatory table set'
    )
  }
  const parts = [frame('root-relational-catalog-v1')]
  for (const table of CATALOG_TABLES) {
    const fingerprint = tableFingerprints[table]
    if (
      typeof fingerprint !== 'string' ||
      !/^sha256:[0-9a-f]{64}$/.test(fingerprint)
    ) {
      throw new TypeError(`catalog table ${table} fingerprint is invalid`)
    }
    parts.push(frame(table), frame(fingerprint))
  }
  return `sha256:${createHash('sha256').update(Buffer.concat(parts)).digest('hex')}`
}

function frame(value) {
  const bytes = Buffer.from(value, 'utf8')
  const length = Buffer.allocUnsafe(4)
  length.writeUInt32BE(bytes.length)
  return Buffer.concat([length, bytes])
}

function validateTypedTextRow(normalizedSchema, row) {
  assertPlainObject(row, 'row')
  const expected = new Set(normalizedSchema.columns.map(column => column.name))
  for (const key of Object.keys(row)) {
    if (!expected.has(key))
      throw new TypeError(`row contains unknown column ${key}`)
  }
  for (const column of normalizedSchema.columns) {
    if (!Object.hasOwn(row, column.name)) {
      throw new TypeError(`row is missing column ${column.name}`)
    }
    const value = row[column.name]
    if (value !== null && typeof value !== 'string') {
      throw new TypeError(
        `row column ${column.name} must be typed text or null`
      )
    }
    if (value === null && !column.nullable) {
      throw new TypeError(`row column ${column.name} is non-nullable`)
    }
  }
}

function encodeTuple(normalizedSchema, row, columnNames, domain, includeNames) {
  validateTypedTextRow(normalizedSchema, row)
  const columns = columnNames.map(name => {
    const column = normalizedSchema.columns.find(
      candidate => candidate.name === name
    )
    if (!column) throw new TypeError(`tuple references unknown column ${name}`)
    return column
  })
  const parts = [
    frame('root-relational-v1'),
    frame(domain),
    frame(normalizedSchema.table),
  ]
  for (const column of columns) {
    if (includeNames) parts.push(frame(column.name))
    parts.push(frame(column.type))
    const value = row[column.name]
    parts.push(frame(value === null ? 'null' : 'text'))
    if (value !== null) parts.push(frame(value))
  }
  return Buffer.concat(parts)
}

function encodeCanonicalRow(schema, row) {
  const normalized = normalizeSchema(schema)
  return encodeTuple(
    normalized,
    row,
    normalized.columns.map(column => column.name),
    `row:${schemaFingerprint(normalized)}`,
    true
  )
}

function digestCanonicalRow(schema, row) {
  return `sha256:${createHash('sha256').update(encodeCanonicalRow(schema, row)).digest('hex')}`
}

function digestCanonicalTuple(schema, row, columnNames, domain) {
  const normalized = normalizeSchema(schema)
  return `sha256:${createHash('sha256')
    .update(encodeTuple(normalized, row, columnNames, domain, false))
    .digest('hex')}`
}

function encodeCanonicalTuple(schema, row, columnNames, domain) {
  const normalized = normalizeSchema(schema)
  return encodeTuple(normalized, row, columnNames, domain, false)
}

function changedColumns(schema, sourceRow, destinationRow) {
  const normalized = normalizeSchema(schema)
  validateTypedTextRow(normalized, sourceRow)
  validateTypedTextRow(normalized, destinationRow)
  return normalized.columns
    .filter(column => sourceRow[column.name] !== destinationRow[column.name])
    .map(column => column.name)
}

module.exports = {
  catalogFingerprint,
  changedColumns,
  digestCanonicalRow,
  digestCanonicalTuple,
  encodeCanonicalRow,
  encodeCanonicalTuple,
  normalizeSchema,
  schemaFingerprint,
  stableStringify,
}
