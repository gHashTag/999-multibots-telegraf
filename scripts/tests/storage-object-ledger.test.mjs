#!/usr/bin/env node

import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import test from 'node:test'

const require = createRequire(import.meta.url)
const {
  MAX_LEDGER_RECORDS,
  appendLedgerRecord,
  completedObjectIds,
  createLedger,
  verifyLedger,
} = require('../storage-migration/object-ledger.cjs')

test('ledger is append-only, hash-chained, and bound to both manifests', () => {
  const initial = createLedger({
    sourceSeal: 'a'.repeat(64),
    destinationSeal: 'b'.repeat(64),
    createdAt: '2026-08-25T00:00:00.000Z',
  })
  const next = appendLedgerRecord(initial, {
    objectId: 'c'.repeat(64),
    action: 'copied_verified',
    recordedAt: '2026-08-25T00:01:00.000Z',
  })

  assert.equal(initial.records.length, 0)
  assert.equal(next.records.length, 1)
  assert.equal(
    initial.digest,
    'f6b563df6571997cbfbb41c35e0cd554c92b35d29f98ca962d445a8674e03b9d'
  )
  assert.equal(
    next.digest,
    'fe3256cebf601971e9b7a2b4862e02c036f9ba27ebbd8dcb305a2576238967b0'
  )
  assert.equal(verifyLedger(next), true)
  assert.deepEqual([...completedObjectIds(next)], ['c'.repeat(64)])

  const tampered = structuredClone(next)
  tampered.records[0].action = 'recovered_equal'
  assert.throws(() => verifyLedger(tampered), /ledger digest mismatch/i)

  const wrongManifest = structuredClone(next)
  wrongManifest.sourceSeal = 'd'.repeat(64)
  assert.throws(() => verifyLedger(wrongManifest), /ledger digest mismatch/i)
})

test('ledger refuses duplicate completion and unsupported mutations', () => {
  let ledger = createLedger({
    sourceSeal: 'a'.repeat(64),
    destinationSeal: 'b'.repeat(64),
    createdAt: '2026-08-25T00:00:00.000Z',
  })
  ledger = appendLedgerRecord(ledger, {
    objectId: 'c'.repeat(64),
    action: 'copied_verified',
    recordedAt: '2026-08-25T00:01:00.000Z',
  })

  assert.throws(
    () =>
      appendLedgerRecord(ledger, {
        objectId: 'c'.repeat(64),
        action: 'copied_verified',
        recordedAt: '2026-08-25T00:02:00.000Z',
      }),
    /already complete/i
  )
  assert.throws(
    () =>
      appendLedgerRecord(ledger, {
        objectId: 'e'.repeat(64),
        action: 'deleted',
        recordedAt: '2026-08-25T00:02:00.000Z',
      }),
    /unsupported ledger action/i
  )
  assert.throws(
    () =>
      createLedger({
        sourceSeal: 'a'.repeat(64),
        destinationSeal: 'b'.repeat(64),
        createdAt: 'not-a-timestamp',
      }),
    /timestamp/i
  )
})

test('ledger requires an exact plain bounded canonical shape', () => {
  const initial = createLedger({
    sourceSeal: 'a'.repeat(64),
    destinationSeal: 'b'.repeat(64),
    createdAt: '2026-08-25T00:00:00.000Z',
  })

  const extra = structuredClone(initial)
  extra.toJSON = () => initial
  assert.throws(() => verifyLedger(extra), /canonical|plain|field/i)

  const inherited = structuredClone(initial)
  Object.setPrototypeOf(inherited, { records: [] })
  assert.throws(() => verifyLedger(inherited), /canonical|plain/i)

  const missing = structuredClone(initial)
  delete missing.records
  assert.throws(() => verifyLedger(missing), /canonical|records/i)

  const oversized = structuredClone(initial)
  oversized.records = new Array(MAX_LEDGER_RECORDS + 1)
  assert.throws(() => verifyLedger(oversized), /too many ledger records/i)
})

test('append input rejects extra fields instead of silently discarding them', () => {
  const initial = createLedger({
    sourceSeal: 'a'.repeat(64),
    destinationSeal: 'b'.repeat(64),
    createdAt: '2026-08-25T00:00:00.000Z',
  })
  assert.throws(
    () =>
      appendLedgerRecord(initial, {
        objectId: 'c'.repeat(64),
        action: 'copied_verified',
        recordedAt: '2026-08-25T00:01:00.000Z',
        providerSecret: 'must-not-be-accepted', // secret-guard-ok: синтетическая фикстура; тест доказывает, что значение НЕ попадает в вывод
      }),
    /canonical|field/i
  )
})
