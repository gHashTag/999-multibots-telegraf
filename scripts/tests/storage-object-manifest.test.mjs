#!/usr/bin/env node

import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import test from 'node:test'

const require = createRequire(import.meta.url)
const { sha256Json } = require('../storage-migration/object-model.cjs')
const {
  MAX_MANIFEST_ENTRIES,
  createObjectManifest,
  summarizeObjectManifest,
  verifyObjectManifest,
} = require('../storage-migration/object-manifest.cjs')
const {
  MAX_RECONCILIATION_ENTRIES,
  reconcileObjectManifests,
  summarizeReconciliation,
} = require('../storage-migration/object-reconcile.cjs')

const object = (key, overrides = {}) => ({
  bucket: 'images',
  key,
  size: '4',
  sha256: 'a'.repeat(64),
  mime: 'image/png',
  version: 'v1',
  orphanState: 'unknown',
  ...overrides,
})

const manifest = (side, entries) =>
  createObjectManifest({
    side,
    capturedAt: '2026-08-25T00:00:00.000Z',
    entries,
  })

test('manifest is deterministic, sealed, and rejects duplicate object keys', () => {
  const first = manifest('source', [object('z.png'), object('a.png')])
  const second = manifest('source', [object('a.png'), object('z.png')])

  assert.deepEqual(first, second)
  assert.equal(verifyObjectManifest(first), true)
  assert.deepEqual(
    first.entries.map(entry => entry.key),
    ['a.png', 'z.png']
  )

  const tampered = structuredClone(first)
  tampered.entries[0].size = '5'
  assert.throws(() => verifyObjectManifest(tampered), /seal mismatch/i)
  assert.throws(
    () => manifest('source', [object('duplicate'), object('duplicate')]),
    /duplicate object/i
  )
})

test('sealed manifests require exact plain canonical entries with own object ids', () => {
  const sealed = manifest('source', [object('a.png'), object('b.png')])

  const missingIds = structuredClone(sealed)
  delete missingIds.entries[0].objectId
  delete missingIds.entries[1].objectId
  assert.throws(() => verifyObjectManifest(missingIds), /canonical|objectId/i)

  const extraRootField = structuredClone(sealed)
  extraRootField.toJSON = () => sealed
  assert.throws(
    () => verifyObjectManifest(extraRootField),
    /canonical|plain|field/i
  )

  const inheritedRoot = structuredClone(sealed)
  Object.setPrototypeOf(inheritedRoot, { toJSON: () => sealed })
  assert.throws(() => verifyObjectManifest(inheritedRoot), /canonical|plain/i)

  const extraEntryField = structuredClone(sealed)
  extraEntryField.entries[0].privateProviderField = 'must-not-be-accepted'
  assert.throws(() => verifyObjectManifest(extraEntryField), /canonical|field/i)
})

test('array subclasses, inherited toJSON, and indexed getters cannot be sealed', () => {
  class PoisonedEntries extends Array {}
  const sealed = manifest('source', [object('safe.png')])
  Object.defineProperty(PoisonedEntries.prototype, 'toJSON', {
    configurable: true,
    value: () => sealed.entries,
  })

  const poisoned = structuredClone(sealed)
  poisoned.entries = PoisonedEntries.from(poisoned.entries)
  assert.throws(
    () => verifyObjectManifest(poisoned),
    /canonical array|array prototype|toJSON/i
  )
  assert.throws(
    () =>
      createObjectManifest({
        side: 'source',
        capturedAt: '2026-08-25T00:00:00.000Z',
        entries: PoisonedEntries.from([object('different.png')]),
      }),
    /canonical array|array prototype|toJSON/i
  )

  const accessorEntries = []
  Object.defineProperty(accessorEntries, '0', {
    configurable: true,
    enumerable: true,
    get: () => object('getter.png'),
  })
  assert.throws(
    () =>
      createObjectManifest({
        side: 'source',
        capturedAt: '2026-08-25T00:00:00.000Z',
        entries: accessorEntries,
      }),
    /canonical array|accessor|getter/i
  )
})

