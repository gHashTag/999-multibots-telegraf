#!/usr/bin/env node
'use strict'

const { lstatSync, realpathSync } = require('node:fs')
const { isAbsolute, relative, resolve, sep } = require('node:path')
const { spawnSync } = require('node:child_process')

const {
  catalogFingerprint,
  encodeCanonicalRow,
  normalizeSchema,
  schemaFingerprint,
} = require('./canonical-row.cjs')
const { getTableContract } = require('./table-contracts.cjs')

const MANDATORY_TABLES = Object.freeze([
  'assets',
  'jobs',
  'payments_v2',
  'users',
])
const SEQUENCE_TABLES = Object.freeze(new Set(['assets', 'payments_v2']))
const MAX_OUTPUT_BYTES = 32 * 1024 * 1024
const MAX_ROWS_PER_TABLE = 50_000
const MAX_REFERENCE_IDS = 100_000
const PSQL_TIMEOUT_MS = 45_000
const SAFE_ERROR = 'root relational extraction failed safely\n'
const INTEGER_TEXT = /^(?:0|[1-9][0-9]*)$/
const SERVICE_NAME = /^[A-Za-z0-9](?:[A-Za-z0-9._-]{0,127})$/
const REPOSITORY_ROOT = resolve(__dirname, '../../..')

function assertPlainObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object`)
  }
  const prototype = Object.getPrototypeOf(value)
  if (prototype !== Object.prototype && prototype !== null) {
    throw new TypeError(`${label} must be a plain object`)
  }
}

function assertExactKeys(value, expected, label) {
  assertPlainObject(value, label)
  const actual = Object.keys(value).sort()
  const wanted = [...expected].sort()
  if (
    actual.length !== wanted.length ||
    actual.some((key, index) => key !== wanted[index])
  ) {
    throw new TypeError(`${label} fields are invalid`)
  }
}

function sameStrings(left, right) {
  return (
    Array.isArray(left) &&
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  )
}

function assertMandatoryTables(tables) {
  if (!sameStrings(tables, MANDATORY_TABLES)) {
    throw new TypeError('extractor requires the exact mandatory table set')
  }
}

function quoteIdentifier(value) {
  if (!MANDATORY_TABLES.includes(value) && !['templates'].includes(value)) {
    throw new TypeError('identifier is outside the fixed extraction contract')
  }
  return `"${value.replaceAll('"', '""')}"`
}

function quoteLiteral(value) {
  if (!MANDATORY_TABLES.includes(value) && !['templates'].includes(value)) {
    throw new TypeError('literal is outside the fixed extraction contract')
  }
  return `'${value.replaceAll("'", "''")}'`
}

function constraintColumnsSql(alias, field, relationField) {
  return `to_jsonb(ARRAY(
          SELECT attribute.attname
          FROM unnest(${alias}.${field}) WITH ORDINALITY AS key(attnum, position)
          JOIN pg_catalog.pg_attribute AS attribute
            ON attribute.attrelid = ${alias}.${relationField}
           AND attribute.attnum = key.attnum
          ORDER BY key.position
        ))`
}

function constraintStateSql(alias) {
  return `
        'deferrable', ${alias}.condeferrable,
        'initiallyDeferred', ${alias}.condeferred,
        'validated', ${alias}.convalidated`
}

