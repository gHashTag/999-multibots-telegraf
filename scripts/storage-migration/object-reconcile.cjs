'use strict'

const {
  SHA256_PATTERN,
  assertCanonicalArray,
  assertExactOwnKeys,
  normalizeObjectEntry,
} = require('./object-model.cjs')
const { normalizeVerifiedObjectManifest } = require('./object-manifest.cjs')

const STATES = [
  'source_only',
  'destination_only',
  'equal',
  'conflict',
  'unverifiable',
]
const STATE_SET = new Set(STATES)
const REASON_ORDER = [
  'missing_digest',
  'size',
  'sha256',
  'mime',
  'orphan_state',
]
const REASON_SET = new Set(REASON_ORDER)
const MAX_RECONCILIATION_ENTRIES = 200_000

function comparePair(source, destination) {
  const reasons = []
  if (source.sha256 === null || destination.sha256 === null) {
    reasons.push('missing_digest')
  }
  if (source.size !== destination.size) reasons.push('size')
  if (
    source.sha256 !== null &&
    destination.sha256 !== null &&
    source.sha256 !== destination.sha256
  ) {
    reasons.push('sha256')
  }
  if (source.mime !== destination.mime) reasons.push('mime')
  if (source.orphanState !== destination.orphanState)
    reasons.push('orphan_state')
  if (reasons.includes('missing_digest')) {
    return { state: 'unverifiable', reasons }
  }
  return reasons.length
    ? { state: 'conflict', reasons }
    : { state: 'equal', reasons: [] }
}

function reconcileObjectManifests(sourceManifest, destinationManifest) {
  const normalizedSource = normalizeVerifiedObjectManifest(sourceManifest)
  const normalizedDestination =
    normalizeVerifiedObjectManifest(destinationManifest)
  if (
    normalizedSource.side !== 'source' ||
    normalizedDestination.side !== 'destination'
  ) {
    throw new TypeError(
      'Reconciliation requires source and destination manifests'
    )
  }

  const source = new Map(
    normalizedSource.entries.map(entry => [entry.objectId, entry])
  )
  const destination = new Map(
    normalizedDestination.entries.map(entry => [entry.objectId, entry])
  )
  const ids = [...new Set([...source.keys(), ...destination.keys()])].sort()
  const entries = ids.map(objectId => {
    const sourceEntry = source.get(objectId) ?? null
    const destinationEntry = destination.get(objectId) ?? null
    if (!sourceEntry) {
      return {
        objectId,
        bucket: destinationEntry.bucket,
        key: destinationEntry.key,
        state: 'destination_only',
        reasons: [],
        source: null,
        destination: destinationEntry,
      }
    }
    if (!destinationEntry) {
      return {
        objectId,
        bucket: sourceEntry.bucket,
        key: sourceEntry.key,
        state: 'source_only',
        reasons: [],
        source: sourceEntry,
        destination: null,
      }
    }
    const comparison = comparePair(sourceEntry, destinationEntry)
    return {
      objectId,
      bucket: sourceEntry.bucket,
      key: sourceEntry.key,
      ...comparison,
      source: sourceEntry,
      destination: destinationEntry,
    }
  })

  return {
    reconciliationVersion: 1,
    sourceSeal: normalizedSource.seal,
    destinationSeal: normalizedDestination.seal,
    entries,
  }
}

function normalizeNullableObjectEntry(entry, requireDigest, label) {
  if (entry === null) return null
  try {
    return normalizeObjectEntry(entry, {
      requireDigest,
      requireCanonical: true,
    })
  } catch (error) {
    throw new TypeError(`${label} is not canonical: ${error.message}`)
  }
}

