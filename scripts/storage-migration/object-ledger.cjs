'use strict'

const {
  SHA256_PATTERN,
  assertCanonicalArray,
  assertExactOwnKeys,
  sha256Json,
} = require('./object-model.cjs')

const LEDGER_VERSION = 1
const MAX_LEDGER_RECORDS = 100_000
const ACTIONS = new Set(['copied_verified', 'recovered_equal'])

function assertTimestamp(value, label) {
  if (
    typeof value !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) ||
    new Date(value).toISOString() !== value
  ) {
    throw new TypeError(`${label} must be an explicit UTC timestamp`)
  }
}

function assertDigest(value, label) {
  if (!SHA256_PATTERN.test(value ?? ''))
    throw new TypeError(`${label} is invalid`)
}

function ledgerHeader(ledger) {
  return {
    ledgerVersion: LEDGER_VERSION,
    sourceSeal: ledger.sourceSeal,
    destinationSeal: ledger.destinationSeal,
    createdAt: ledger.createdAt,
  }
}

function createLedger(input) {
  assertExactOwnKeys(
    input,
    ['sourceSeal', 'destinationSeal', 'createdAt'],
    'Ledger input'
  )
  const { sourceSeal, destinationSeal, createdAt } = input
  assertDigest(sourceSeal, 'sourceSeal')
  assertDigest(destinationSeal, 'destinationSeal')
  assertTimestamp(createdAt, 'createdAt')
  const header = {
    ledgerVersion: LEDGER_VERSION,
    sourceSeal,
    destinationSeal,
    createdAt,
  }
  return { ...header, records: [], digest: sha256Json({ header, records: [] }) }
}

function normalizeVerifiedLedger(ledger) {
  assertExactOwnKeys(
    ledger,
    [
      'ledgerVersion',
      'sourceSeal',
      'destinationSeal',
      'createdAt',
      'records',
      'digest',
    ],
    'Ledger'
  )
  if (ledger.ledgerVersion !== LEDGER_VERSION) {
    throw new TypeError('Unsupported ledger')
  }
  if (
    Array.isArray(ledger.records) &&
    ledger.records.length > MAX_LEDGER_RECORDS
  ) {
    throw new TypeError('Ledger has too many ledger records')
  }
  assertCanonicalArray(ledger.records, 'ledger records', MAX_LEDGER_RECORDS)
  assertDigest(ledger.sourceSeal, 'sourceSeal')
  assertDigest(ledger.destinationSeal, 'destinationSeal')
  assertTimestamp(ledger.createdAt, 'createdAt')
  let previousDigest = sha256Json({ header: ledgerHeader(ledger), records: [] })
  const complete = new Set()
  const records = []
  for (const record of ledger.records) {
    assertExactOwnKeys(
      record,
      ['objectId', 'action', 'recordedAt', 'digest'],
      'Ledger record'
    )
    assertDigest(record.objectId, 'objectId')
    assertTimestamp(record.recordedAt, 'recordedAt')
    if (!ACTIONS.has(record.action))
      throw new TypeError('Unsupported ledger action')
    if (complete.has(record.objectId))
      throw new Error('Object is already complete')
    const payload = {
      index: complete.size,
      previousDigest,
      objectId: record.objectId,
      action: record.action,
      recordedAt: record.recordedAt,
    }
    const expected = sha256Json(payload)
    if (record.digest !== expected) throw new Error('Ledger digest mismatch')
    previousDigest = record.digest
    complete.add(record.objectId)
    records.push({
      objectId: record.objectId,
      action: record.action,
      recordedAt: record.recordedAt,
      digest: record.digest,
    })
  }
  if (ledger.digest !== previousDigest)
    throw new Error('Ledger digest mismatch')
  return {
    ledgerVersion: LEDGER_VERSION,
    sourceSeal: ledger.sourceSeal,
    destinationSeal: ledger.destinationSeal,
    createdAt: ledger.createdAt,
    records,
    digest: ledger.digest,
  }
}

function verifyLedger(ledger) {
  normalizeVerifiedLedger(ledger)
  return true
}

function completedObjectIds(ledger) {
  const normalized = normalizeVerifiedLedger(ledger)
  return new Set(normalized.records.map(record => record.objectId))
}

function appendLedgerRecord(ledger, input) {
  const normalized = normalizeVerifiedLedger(ledger)
  assertExactOwnKeys(
    input,
    ['objectId', 'action', 'recordedAt'],
    'Ledger record input'
  )
  const { objectId, action, recordedAt } = input
  assertDigest(objectId, 'objectId')
  assertTimestamp(recordedAt, 'recordedAt')
  if (!ACTIONS.has(action)) throw new TypeError('Unsupported ledger action')
  if (normalized.records.length >= MAX_LEDGER_RECORDS) {
    throw new Error('Ledger has too many ledger records')
  }
  if (normalized.records.some(record => record.objectId === objectId)) {
    throw new Error('Object is already complete')
  }
  const payload = {
    index: normalized.records.length,
    previousDigest: normalized.digest,
    objectId,
    action,
    recordedAt,
  }
  const record = { objectId, action, recordedAt, digest: sha256Json(payload) }
  return {
    ...normalized,
    records: [...normalized.records, record],
    digest: record.digest,
  }
}

module.exports = {
  MAX_LEDGER_RECORDS,
  appendLedgerRecord,
  completedObjectIds,
  createLedger,
  normalizeVerifiedLedger,
  verifyLedger,
}