function schemaSql(table) {
  const tableLiteral = quoteLiteral(table)
  return `
WITH target AS (
  SELECT relation.oid
  FROM pg_catalog.pg_class AS relation
  JOIN pg_catalog.pg_namespace AS namespace
    ON namespace.oid = relation.relnamespace
  WHERE namespace.nspname = 'public'
    AND relation.relname = ${tableLiteral}
    AND relation.relkind = 'r'
    AND NOT relation.relispartition
    AND NOT relation.relhassubclass
)
SELECT jsonb_build_object(
  'kind', 'schema',
  'table', ${tableLiteral},
  'value', jsonb_build_object(
    'table', ${tableLiteral},
    'columns', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'name', attribute.attname,
        'type', pg_catalog.format_type(attribute.atttypid, attribute.atttypmod),
        'ordinal', attribute.attnum,
        'nullable', NOT attribute.attnotnull,
        'default', pg_catalog.pg_get_expr(default_value.adbin, default_value.adrelid, true),
        'identity', attribute.attidentity,
        'generated', attribute.attgenerated,
        'collation', CASE
          WHEN attribute.attcollation = 0 THEN NULL
          ELSE pg_catalog.format('%I.%I', collation_namespace.nspname, collation.collname)
        END
      ) ORDER BY attribute.attnum)
      FROM pg_catalog.pg_attribute AS attribute
      LEFT JOIN pg_catalog.pg_attrdef AS default_value
        ON default_value.adrelid = attribute.attrelid
       AND default_value.adnum = attribute.attnum
      LEFT JOIN pg_catalog.pg_collation AS collation
        ON collation.oid = attribute.attcollation
      LEFT JOIN pg_catalog.pg_namespace AS collation_namespace
        ON collation_namespace.oid = collation.collnamespace
      WHERE attribute.attrelid = target.oid
        AND attribute.attnum > 0
        AND NOT attribute.attisdropped
    ), '[]'::jsonb),
    'primaryKey', (
      SELECT jsonb_build_object(
        'name', constraint_record.conname,
        'columns', ${constraintColumnsSql('constraint_record', 'conkey', 'conrelid')},${constraintStateSql('constraint_record')}
      )
      FROM pg_catalog.pg_constraint AS constraint_record
      WHERE constraint_record.conrelid = target.oid
        AND constraint_record.contype = 'p'
      ORDER BY constraint_record.conname
      LIMIT 1
    ),
    'uniqueKeys', COALESCE((
      SELECT jsonb_agg(value ORDER BY value ->> 'name')
      FROM (
        SELECT jsonb_build_object(
          'name', constraint_record.conname,
          'columns', ${constraintColumnsSql('constraint_record', 'conkey', 'conrelid')},
          'nullsDistinct', NOT constraint_record.connullsnotdistinct,${constraintStateSql('constraint_record')}
        ) AS value
        FROM pg_catalog.pg_constraint AS constraint_record
        WHERE constraint_record.conrelid = target.oid
          AND constraint_record.contype = 'u'
      ) AS unique_key
    ), '[]'::jsonb),
    'foreignKeys', COALESCE((
      SELECT jsonb_agg(value ORDER BY value ->> 'name')
      FROM (
        SELECT jsonb_build_object(
          'name', constraint_record.conname,
          'columns', ${constraintColumnsSql('constraint_record', 'conkey', 'conrelid')},
          'referencedTable', referenced_relation.relname,
          'referencedColumns', ${constraintColumnsSql('constraint_record', 'confkey', 'confrelid')},
          'onUpdate', CASE constraint_record.confupdtype
            WHEN 'a' THEN 'NO ACTION' WHEN 'r' THEN 'RESTRICT'
            WHEN 'c' THEN 'CASCADE' WHEN 'n' THEN 'SET NULL'
            WHEN 'd' THEN 'SET DEFAULT'
          END,
          'onDelete', CASE constraint_record.confdeltype
            WHEN 'a' THEN 'NO ACTION' WHEN 'r' THEN 'RESTRICT'
            WHEN 'c' THEN 'CASCADE' WHEN 'n' THEN 'SET NULL'
            WHEN 'd' THEN 'SET DEFAULT'
          END,${constraintStateSql('constraint_record')}
        ) AS value
        FROM pg_catalog.pg_constraint AS constraint_record
        JOIN pg_catalog.pg_class AS referenced_relation
          ON referenced_relation.oid = constraint_record.confrelid
        WHERE constraint_record.conrelid = target.oid
          AND constraint_record.contype = 'f'
      ) AS foreign_key
    ), '[]'::jsonb),
    'checks', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'name', constraint_record.conname,
        'expression', pg_catalog.pg_get_constraintdef(constraint_record.oid, true),
        'validated', constraint_record.convalidated
      ) ORDER BY constraint_record.conname)
      FROM pg_catalog.pg_constraint AS constraint_record
      WHERE constraint_record.conrelid = target.oid
        AND constraint_record.contype = 'c'
    ), '[]'::jsonb),
    'enums', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'name', enum_type.typname,
        'labels', (
          SELECT jsonb_agg(enum_value.enumlabel ORDER BY enum_value.enumsortorder)
          FROM pg_catalog.pg_enum AS enum_value
          WHERE enum_value.enumtypid = enum_type.oid
        )
      ) ORDER BY enum_type.typname)
      FROM (
        SELECT DISTINCT type_record.oid, type_record.typname
        FROM pg_catalog.pg_attribute AS attribute
        JOIN pg_catalog.pg_type AS type_record
          ON type_record.oid = attribute.atttypid
        WHERE attribute.attrelid = target.oid
          AND attribute.attnum > 0
          AND NOT attribute.attisdropped
          AND type_record.typtype = 'e'
      ) AS enum_type
    ), '[]'::jsonb),
    'sequences', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'name', sequence_relation.relname,
        'column', attribute.attname,
        'increment', sequence_record.seqincrement::text,
        'start', sequence_record.seqstart::text,
        'min', sequence_record.seqmin::text,
        'max', sequence_record.seqmax::text,
        'cycle', sequence_record.seqcycle
      ) ORDER BY sequence_relation.relname)
      FROM pg_catalog.pg_depend AS dependency
      JOIN pg_catalog.pg_class AS sequence_relation
        ON sequence_relation.oid = dependency.objid
       AND sequence_relation.relkind = 'S'
      JOIN pg_catalog.pg_sequence AS sequence_record
        ON sequence_record.seqrelid = sequence_relation.oid
      JOIN pg_catalog.pg_attribute AS attribute
        ON attribute.attrelid = dependency.refobjid
       AND attribute.attnum = dependency.refobjsubid
      WHERE dependency.refobjid = target.oid
        AND dependency.deptype IN ('a', 'i')
    ), '[]'::jsonb)
  )
)::text
FROM target;
`
}

