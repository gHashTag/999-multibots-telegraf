'use strict'

const {
  SHA256_PATTERN,
  assertCanonicalArray,
  assertExactOwnKeys,
  compareObjectEntries,
  normalizeObjectEntry,
  sha256Json,
} = require('./object-model.cjs')
const { isDeepStrictEqual } = require('node:util')

const MANIFEST_VERSION = 1
const MAX_MANIFEST_ENTRIES = 100_000
const SIDES = new Set(['source', 'destination'])

function normalizeCapturedAt(value) {
  if (
    typeof value !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)
  ) {
    throw new TypeError('capturedAt must be an explicit UTC timestamp')
  }
  if (new Date(value).toISOString() !== value) {
    throw new TypeError('capturedAt is invalid')
  }
  return value
}

function manifestPayload(input, { requireCanonicalEntries = false } = {}) {
  if (!SIDES.has(input.side))
    throw new TypeError('manifest side is unsupported')
  if (
    Array.isArray(input.entries) &&
    input.entries.length > MAX_MANIFEST_ENTRIES
  ) {
    throw new TypeError('Object manifest has too many manifest entries')
  }
  assertCanonicalArray(input.entries, 'manifest entries', MAX_MANIFEST_ENTRIES)
  const normalized = input.entries
    .map(entry =>
      normalizeObjectEntry(entry, {
        requireDigest: input.side === 'source',
        requireCanonical: requireCanonicalEntries,
      })
    )
    .sort(compareObjectEntries)
  const seen = new Set()
  for (const entry of normalized) {
    if (seen.has(entry.objectId)) {
      throw new TypeError('Duplicate object in manifest')
    }
    seen.add(entry.objectId)
  }
  return {
    manifestVersion: MANIFEST_VERSION,
    side: input.side,
    capturedAt: normalizeCapturedAt(input.capturedAt),
    entries: normalized,
  }
}

function createObjectManifest(input) {
  assertExactOwnKeys(
    input,
    ['side', 'capturedAt', 'entries'],
    'Object manifest input'
  )
  const payload = manifestPayload(input)
  return { ...payload, seal: sha256Json(payload) }
}

function normalizeVerifiedObjectManifest(manifest) {
  assertExactOwnKeys(
    manifest,
    ['manifestVersion', 'side', 'capturedAt', 'entries', 'seal'],
    'Object manifest'
  )
  if (manifest.manifestVersion !== MANIFEST_VERSION) {
    throw new TypeError('Unsupported object manifest version')
  }
  if (!SHA256_PATTERN.test(manifest.seal)) {
    throw new TypeError('Object manifest seal is invalid')
  }
  const payload = manifestPayload(manifest, { requireCanonicalEntries: true })
  const expected = sha256Json(payload)
  if (manifest.seal !== expected)
    throw new Error('Object manifest seal mismatch')
  const normalized = { ...payload, seal: expected }
  if (!isDeepStrictEqual(manifest, normalized)) {
    throw new TypeError('Object manifest is not canonical')
  }
  return normalized
}

function verifyObjectManifest(manifest) {
  normalizeVerifiedObjectManifest(manifest)
  return true
}

function summarizeObjectManifest(manifest) {
  const normalized = normalizeVerifiedObjectManifest(manifest)
  const totalBytes = normalized.entries.reduce(
    (total, entry) => total + BigInt(entry.size),
    0n
  )
  return {
    manifestVersion: MANIFEST_VERSION,
    side: normalized.side,
    objectCount: normalized.entries.length,
    totalBytes: totalBytes.toString(),
    seal: normalized.seal,
  }
}

module.exports = {
  MANIFEST_VERSION,
  MAX_MANIFEST_ENTRIES,
  createObjectManifest,
  normalizeVerifiedObjectManifest,
  summarizeObjectManifest,
  verifyObjectManifest,
}