test('prototype pollution is never invoked and legacy canonical seal order is stable', () => {
  const first = manifest('source', [object('a.png'), object('b.png')])
  const second = manifest('source', [object('different.png')])
  assert.equal(
    first.seal,
    '60363096f8865c2bc7506e00b489dbd11d3ac9f481ecd6bcf6dafff27bb0c176'
  )
  assert.notEqual(first.seal, second.seal)
  assert.equal(
    sha256Json({ left: 'one', right: 'two' }),
    sha256Json({ right: 'two', left: 'one' })
  )

  let inheritedGetterCalls = 0
  Object.defineProperty(Object.prototype, 'toJSON', {
    configurable: true,
    get() {
      inheritedGetterCalls += 1
      return () => ({ collapsed: true })
    },
  })
  try {
    assert.throws(
      () => verifyObjectManifest(first),
      /canonical|prototype|toJSON/i
    )
    assert.throws(
      () => sha256Json({ left: 'one', right: 'two' }),
      /canonical|prototype|toJSON/i
    )
    assert.equal(inheritedGetterCalls, 0)
  } finally {
    delete Object.prototype.toJSON
  }
})

test('manifest input has finite count, path, version, and safe-size bounds', () => {
  assert.equal(MAX_MANIFEST_ENTRIES, 100_000)
  assert.throws(
    () =>
      createObjectManifest({
        side: 'source',
        capturedAt: '2026-08-25T00:00:00.000Z',
        entries: new Array(MAX_MANIFEST_ENTRIES + 1),
      }),
    /too many manifest entries/i
  )
  assert.throws(
    () => manifest('source', [object('x'.repeat(1_025))]),
    /key.*1024 bytes/i
  )
  assert.throws(
    () =>
      manifest('source', [
        object('version.png', { version: 'v'.repeat(1_025) }),
      ]),
    /version.*1024 bytes/i
  )
  assert.throws(
    () =>
      manifest('source', [object('huge.png', { size: '9007199254740992' })]),
    /size.*safe/i
  )
})

test('public manifest summary exposes counts and bytes, not object keys', () => {
  const sealed = manifest('source', [
    object('private/user-a.png', { size: '5' }),
    object('private/user-b.png', { size: '7' }),
  ])
  const summary = summarizeObjectManifest(sealed)

  assert.deepEqual(summary, {
    manifestVersion: 1,
    side: 'source',
    objectCount: 2,
    totalBytes: '12',
    seal: sealed.seal,
  })
  assert.doesNotMatch(JSON.stringify(summary), /private|user-a|user-b/)
})

test('reconciliation is order-independent and never treats unverifiable data as equal', () => {
  const source = manifest('source', [
    object('equal.png'),
    object('missing.png', { sha256: 'b'.repeat(64) }),
    object('conflict.png', { sha256: 'c'.repeat(64) }),
    object('unverified.png', { sha256: 'd'.repeat(64) }),
  ])
  const destination = manifest('destination', [
    object('destination-only.png', { sha256: 'e'.repeat(64) }),
    object('conflict.png', { sha256: 'f'.repeat(64) }),
    object('unverified.png', { sha256: null }),
    object('equal.png'),
  ])

  const result = reconcileObjectManifests(source, destination)
  assert.deepEqual(
    Object.fromEntries(result.entries.map(entry => [entry.key, entry.state])),
    {
      'conflict.png': 'conflict',
      'destination-only.png': 'destination_only',
      'equal.png': 'equal',
      'missing.png': 'source_only',
      'unverified.png': 'unverifiable',
    }
  )
  assert.deepEqual(summarizeReconciliation(result), {
    sourceSeal: source.seal,
    destinationSeal: destination.seal,
    counts: {
      source_only: 1,
      destination_only: 1,
      equal: 1,
      conflict: 1,
      unverifiable: 1,
    },
    orphanCounts: {
      source_unknown: 4,
      source_referenced: 0,
      source_orphan: 0,
      destination_unknown: 4,
      destination_referenced: 0,
      destination_orphan: 0,
    },
    orphanReconciled: false,
    cutoverEvidenceReady: false,
    copyAllowed: false,
    deleteAllowed: false,
  })

  const reversed = reconcileObjectManifests(
    manifest('source', [...source.entries].reverse()),
    manifest('destination', [...destination.entries].reverse())
  )
  assert.deepEqual(result, reversed)
})