function rowsSql(table) {
  const tableLiteral = quoteLiteral(table)
  const tableIdentifier = quoteIdentifier(table)
  return `
SELECT jsonb_build_object(
  'kind', 'row',
  'table', ${tableLiteral},
  'value', bounded.value
)::text
FROM (
  SELECT typed.value
  FROM ONLY public.${tableIdentifier} AS source_row
  CROSS JOIN LATERAL (
    SELECT jsonb_object_agg(
      entry.key,
      CASE
        WHEN entry.value = 'null'::jsonb THEN 'null'::jsonb
        ELSE pg_catalog.to_jsonb(entry.value #>> '{}')
      END
      ORDER BY entry.key
    ) AS value
    FROM pg_catalog.jsonb_each(pg_catalog.to_jsonb(source_row)) AS entry
  ) AS typed
  ORDER BY typed.value::text COLLATE "C"
  LIMIT ${MAX_ROWS_PER_TABLE + 1}
) AS bounded;
`
}

function sequenceSql(table) {
  if (!SEQUENCE_TABLES.has(table)) return ''
  const contract = getTableContract(table)
  const sequenceName = contract.sequence.name
  const columnName = contract.sequence.column
  if (!/^[a-z_][a-z0-9_]*$/.test(sequenceName) || columnName !== 'id') {
    throw new TypeError('sequence contract cannot be represented safely')
  }
  const tableLiteral = quoteLiteral(table)
  const tableIdentifier = quoteIdentifier(table)
  const sequenceIdentifier = `"${sequenceName}"`
  return `
WITH owner_relation AS (
  SELECT relation.oid
  FROM pg_catalog.pg_class AS relation
  JOIN pg_catalog.pg_namespace AS owner_namespace
    ON owner_namespace.oid = relation.relnamespace
  WHERE owner_namespace.nspname = 'public'
    AND relation.relname = ${tableLiteral}
    AND relation.relkind = 'r'
    AND NOT relation.relispartition
    AND NOT relation.relhassubclass
),
owner_attribute AS (
  SELECT owner_attribute.attnum
  FROM pg_catalog.pg_attribute AS owner_attribute
  JOIN owner_relation
    ON owner_attribute.attrelid = owner_relation.oid
  WHERE owner_attribute.attname = 'id'
    AND owner_attribute.attnum > 0
    AND NOT owner_attribute.attisdropped
),
sequence_relation AS (
  SELECT relation.oid
  FROM pg_catalog.pg_class AS relation
  JOIN pg_catalog.pg_namespace AS sequence_namespace
    ON sequence_namespace.oid = relation.relnamespace
  WHERE sequence_namespace.nspname = 'public'
    AND relation.relname = '${sequenceName}'
    AND relation.relkind = 'S'
),
sequence_config AS (
  SELECT sequence_record.seqincrement
  FROM pg_catalog.pg_depend AS dependency
  JOIN owner_relation
    ON dependency.refobjid = owner_relation.oid
  JOIN owner_attribute
    ON dependency.refobjsubid = owner_attribute.attnum
  JOIN sequence_relation
    ON dependency.objid = sequence_relation.oid
  JOIN pg_catalog.pg_sequence AS sequence_record
    ON sequence_record.seqrelid = sequence_relation.oid
  WHERE dependency.classid = 'pg_catalog.pg_class'::regclass
    AND dependency.refclassid = 'pg_catalog.pg_class'::regclass
    AND dependency.deptype IN ('a', 'i')
)
SELECT jsonb_build_object(
  'kind', 'sequence_state',
  'table', ${tableLiteral},
  'value', jsonb_build_object(
    'name', '${sequenceName}',
    'maxValue', (SELECT max(id)::text FROM ONLY public.${tableIdentifier}),
    'nextValue', CASE
      WHEN sequence_state.is_called
        THEN (sequence_state.last_value::numeric + sequence_config.seqincrement)::text
      ELSE sequence_state.last_value::text
    END
  )
)::text
FROM public.${sequenceIdentifier} AS sequence_state
CROSS JOIN sequence_config;
`
}

