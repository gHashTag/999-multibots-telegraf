'use strict'

const { createHash } = require('node:crypto')
const { isDeepStrictEqual } = require('node:util')

const SHA256_PATTERN = /^[a-f0-9]{64}$/
const DECIMAL_PATTERN = /^(?:0|[1-9][0-9]*)$/
const ORPHAN_STATES = new Set(['unknown', 'referenced', 'orphan'])
const MAX_SAFE_OBJECT_SIZE = BigInt(Number.MAX_SAFE_INTEGER)
const MAX_BUCKET_BYTES = 63
const MAX_KEY_BYTES = 1_024
const MAX_VERSION_BYTES = 1_024
const MAX_MIME_BYTES = 255
const MAX_CANONICAL_ARRAY_LENGTH = 200_000
const MAX_CANONICAL_DEPTH = 8
const MAX_CANONICAL_NODES = 1_000_000
const MAX_CANONICAL_STRING_BYTES = 16 * 1024 * 1024
const CANONICAL_FIELD_ORDERS = [
  ['manifestVersion', 'side', 'capturedAt', 'entries'],
  [
    'objectId',
    'bucket',
    'key',
    'size',
    'sha256',
    'mime',
    'version',
    'orphanState',
  ],
  ['header', 'records'],
  ['ledgerVersion', 'sourceSeal', 'destinationSeal', 'createdAt'],
  ['index', 'previousDigest', 'objectId', 'action', 'recordedAt'],
]

function hasPropertyDescriptorInChain(value, property) {
  let current = value
  while (current !== null) {
    if (Object.getOwnPropertyDescriptor(current, property)) return true
    current = Object.getPrototypeOf(current)
  }
  return false
}

function assertNoToJSON(value, label) {
  if (hasPropertyDescriptorInChain(value, 'toJSON')) {
    throw new TypeError(`${label} has a non-canonical toJSON property`)
  }
}

function assertPlainObject(value, label) {
  if (
    value === null ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype
  ) {
    throw new TypeError(`${label} must be a plain object`)
  }
  assertNoToJSON(value, label)
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== 'string') {
      throw new TypeError(`${label} contains a non-canonical field`)
    }
    const descriptor = Object.getOwnPropertyDescriptor(value, key)
    if (!descriptor?.enumerable || !Object.hasOwn(descriptor, 'value')) {
      throw new TypeError(`${label} contains a non-canonical field`)
    }
  }
  return value
}

function assertExactOwnKeys(value, expectedKeys, label) {
  assertPlainObject(value, label)
  const actualKeys = Object.keys(value).sort()
  const canonicalKeys = [...expectedKeys].sort()
  if (!isDeepStrictEqual(actualKeys, canonicalKeys)) {
    throw new TypeError(`${label} has a non-canonical field set`)
  }
  return value
}

function assertAllowedOwnKeys(value, requiredKeys, allowedKeys, label) {
  assertPlainObject(value, label)
  const actualKeys = Object.keys(value)
  if (
    requiredKeys.some(key => !Object.hasOwn(value, key)) ||
    actualKeys.some(key => !allowedKeys.includes(key))
  ) {
    throw new TypeError(`${label} has a non-canonical field set`)
  }
  return value
}

function assertCanonicalArray(value, label, maxLength) {
  if (!Array.isArray(value)) throw new TypeError(`${label} must be an array`)
  if (Object.getPrototypeOf(value) !== Array.prototype) {
    throw new TypeError(`${label} has a non-canonical array prototype`)
  }
  assertNoToJSON(value, label)
  if (value.length > maxLength)
    throw new TypeError(`${label} has too many entries`)
  const ownKeys = Reflect.ownKeys(value)
  if (ownKeys.some(key => typeof key === 'symbol')) {
    throw new TypeError(`${label} is not a canonical array`)
  }
  const enumerableKeys = Object.keys(value)
  if (
    enumerableKeys.length !== value.length ||
    enumerableKeys.some((key, index) => key !== String(index)) ||
    ownKeys.some(key => key !== 'length' && !/^(?:0|[1-9][0-9]*)$/.test(key)) ||
    enumerableKeys.some(key => {
      const descriptor = Object.getOwnPropertyDescriptor(value, key)
      return !descriptor?.enumerable || !Object.hasOwn(descriptor, 'value')
    })
  ) {
    throw new TypeError(
      `${label} is not a canonical array or contains an accessor`
    )
  }
  return value
}