test('reconciliation consumes canonical clones and rejects non-canonical summaries', () => {
  const source = manifest('source', [object('clone.png')])
  const destination = manifest('destination', [object('clone.png')])
  const result = reconcileObjectManifests(source, destination)

  assert.notEqual(result.entries[0].source, source.entries[0])
  assert.notEqual(result.entries[0].destination, destination.entries[0])
  result.entries[0].source.key = 'mutated.png'
  assert.equal(source.entries[0].key, 'clone.png')

  const forged = reconcileObjectManifests(source, destination)
  forged.toJSON = () => ({})
  assert.throws(() => summarizeReconciliation(forged), /canonical|plain|field/i)

  const oversized = reconcileObjectManifests(source, destination)
  oversized.entries = new Array(MAX_RECONCILIATION_ENTRIES + 1)
  assert.throws(() => summarizeReconciliation(oversized), /too many entries/i)
})

test('historical 82-object observation is data, never an executable expected count', () => {
  const entries = Array.from({ length: 82 }, (_, index) =>
    object(`historical-${index}.png`, {
      sha256: index.toString(16).padStart(64, '0'),
    })
  )
  const observed = manifest('source', entries)
  assert.equal(summarizeObjectManifest(observed).objectCount, 82)

  const current = manifest('source', [object('current.png')])
  assert.equal(summarizeObjectManifest(current).objectCount, 1)
})

test('orphan evidence remains visible as aggregate state without exposing keys', () => {
  const source = manifest('source', [
    object('referenced.png', { orphanState: 'referenced' }),
    object('orphan.png', { orphanState: 'orphan', sha256: 'b'.repeat(64) }),
  ])
  const destination = manifest('destination', [
    object('referenced.png', { orphanState: 'referenced' }),
    object('orphan.png', { orphanState: 'orphan', sha256: 'b'.repeat(64) }),
  ])
  const summary = summarizeReconciliation(
    reconcileObjectManifests(source, destination)
  )
  assert.deepEqual(summary.orphanCounts, {
    source_unknown: 0,
    source_referenced: 1,
    source_orphan: 1,
    destination_unknown: 0,
    destination_referenced: 1,
    destination_orphan: 1,
  })
  assert.equal(summary.orphanReconciled, true)
  assert.equal(summary.cutoverEvidenceReady, true)
  assert.doesNotMatch(JSON.stringify(summary), /referenced\.png|orphan\.png/)
})

test('unknown or mismatched orphan states block reconciled cutover evidence', () => {
  const unknownSummary = summarizeReconciliation(
    reconcileObjectManifests(
      manifest('source', [object('unknown.png')]),
      manifest('destination', [object('unknown.png')])
    )
  )
  assert.equal(unknownSummary.orphanReconciled, false)
  assert.equal(unknownSummary.cutoverEvidenceReady, false)

  const mismatch = reconcileObjectManifests(
    manifest('source', [object('mismatch.png', { orphanState: 'referenced' })]),
    manifest('destination', [object('mismatch.png', { orphanState: 'orphan' })])
  )
  assert.equal(mismatch.entries[0].state, 'conflict')
  assert.deepEqual(mismatch.entries[0].reasons, ['orphan_state'])
  const mismatchSummary = summarizeReconciliation(mismatch)
  assert.equal(mismatchSummary.orphanReconciled, false)
  assert.equal(mismatchSummary.cutoverEvidenceReady, false)
  assert.equal(mismatchSummary.copyAllowed, false)
})