function referenceSql(table) {
  if (table !== 'jobs') return ''
  const tableLiteral = quoteLiteral(table)
  const templatesIdentifier = quoteIdentifier('templates')
  return `
WITH owner_relation AS (
  SELECT relation.oid
  FROM pg_catalog.pg_class AS relation
  JOIN pg_catalog.pg_namespace AS namespace
    ON namespace.oid = relation.relnamespace
  WHERE namespace.nspname = 'public'
    AND relation.relname = 'jobs'
    AND relation.relkind = 'r'
    AND NOT relation.relispartition
    AND NOT relation.relhassubclass
),
referenced_relation AS (
  SELECT relation.oid
  FROM pg_catalog.pg_class AS relation
  JOIN pg_catalog.pg_namespace AS namespace
    ON namespace.oid = relation.relnamespace
  WHERE namespace.nspname = 'public'
    AND relation.relname = 'templates'
    AND relation.relkind = 'r'
    AND NOT relation.relispartition
    AND NOT relation.relhassubclass
),
required_reference AS (
  SELECT constraint_record.oid
  FROM pg_catalog.pg_constraint AS constraint_record
  JOIN owner_relation
    ON constraint_record.conrelid = owner_relation.oid
  JOIN referenced_relation
    ON constraint_record.confrelid = referenced_relation.oid
  JOIN pg_catalog.pg_attribute AS local_attribute
    ON local_attribute.attrelid = owner_relation.oid
   AND local_attribute.attname = 'template_id'
   AND local_attribute.attnum > 0
   AND NOT local_attribute.attisdropped
  JOIN pg_catalog.pg_attribute AS referenced_attribute
    ON referenced_attribute.attrelid = referenced_relation.oid
   AND referenced_attribute.attname = 'id'
   AND referenced_attribute.attnum > 0
   AND NOT referenced_attribute.attisdropped
  WHERE constraint_record.contype = 'f'
    AND constraint_record.conname = 'jobs_template_id_fkey'
    AND constraint_record.conkey = ARRAY[local_attribute.attnum]::smallint[]
    AND constraint_record.confkey = ARRAY[referenced_attribute.attnum]::smallint[]
    AND NOT constraint_record.condeferrable
    AND NOT constraint_record.condeferred
    AND constraint_record.convalidated
    AND constraint_record.confupdtype = 'a'
    AND constraint_record.confdeltype = 'a'
)
SELECT jsonb_build_object(
  'kind', 'reference_shape',
  'table', ${tableLiteral},
  'value', jsonb_build_object(
    'referencedTable', 'templates',
    'relationKind', 'ordinary_non_inherited',
    'constraint', 'jobs_template_id_fkey',
    'localColumns', to_jsonb(ARRAY['template_id']),
    'referencedColumns', to_jsonb(ARRAY['id'])
  )
)::text
FROM required_reference;

SELECT jsonb_build_object(
  'kind', 'reference',
  'table', ${tableLiteral},
  'value', bounded.value
)::text
FROM (
  SELECT id::text AS value
  FROM ONLY public.${templatesIdentifier}
  ORDER BY id::text COLLATE "C"
  LIMIT ${MAX_REFERENCE_IDS + 1}
) AS bounded;
`
}