function canonicalDecimal(value, label, { max = null } = {}) {
  if (!['string', 'number', 'bigint'].includes(typeof value)) {
    throw new TypeError(`${label} must be an unsigned decimal string`)
  }
  if (
    typeof value === 'number' &&
    (!Number.isSafeInteger(value) || value < 0)
  ) {
    throw new TypeError(`${label} must be a safe unsigned integer`)
  }
  const text = typeof value === 'bigint' ? value.toString() : String(value)
  if (!DECIMAL_PATTERN.test(text)) {
    throw new TypeError(`${label} must be an unsigned decimal string`)
  }
  const integer = BigInt(text)
  if (max !== null && integer > max) {
    throw new TypeError(`${label} exceeds the safe size limit`)
  }
  return integer.toString()
}

function requiredText(value, label, maxBytes) {
  if (typeof value !== 'string' || value.length === 0) {
    throw new TypeError(`${label} must be a non-empty string`)
  }
  if (/[\x00-\x1f\x7f]/.test(value)) {
    throw new TypeError(`${label} contains a control character`)
  }
  if (maxBytes !== undefined && Buffer.byteLength(value, 'utf8') > maxBytes) {
    throw new TypeError(`${label} exceeds ${maxBytes} bytes`)
  }
  return value
}

function canonicalObjectId(bucket, key) {
  const framed = `${Buffer.byteLength(bucket, 'utf8')}:${bucket}${Buffer.byteLength(key, 'utf8')}:${key}`
  return createHash('sha256').update(framed, 'utf8').digest('hex')
}

function normalizeObjectEntry(
  entry,
  { requireDigest = true, requireCanonical = false } = {}
) {
  const canonicalKeys = [
    'objectId',
    'bucket',
    'key',
    'size',
    'sha256',
    'mime',
    'version',
    'orphanState',
  ]
  if (requireCanonical) {
    assertExactOwnKeys(entry, canonicalKeys, 'Object entry')
  } else {
    assertAllowedOwnKeys(
      entry,
      ['bucket', 'key', 'size', 'sha256', 'mime'],
      canonicalKeys,
      'Object entry'
    )
  }
  const bucket = requiredText(
    entry.bucket,
    'bucket',
    MAX_BUCKET_BYTES
  ).toLowerCase()
  if (!/^[a-z0-9][a-z0-9._-]*$/.test(bucket)) {
    throw new TypeError('bucket contains unsupported characters')
  }
  const key = requiredText(entry.key, 'key', MAX_KEY_BYTES)
  if (
    key.startsWith('/') ||
    key.includes('\\') ||
    key.split('/').some(segment => segment === '.' || segment === '..')
  ) {
    throw new TypeError('key is not a canonical object path')
  }
  const size = canonicalDecimal(entry.size, 'size', {
    max: MAX_SAFE_OBJECT_SIZE,
  })
  if (entry.sha256 != null && typeof entry.sha256 !== 'string') {
    throw new TypeError('sha256 must be a lowercase SHA-256 digest')
  }
  const sha256 = entry.sha256 == null ? null : entry.sha256.toLowerCase()
  if (
    (requireDigest && sha256 === null) ||
    (sha256 !== null && !SHA256_PATTERN.test(sha256))
  ) {
    throw new TypeError('sha256 must be a lowercase SHA-256 digest')
  }
  const mime = requiredText(entry.mime, 'mime', MAX_MIME_BYTES)
    .trim()
    .toLowerCase()
  if (!/^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/.test(mime)) {
    throw new TypeError('mime must be a canonical media type')
  }
  const version =
    entry.version == null
      ? null
      : requiredText(entry.version, 'version', MAX_VERSION_BYTES)
  const orphanState = entry.orphanState ?? 'unknown'
  if (!ORPHAN_STATES.has(orphanState)) {
    throw new TypeError('orphanState is unsupported')
  }

  const objectId = canonicalObjectId(bucket, key)
  if (entry.objectId != null && entry.objectId !== objectId) {
    throw new TypeError('objectId does not match bucket/key')
  }

  const normalized = {
    objectId,
    bucket,
    key,
    size,
    sha256,
    mime,
    version,
    orphanState,
  }
  if (requireCanonical && !isDeepStrictEqual(entry, normalized)) {
    throw new TypeError('Object entry is not canonical')
  }
  return normalized
}