function normalizeReconciliationEntry(entry) {
  assertExactOwnKeys(
    entry,
    ['objectId', 'bucket', 'key', 'state', 'reasons', 'source', 'destination'],
    'Reconciliation entry'
  )
  if (!SHA256_PATTERN.test(entry.objectId)) {
    throw new TypeError('Reconciliation objectId is invalid')
  }
  if (!STATE_SET.has(entry.state)) {
    throw new TypeError('Unknown reconciliation state')
  }
  assertCanonicalArray(
    entry.reasons,
    'reconciliation reasons',
    REASON_ORDER.length
  )
  if (
    entry.reasons.some(reason => !REASON_SET.has(reason)) ||
    entry.reasons.some(
      (reason, index) =>
        REASON_ORDER.indexOf(reason) <=
        REASON_ORDER.indexOf(entry.reasons[index - 1])
    )
  ) {
    throw new TypeError('Reconciliation reasons are not canonical')
  }
  const source = normalizeNullableObjectEntry(
    entry.source,
    true,
    'Reconciliation source'
  )
  const destination = normalizeNullableObjectEntry(
    entry.destination,
    false,
    'Reconciliation destination'
  )
  const identity = source ?? destination
  if (
    !identity ||
    entry.objectId !== identity.objectId ||
    entry.bucket !== identity.bucket ||
    entry.key !== identity.key ||
    (source && destination && source.objectId !== destination.objectId)
  ) {
    throw new TypeError('Reconciliation entry identity is not canonical')
  }
  const expected = !source
    ? { state: 'destination_only', reasons: [] }
    : !destination
      ? { state: 'source_only', reasons: [] }
      : comparePair(source, destination)
  if (
    entry.state !== expected.state ||
    entry.reasons.length !== expected.reasons.length ||
    entry.reasons.some((reason, index) => reason !== expected.reasons[index])
  ) {
    throw new TypeError('Reconciliation entry comparison is not canonical')
  }
  return {
    objectId: identity.objectId,
    bucket: identity.bucket,
    key: identity.key,
    state: expected.state,
    reasons: [...expected.reasons],
    source,
    destination,
  }
}

function normalizeReconciliation(reconciliation) {
  assertExactOwnKeys(
    reconciliation,
    ['reconciliationVersion', 'sourceSeal', 'destinationSeal', 'entries'],
    'Reconciliation'
  )
  if (reconciliation.reconciliationVersion !== 1) {
    throw new TypeError('Unsupported reconciliation version')
  }
  if (
    !SHA256_PATTERN.test(reconciliation.sourceSeal) ||
    !SHA256_PATTERN.test(reconciliation.destinationSeal)
  ) {
    throw new TypeError('Reconciliation seal is invalid')
  }
  assertCanonicalArray(
    reconciliation.entries,
    'reconciliation entries',
    MAX_RECONCILIATION_ENTRIES
  )
  const entries = reconciliation.entries.map(normalizeReconciliationEntry)
  for (let index = 1; index < entries.length; index += 1) {
    if (entries[index - 1].objectId >= entries[index].objectId) {
      throw new TypeError('Reconciliation entries are not uniquely sorted')
    }
  }
  return {
    reconciliationVersion: 1,
    sourceSeal: reconciliation.sourceSeal,
    destinationSeal: reconciliation.destinationSeal,
    entries,
  }
}

function summarizeReconciliation(reconciliation) {
  const normalized = normalizeReconciliation(reconciliation)
  const counts = Object.fromEntries(STATES.map(state => [state, 0]))
  const orphanCounts = {
    source_unknown: 0,
    source_referenced: 0,
    source_orphan: 0,
    destination_unknown: 0,
    destination_referenced: 0,
    destination_orphan: 0,
  }
  let orphanStateMismatch = false
  for (const entry of normalized.entries) {
    counts[entry.state] += 1
    if (entry.source) orphanCounts[`source_${entry.source.orphanState}`] += 1
    if (entry.destination) {
      orphanCounts[`destination_${entry.destination.orphanState}`] += 1
    }
    if (
      entry.source &&
      entry.destination &&
      entry.source.orphanState !== entry.destination.orphanState
    ) {
      orphanStateMismatch = true
    }
  }
  const orphanReconciled =
    orphanCounts.source_unknown === 0 &&
    orphanCounts.destination_unknown === 0 &&
    !orphanStateMismatch
  const copyAllowed = counts.conflict === 0 && counts.unverifiable === 0
  return {
    sourceSeal: normalized.sourceSeal,
    destinationSeal: normalized.destinationSeal,
    counts,
    orphanCounts,
    orphanReconciled,
    cutoverEvidenceReady:
      orphanReconciled && copyAllowed && counts.source_only === 0,
    copyAllowed,
    deleteAllowed: false,
  }
}

module.exports = {
  MAX_RECONCILIATION_ENTRIES,
  normalizeReconciliation,
  reconcileObjectManifests,
  summarizeReconciliation,
}