function buildSql(tables = MANDATORY_TABLES) {
  assertMandatoryTables(tables)
  const statements = [
    String.raw`\set ON_ERROR_STOP on`,
    'BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;',
    "SET LOCAL statement_timeout = '30s';",
    "SET LOCAL lock_timeout = '5s';",
    "SET LOCAL idle_in_transaction_session_timeout = '30s';",
    "SET LOCAL timezone = 'UTC';",
    "SET LOCAL datestyle = 'ISO, YMD';",
    "SET LOCAL intervalstyle = 'iso_8601';",
    "SET LOCAL bytea_output = 'hex';",
  ]
  for (const table of tables) {
    statements.push(schemaSql(table), rowsSql(table))
    const sequence = sequenceSql(table)
    const reference = referenceSql(table)
    if (sequence) statements.push(sequence)
    if (reference) statements.push(reference)
  }
  statements.push(`
SELECT jsonb_build_object(
  'kind', 'snapshot_complete',
  'version', 1,
  'tables', to_jsonb(ARRAY['assets', 'jobs', 'payments_v2', 'users'])
)::text
WHERE pg_catalog.current_setting('transaction_read_only') = 'on'
  AND pg_catalog.current_setting('default_transaction_read_only') = 'on';
`)
  statements.push('COMMIT;')
  return `${statements.join('\n')}\n`
}

function parseIntegerText(value, label) {
  if (typeof value !== 'string' || !INTEGER_TEXT.test(value)) {
    throw new TypeError(`${label} must be canonical non-negative integer text`)
  }
  return BigInt(value)
}

function validateSequenceState(table, value, rows, schema) {
  assertExactKeys(value, ['maxValue', 'name', 'nextValue'], 'sequence state')
  const contract = getTableContract(table)
  if (!contract?.sequence || value.name !== contract.sequence.name) {
    throw new TypeError('sequence state does not match the table contract')
  }
  const matching = schema.sequences.filter(
    sequence =>
      sequence.name === contract.sequence.name &&
      sequence.column === contract.sequence.column
  )
  if (matching.length !== 1) {
    throw new TypeError('sequence state lacks matching catalog evidence')
  }
  let maximum = null
  for (const row of rows) {
    const current = parseIntegerText(
      row[contract.sequence.column],
      'sequence row value'
    )
    if (maximum === null || current > maximum) maximum = current
  }
  if (value.maxValue !== null && typeof value.maxValue !== 'string') {
    throw new TypeError('sequence maximum must be typed text or null')
  }
  const declared =
    value.maxValue === null
      ? null
      : parseIntegerText(value.maxValue, 'sequence maximum')
  if (declared !== maximum) {
    throw new TypeError('sequence maximum does not match extracted rows')
  }
  const next = parseIntegerText(value.nextValue, 'sequence next value')
  if (maximum !== null && next <= maximum) {
    throw new TypeError('sequence next value does not clear extracted rows')
  }
  return {
    name: value.name,
    maxValue: value.maxValue,
    nextValue: value.nextValue,
  }
}