function compareObjectEntries(left, right) {
  return Buffer.compare(
    Buffer.from(`${left.bucket}\0${left.key}`, 'utf8'),
    Buffer.from(`${right.bucket}\0${right.key}`, 'utf8')
  )
}

function quoteJsonString(value) {
  if (Buffer.byteLength(value, 'utf8') > MAX_CANONICAL_STRING_BYTES) {
    throw new TypeError('Canonical JSON string exceeds the size limit')
  }
  let output = '"'
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index)
    if (code === 0x22) output += '\\"'
    else if (code === 0x5c) output += '\\\\'
    else if (code === 0x08) output += '\\b'
    else if (code === 0x0c) output += '\\f'
    else if (code === 0x0a) output += '\\n'
    else if (code === 0x0d) output += '\\r'
    else if (code === 0x09) output += '\\t'
    else if (code < 0x20) output += `\\u${code.toString(16).padStart(4, '0')}`
    else if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(index + 1)
      if (next >= 0xdc00 && next <= 0xdfff) {
        output += value[index] + value[index + 1]
        index += 1
      } else {
        output += `\\u${code.toString(16).padStart(4, '0')}`
      }
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      output += `\\u${code.toString(16).padStart(4, '0')}`
    } else output += value[index]
  }
  return `${output}"`
}

function sameFieldSet(keys, order) {
  return keys.length === order.length && order.every(key => keys.includes(key))
}

function orderedCanonicalKeys(value) {
  const keys = Object.keys(value)
  const compatibleOrder = CANONICAL_FIELD_ORDERS.find(order =>
    sameFieldSet(keys, order)
  )
  if (compatibleOrder) return compatibleOrder
  return [...keys].sort((left, right) =>
    Buffer.compare(Buffer.from(left, 'utf8'), Buffer.from(right, 'utf8'))
  )
}

function canonicalJson(value, state, depth) {
  if (depth > MAX_CANONICAL_DEPTH) {
    throw new TypeError('Canonical JSON exceeds the depth limit')
  }
  state.nodes += 1
  if (state.nodes > MAX_CANONICAL_NODES) {
    throw new TypeError('Canonical JSON exceeds the node limit')
  }
  if (value === null) return 'null'
  if (typeof value === 'string') return quoteJsonString(value)
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  if (typeof value === 'number') {
    if (!Number.isFinite(value))
      throw new TypeError('Canonical JSON number is invalid')
    return Object.is(value, -0) ? '0' : String(value)
  }
  if (typeof value !== 'object') {
    throw new TypeError('Canonical JSON contains an unsupported value')
  }
  if (state.ancestors.has(value))
    throw new TypeError('Canonical JSON contains a cycle')
  state.ancestors.add(value)
  try {
    if (Array.isArray(value)) {
      assertCanonicalArray(
        value,
        'Canonical JSON array',
        MAX_CANONICAL_ARRAY_LENGTH
      )
      return `[${value.map(item => canonicalJson(item, state, depth + 1)).join(',')}]`
    }
    assertPlainObject(value, 'Canonical JSON object')
    const fields = orderedCanonicalKeys(value).map(
      key =>
        `${quoteJsonString(key)}:${canonicalJson(value[key], state, depth + 1)}`
    )
    return `{${fields.join(',')}}`
  } finally {
    state.ancestors.delete(value)
  }
}

function sha256Json(value) {
  const serialized = canonicalJson(value, { ancestors: new Set(), nodes: 0 }, 0)
  return createHash('sha256').update(serialized, 'utf8').digest('hex')
}

module.exports = {
  MAX_BUCKET_BYTES,
  MAX_KEY_BYTES,
  MAX_MIME_BYTES,
  MAX_SAFE_OBJECT_SIZE,
  MAX_VERSION_BYTES,
  SHA256_PATTERN,
  assertAllowedOwnKeys,
  assertCanonicalArray,
  assertExactOwnKeys,
  assertPlainObject,
  canonicalDecimal,
  canonicalObjectId,
  compareObjectEntries,
  normalizeObjectEntry,
  sha256Json,
}