function parseSnapshot(
  text,
  side,
  {
    maxBytes = MAX_OUTPUT_BYTES,
    maxRowsPerTable = MAX_ROWS_PER_TABLE,
    maxReferenceIds = MAX_REFERENCE_IDS,
  } = {}
) {
  if (!['source', 'destination'].includes(side)) {
    throw new TypeError('snapshot side is invalid')
  }
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1) {
    throw new TypeError('snapshot byte limit is invalid')
  }
  if (!Number.isSafeInteger(maxRowsPerTable) || maxRowsPerTable < 0) {
    throw new TypeError('snapshot row limit is invalid')
  }
  if (!Number.isSafeInteger(maxReferenceIds) || maxReferenceIds < 0) {
    throw new TypeError('snapshot reference limit is invalid')
  }
  if (typeof text !== 'string' || Buffer.byteLength(text, 'utf8') > maxBytes) {
    throw new TypeError('snapshot limit exceeded')
  }

  const lines = text.split(/\r?\n/).filter(line => line.length > 0)
  const recordLimit =
    MANDATORY_TABLES.length * (maxRowsPerTable + 3) + maxReferenceIds + 1
  if (lines.length === 0 || lines.length > recordLimit) {
    throw new TypeError('snapshot record limit exceeded')
  }

  const records = lines.map((line, index) => {
    try {
      const value = JSON.parse(line)
      assertPlainObject(value, `snapshot record ${index + 1}`)
      return value
    } catch {
      throw new TypeError('snapshot contains invalid JSON records')
    }
  })

  const sentinels = records.filter(
    record => record.kind === 'snapshot_complete'
  )
  if (sentinels.length !== 1 || records.at(-1) !== sentinels[0]) {
    throw new TypeError('snapshot is partial: completion record is absent')
  }
  const sentinel = sentinels[0]
  assertExactKeys(
    sentinel,
    ['kind', 'tables', 'version'],
    'snapshot completion'
  )
  if (
    sentinel.version !== 1 ||
    !sameStrings(sentinel.tables, MANDATORY_TABLES)
  ) {
    throw new TypeError('snapshot completion table set is invalid')
  }

  const state = Object.fromEntries(
    MANDATORY_TABLES.map(table => [
      table,
      {
        schema: null,
        rows: [],
        sequenceState: null,
        referenceShape: null,
        referenceIds: [],
      },
    ])
  )

  for (const record of records.slice(0, -1)) {
    if (
      typeof record.table !== 'string' ||
      !MANDATORY_TABLES.includes(record.table)
    ) {
      throw new TypeError('snapshot record table set is invalid')
    }
    const tableState = state[record.table]
    if (record.kind === 'schema') {
      assertExactKeys(record, ['kind', 'table', 'value'], 'schema record')
      if (tableState.schema !== null)
        throw new TypeError('snapshot has duplicate schema')
      tableState.schema = record.value
      continue
    }
    if (record.kind === 'row') {
      assertExactKeys(record, ['kind', 'table', 'value'], 'row record')
      tableState.rows.push(record.value)
      if (tableState.rows.length > maxRowsPerTable) {
        throw new TypeError('snapshot row limit exceeded')
      }
      continue
    }
    if (record.kind === 'sequence_state') {
      assertExactKeys(record, ['kind', 'table', 'value'], 'sequence record')
      if (
        !SEQUENCE_TABLES.has(record.table) ||
        tableState.sequenceState !== null
      ) {
        throw new TypeError('snapshot sequence evidence is invalid')
      }
      tableState.sequenceState = record.value
      continue
    }
    if (record.kind === 'reference') {
      assertExactKeys(record, ['kind', 'table', 'value'], 'reference record')
      if (record.table !== 'jobs' || typeof record.value !== 'string') {
        throw new TypeError('snapshot reference evidence is invalid')
      }
      tableState.referenceIds.push(record.value)
      if (tableState.referenceIds.length > maxReferenceIds) {
        throw new TypeError('snapshot reference limit exceeded')
      }
      continue
    }
    if (record.kind === 'reference_shape') {
      assertExactKeys(
        record,
        ['kind', 'table', 'value'],
        'reference shape record'
      )
      if (record.table !== 'jobs' || tableState.referenceShape !== null) {
        throw new TypeError('snapshot reference relation shape is invalid')
      }
      assertExactKeys(
        record.value,
        [
          'constraint',
          'localColumns',
          'referencedColumns',
          'referencedTable',
          'relationKind',
        ],
        'reference relation shape'
      )
      if (
        record.value.referencedTable !== 'templates' ||
        record.value.relationKind !== 'ordinary_non_inherited' ||
        record.value.constraint !== 'jobs_template_id_fkey' ||
        !sameStrings(record.value.localColumns, ['template_id']) ||
        !sameStrings(record.value.referencedColumns, ['id'])
      ) {
        throw new TypeError('snapshot reference relation shape is invalid')
      }
      tableState.referenceShape = {
        referencedTable: 'templates',
        relationKind: 'ordinary_non_inherited',
        constraint: 'jobs_template_id_fkey',
        localColumns: ['template_id'],
        referencedColumns: ['id'],
      }
      continue
    }
    throw new TypeError('snapshot record kind is invalid')
  }

  const tableFingerprints = {}
  const tables = {}
  for (const table of MANDATORY_TABLES) {
    const tableState = state[table]
    if (tableState.schema === null) {
      throw new TypeError('snapshot is partial: mandatory schema is absent')
    }
    const normalizedSchema = normalizeSchema(tableState.schema)
    if (normalizedSchema.table !== table) {
      throw new TypeError('snapshot schema table set is invalid')
    }

    const rows = tableState.rows.map(row => {
      try {
        encodeCanonicalRow(normalizedSchema, row)
        return row
      } catch {
        throw new TypeError('snapshot row must contain exact typed text')
      }
    })
    rows.sort((left, right) =>
      Buffer.compare(
        encodeCanonicalRow(normalizedSchema, left),
        encodeCanonicalRow(normalizedSchema, right)
      )
    )

    let sequenceState = null
    if (SEQUENCE_TABLES.has(table)) {
      if (tableState.sequenceState === null) {
        throw new TypeError('snapshot is partial: sequence state is absent')
      }
      sequenceState = validateSequenceState(
        table,
        tableState.sequenceState,
        rows,
        normalizedSchema
      )
    } else if (tableState.sequenceState !== null) {
      throw new TypeError('snapshot contains unexpected sequence state')
    }

    let referenceIds = null
    let referenceShape = null
    if (table === 'jobs') {
      if (tableState.referenceShape === null) {
        throw new TypeError('snapshot reference relation shape is absent')
      }
      referenceShape = tableState.referenceShape
      const unique = new Set(tableState.referenceIds)
      if (unique.size !== tableState.referenceIds.length) {
        throw new TypeError('snapshot reference IDs must be unique typed text')
      }
      referenceIds = [...unique].sort()
      for (const row of rows) {
        if (row.template_id !== null && !unique.has(row.template_id)) {
          throw new TypeError('snapshot job reference evidence is incomplete')
        }
      }
    } else if (tableState.referenceIds.length !== 0) {
      throw new TypeError('snapshot contains unexpected reference evidence')
    } else if (tableState.referenceShape !== null) {
      throw new TypeError(
        'snapshot contains unexpected reference relation shape'
      )
    }

    const fingerprint = schemaFingerprint(normalizedSchema)
    tableFingerprints[table] = fingerprint
    tables[table] = {
      schema: normalizedSchema,
      rows,
      sequenceState,
      referenceShape,
      referenceIds,
    }
  }

  const catalogTables = Object.fromEntries(
    MANDATORY_TABLES.map(table => [
      table,
      { schemaFingerprint: tableFingerprints[table] },
    ])
  )
  return {
    version: 1,
    side,
    catalog: {
      version: 1,
      fingerprint: catalogFingerprint(tableFingerprints),
      tables: catalogTables,
    },
    tables,
  }
}

function inside(candidate, parent) {
  const delta = relative(parent, candidate)
  return delta === '' || (!delta.startsWith(`..${sep}`) && delta !== '..')
}

function validatePgpass(path) {
  if (typeof path !== 'string' || !isAbsolute(path)) {
    throw new TypeError('PGPASSFILE reference is invalid')
  }
  const stat = lstatSync(path)
  if (
    stat.isSymbolicLink() ||
    !stat.isFile() ||
    (stat.mode & 0o777) !== 0o600
  ) {
    throw new TypeError('PGPASSFILE reference is insecure')
  }
  const resolved = realpathSync(path)
  if (inside(resolved, realpathSync(REPOSITORY_ROOT))) {
    throw new TypeError('PGPASSFILE must stay outside the repository')
  }
  return resolved
}

function parseArgs(argv) {
  if (
    argv.length !== 2 ||
    argv[0] !== '--side' ||
    !['source', 'destination'].includes(argv[1])
  ) {
    throw new TypeError('extractor arguments are invalid')
  }
  return argv[1]
}

function connectionReferences(side, environment) {
  if (Object.hasOwn(environment, 'PGPASSWORD')) {
    throw new TypeError('PGPASSWORD is forbidden')
  }
  const prefix = side === 'source' ? 'SOURCE' : 'DESTINATION'
  const service = environment[`${prefix}_PGSERVICE`]
  const pgpass = environment[`${prefix}_PGPASSFILE`]
  if (typeof service !== 'string' || !SERVICE_NAME.test(service)) {
    throw new TypeError('PGSERVICE reference is invalid')
  }
  return { service, pgpass: validatePgpass(pgpass) }
}

function childEnvironment(environment, references) {
  const child = {}
  for (const name of ['HOME', 'PATH', 'TMPDIR']) {
    if (typeof environment[name] === 'string') child[name] = environment[name]
  }
  Object.assign(child, {
    LANG: 'C',
    LC_ALL: 'C',
    PGAPPNAME: 'trinity-root-readonly-reconciliation',
    PGCLIENTENCODING: 'UTF8',
    PGCONNECT_TIMEOUT: '10',
    PGSERVICE: references.service,
    PGPASSFILE: references.pgpass,
    PGOPTIONS: [
      '-c default_transaction_read_only=on',
      '-c statement_timeout=30000',
      '-c lock_timeout=5000',
      '-c idle_in_transaction_session_timeout=30000',
      '-c timezone=UTC',
      '-c datestyle=ISO,YMD',
      '-c intervalstyle=iso_8601',
      '-c extra_float_digits=3',
      '-c bytea_output=hex',
    ].join(' '),
  })
  return child
}

function extract(side, environment = process.env) {
  const references = connectionReferences(side, environment)
  const result = spawnSync(
    'psql',
    [
      '--no-password',
      '--no-psqlrc',
      '--quiet',
      '--tuples-only',
      '--no-align',
      '--set=ON_ERROR_STOP=1',
    ],
    {
      input: buildSql(),
      encoding: 'utf8',
      env: childEnvironment(environment, references),
      timeout: PSQL_TIMEOUT_MS,
      maxBuffer: MAX_OUTPUT_BYTES + 1024,
      killSignal: 'SIGTERM',
    }
  )
  if (result.error || result.signal || result.status !== 0) {
    throw new Error('psql snapshot failed')
  }
  return parseSnapshot(result.stdout, side)
}

function main(argv = process.argv.slice(2), environment = process.env) {
  try {
    const side = parseArgs(argv)
    const manifest = extract(side, environment)
    process.stdout.write(`${JSON.stringify(manifest)}\n`)
    return 0
  } catch {
    process.stderr.write(SAFE_ERROR)
    return 1
  }
}

if (require.main === module) {
  process.exitCode = main()
}

module.exports = {
  MANDATORY_TABLES,
  buildSql,
  extract,
  main,
  parseSnapshot,
}
